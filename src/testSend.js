// Checks the WhatsApp link: sends "Test from bot" to WHATSAPP_TARGET, then exits.
const config = require('./config');
const { startWhatsApp, sendMessage } = require('./whatsapp');
const log = require('./logger');

(async () => {
  await startWhatsApp();
  for (const target of config.whatsapp.targets()) await sendMessage(target, 'Test from bot');
  log.info('Test message sent. WhatsApp link works.');
  process.exit(0);
})().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
