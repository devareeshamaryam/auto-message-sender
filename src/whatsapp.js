const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
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
    });
    client.on('ready', async () => {
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

async function sendMessage(target, text) {
  await startWhatsApp();
  const chatId = await resolveChatId(target);
  await client.sendMessage(chatId, text);
  log.info(`Message sent to ${chatId}`);
}

/** Sends the image; if that fails (e.g. a dead connection), reconnects and tries once more. */
async function sendImage(target, base64Png, caption) {
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureWhatsApp();
      const chatId = await resolveChatId(target);
      const media = new MessageMedia('image/png', base64Png, 'sheet.png');
      await client.sendMessage(chatId, media, { caption });
      log.info(`Screenshot sent to ${chatId}`);
      return;
    } catch (err) {
      if (attempt >= 2) throw err;
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
