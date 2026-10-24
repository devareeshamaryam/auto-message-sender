const cron = require('node-cron');
const config = require('./config');
const { startWhatsApp } = require('./whatsapp');
const { runJob } = require('./job');
const log = require('./logger');

async function main() {
  await startWhatsApp();

  if (process.argv.includes('--now')) {
    await runJob();
    process.exit(0);
  }

  if (!cron.validate(config.schedule.cron)) {
    throw new Error(`Invalid CRON_SCHEDULE: ${config.schedule.cron}`);
  }
  cron.schedule(config.schedule.cron, runJob, { timezone: config.schedule.timezone });
  log.info(`Scheduled "${config.schedule.cron}" (${config.schedule.timezone}). Waiting for next run...`);

  if (config.schedule.runOnStart) await runJob();
}

process.on('unhandledRejection', (err) => log.error('Unhandled:', err));

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
