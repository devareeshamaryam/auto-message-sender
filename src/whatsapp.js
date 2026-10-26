const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const { saveQrImage, deleteQrImage } = require('./qrImage');
const log = require('./logger');

let client;
let readyPromise;

/**
 * Starts WhatsApp Web. First run prints a QR code to scan; the session is then
 * saved in .wwebjs_auth and reused by every command. Rejects if the linked
 * account is not WHATSAPP_SENDER, so nothing is ever sent from the wrong number.
 */
function startWhatsApp() {
  if (readyPromise) return readyPromise;
  const expected = config.whatsapp.sender();

  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      executablePath: process.env.CHROME_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });
  const self = client;

  readyPromise = new Promise((resolve, reject) => {
    client.on('qr', (qr) => {
      log.info('Scan this QR code with WhatsApp (Settings > Linked devices):');
      qrcode.generate(qr, { small: true });
      saveQrImage(qr)
        .then(() => { if (authenticated) deleteQrImage(); })
        .catch((err) => log.warn('Could not save QR image:', err.message));
    });
    let authenticated = false;
    client.on('authenticated', () => {
      authenticated = true;
      deleteQrImage();
    });
    client.on('ready', async () => {
      deleteQrImage();
      const linked = client.info && client.info.wid && client.info.wid.user;
      if (linked !== expected) {
        await client.destroy().catch(() => {});
        reject(new Error(
          `Wrong WhatsApp account linked: ${linked || 'unknown'} is linked, but WHATSAPP_SENDER is ${expected}. ` +
          'Nothing was sent. Unlink it on the phone (Settings > Linked devices), delete the .wwebjs_auth folder, and scan the QR with the right phone.',
        ));
        return;
      }
      try {
        await patchMediaSend();
      } catch (err) {
        log.warn('Could not apply media-send fix:', err.message);
      }
      const target = process.env.WHATSAPP_TARGET ? config.whatsapp.target() : '(WHATSAPP_TARGET not set)';
      log.info(`Logged in as ${linked}, sending to ${target}`);
      resolve(client);
    });
    client.on('auth_failure', (msg) => reject(new Error(`WhatsApp auth failed: ${msg}`)));
    client.on('disconnected', (reason) => {
      // Start fresh on the next send instead of reusing a dead client
      log.warn('WhatsApp disconnected:', reason);
      if (client === self) readyPromise = null;
    });
  });
  // A failed start must not stick: let the next call try again
  const pending = readyPromise;
  pending.catch(() => { if (readyPromise === pending) readyPromise = null; });

  client.initialize().catch((err) => log.error('WhatsApp failed to start:', err.message));
  return readyPromise;
}

