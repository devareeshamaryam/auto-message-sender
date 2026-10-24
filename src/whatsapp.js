const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const log = require('./logger');

let client;
let readyPromise;

/** Starts WhatsApp Web. First run prints a QR code to scan; the session is then saved in .wwebjs_auth. */
function startWhatsApp() {
  if (readyPromise) return readyPromise;

  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      executablePath: process.env.CHROME_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  readyPromise = new Promise((resolve, reject) => {
    client.on('qr', (qr) => {
      log.info('Scan this QR code with WhatsApp (Settings > Linked devices):');
      qrcode.generate(qr, { small: true });
    });
    client.on('ready', () => {
      log.info('WhatsApp client ready');
      resolve(client);
    });
    client.on('auth_failure', (msg) => reject(new Error(`WhatsApp auth failed: ${msg}`)));
    client.on('disconnected', (reason) => log.warn('WhatsApp disconnected:', reason));
  });

  client.initialize();
  return readyPromise;
}

/** Resolves a group/channel by ID (contains "@") or by exact name. */
async function resolveChatId(target) {
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

async function sendImage(target, base64Png, caption) {
  await startWhatsApp();
  const chatId = await resolveChatId(target);
  const media = new MessageMedia('image/png', base64Png, 'sheet.png');
  await client.sendMessage(chatId, media, { caption });
  log.info(`Screenshot sent to ${chatId}`);
}

/** The Chrome instance WhatsApp is running in, reused for screenshots. */
function getBrowser() {
  return client && client.pupBrowser;
}

module.exports = { startWhatsApp, sendMessage, sendImage, getBrowser };
