const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required setting ${name} in .env`);
  return value;
}

module.exports = {
  google: {
    keyFile: path.resolve(__dirname, '..', process.env.GOOGLE_SERVICE_ACCOUNT_FILE || './credentials/service-account.json'),
    targetId: () => required('TARGET_SPREADSHEET_ID'),
    targetTab: process.env.TARGET_TAB || 'data entry',
  },
  // Each store's daily sales sheet, and the title of its table in the target tab
  stores: [
    { name: 'Bellfort', sourceId: () => required('BELLFORT_SPREADSHEET_ID'), targetTitle: process.env.BELLFORT_TARGET_TITLE || 'PHONE REPAIR STORE' },
    { name: 'Shaver', sourceId: () => required('SHAVER_SPREADSHEET_ID'), targetTitle: process.env.SHAVER_TARGET_TITLE || 'SHAVER STORE' },
  ],
  whatsapp: {
    target: () => required('WHATSAPP_TARGET'),
  },
  schedule: {
    cron: process.env.CRON_SCHEDULE || '0 0-18 * * *',
    timezone: process.env.TIMEZONE || 'Asia/Karachi',
    runOnStart: process.env.RUN_ON_START === 'true',
    // Runs before this hour report the previous day, so the midnight run sends the finished day
    previousDayBeforeHour: parseInt(process.env.PREVIOUS_DAY_BEFORE_HOUR || '1', 10),
  },
};
