// Lists your WhatsApp groups and channels with their IDs, using the same saved session as the bot.
const { startWhatsApp } = require('./whatsapp');
const log = require('./logger');

(async () => {
  const client = await startWhatsApp();
  const chats = await client.getChats();
  console.log('\nGroups:');
  chats.filter((c) => c.isGroup).forEach((c) => console.log(`  ${c.name}  ->  ${c.id._serialized}`));

  if (typeof client.getChannels === 'function') {
    const channels = await client.getChannels();
    console.log('\nChannels:');
    channels.forEach((c) => console.log(`  ${c.name}  ->  ${c.id._serialized}`));
  }
  process.exit(0);
})().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
