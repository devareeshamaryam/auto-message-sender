// Lists your WhatsApp groups with their IDs, using the same saved session as the bot.
// Reads WhatsApp Web's chat store directly: client.getChats() fails on current
// WhatsApp Web with whatsapp-web.js 1.34.7.
const { startWhatsApp } = require('./whatsapp');
const log = require('./logger');

(async () => {
  const client = await startWhatsApp();
  const groups = await client.pupPage.evaluate(() => window.require('WAWebCollections').Chat.getModelsArray()
    .filter((c) => c.id && c.id.server === 'g.us')
    .map((c) => ({ name: c.formattedTitle || c.name || (c.groupMetadata && c.groupMetadata.subject) || '(no name)', id: c.id._serialized })));

  console.log('\nGroups (put the ID in WHATSAPP_TARGET in .env):');
  groups.forEach((g) => console.log(`  ${g.name}  ->  ${g.id}`));
  process.exit(0);
})().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
