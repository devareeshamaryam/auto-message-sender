const { startWhatsApp } = require('./whatsapp');
const { runJob } = require('./job');
const { startScheduler } = require('./scheduler');
const log = require('./logger');

async function main() {
  await startWhatsApp();

  if (process.argv.includes('--now')) {
    try {
      await runJob();
      process.exit(0);
    } catch (err) {
      log.error('Run failed:', err.message);
      process.exit(1);
    }
  }

  await startScheduler();
}

process.on('unhandledRejection', (err) => log.error('Unhandled:', err));

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