/** True if the WhatsApp browser is still connected and logged in (it isn't after the PC sleeps). */
async function isAlive() {
  if (!client || !client.pupBrowser || !client.pupBrowser.connected || !client.pupPage || client.pupPage.isClosed()) return false;
  try {
    const state = await Promise.race([
      client.getState(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    return state === 'CONNECTED';
  } catch {
    return false;
  }
}

/** Closes the old WhatsApp browser and logs in again from the saved session. */
async function reconnect() {
  log.warn('Reconnecting WhatsApp...');
  const old = client;
  client = null;
  readyPromise = null;
  if (old) {
    await old.destroy().catch(() => {});
    const proc = old.pupBrowser && old.pupBrowser.process && old.pupBrowser.process();
    if (proc && !proc.killed) proc.kill();
  }
  return Promise.race([
    startWhatsApp(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('WhatsApp did not reconnect within 2 minutes (QR scan needed?)')), 120000)),
  ]);
}

/** Makes sure WhatsApp is usable before a run, reconnecting if the connection died. */
async function ensureWhatsApp() {
  if (await isAlive()) return client;
  return reconnect();
}

/**
 * Works around whatsapp-web.js 1.34.7 failing every media send with "Data passed to
 * getter must include an id property": the MediaData model's internal __x_id is
 * spread into the outgoing message and overwrites its id. Same fix as upstream
 * PR #201923, applied at runtime so it survives npm install. Hiding the field
 * from the spread (instead of deleting it) keeps the media model itself intact.
 * Remove once a whatsapp-web.js release includes the fix.
 */
async function patchMediaSend() {
  await client.pupPage.evaluate(() => {
    const original = window.WWebJS.processMediaData;
    if (!original || original.__idPatched) return;
    const patched = async (...args) => {
      const media = await original(...args);
      if (media && Object.prototype.hasOwnProperty.call(media, '__x_id')) {
        Object.defineProperty(media, '__x_id', { enumerable: false });
      }
      return media;
    };
    patched.__idPatched = true;
    window.WWebJS.processMediaData = patched;
  });
}

/** Resolves a group/channel by ID (contains "@") or by exact name. */
async function resolveChatId(target) {
  if (target.endsWith('@c.us')) {
    const number = await client.getNumberId(target.replace('@c.us', ''));
    if (!number) throw new Error(`${target.replace('@c.us', '')} is not a WhatsApp number`);
    return number._serialized;
  }
  if (target.includes('@')) return target;

  const chats = await client.getChats();
  const match = chats.find((c) => c.name === target);
  if (match) return match.id._serialized;

  if (typeof client.getChannels === 'function') {
    const channels = await client.getChannels();
    const channel = channels.find((c) => c.name === target);
    if (channel) return channel.id._serialized;
  }
  throw new Error(`WhatsApp group/channel "${target}" not found. Run "npm run list-chats" to see IDs.`);
}

/**
 * Waits until WhatsApp's server has accepted the message (ack >= 1, one grey tick).
 * sendMessage() returns as soon as the message is queued; group messages need
 * encryption keys set up first, so a process that exits straight away loses them.
 */
async function waitForServerAck(chatId, msg, sentAfterMs, timeoutMs = 60000) {
  // For groups in LID mode the library returns no message, so fall back to the
  // newest message we sent in that chat since the send started
  const id = msg && msg.id && msg.id._serialized;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ack = await client.pupPage.evaluate((msgId, chat, sentAfter) => {
      const C = window.require('WAWebCollections');
      if (msgId) {
        const m = C.Msg.get(msgId);
        if (m) return m.ack;
      }
      const c = C.Chat.get(chat);
      const mine = c ? c.msgs.getModelsArray().filter((m) => m.id.fromMe && m.t * 1000 >= sentAfter - 2000) : [];
      return mine.length ? mine[mine.length - 1].ack : null;
    }, id || null, chatId, sentAfterMs);
    if (ack >= 1) return;
    if (ack === -1) throw new Error('WhatsApp rejected the message');
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Not retried: the queued message may still go out later and arrive twice
  const err = new Error(`Message not confirmed by WhatsApp within ${timeoutMs / 1000}s (bot number in the group and allowed to post?)`);
  err.noRetry = true;
  throw err;
}

async function sendMessage(target, text) {
  await startWhatsApp();
  const chatId = await resolveChatId(target);
  const started = Date.now();
  const msg = await client.sendMessage(chatId, text);
  await waitForServerAck(chatId, msg, started);
  log.info(`Message sent to ${chatId}`);
}

/** Sends the image; if that fails (e.g. a dead connection), reconnects and tries once more. */
async function sendImage(target, base64Png, caption) {
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureWhatsApp();
      const chatId = await resolveChatId(target);
      const media = new MessageMedia('image/png', base64Png, 'sheet.png');
      const started = Date.now();
      const msg = await client.sendMessage(chatId, media, { caption });
      await waitForServerAck(chatId, msg, started);
      log.info(`Screenshot sent to ${chatId}`);
      return;
    } catch (err) {
      if (attempt >= 2 || err.noRetry) throw err;
      log.warn(`Sending failed (${err.message}), reconnecting and retrying`);
      await reconnect();
    }
  }
}

/** The Chrome instance WhatsApp is running in, reused for screenshots. */
function getBrowser() {
  return client && client.pupBrowser;
}

module.exports = { startWhatsApp, sendMessage, sendImage, getBrowser };
