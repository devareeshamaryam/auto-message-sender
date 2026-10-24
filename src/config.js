const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required setting ${name} in .env`);
  return value;
}

function digitsOnly(value) {
  return String(value).replace(/\D/g, '');
}

/**
 * A plain phone number (e.g. 923198414042 or +92 319 8414042) becomes "<number>@c.us".
 * Full IDs ("...@g.us" groups, "...@c.us", "...@newsletter") are used as they are.
 * Anything else is treated as an exact group name.
 */
function normaliseTarget(value) {
  const v = value.trim();
  if (v.includes('@')) return v;
  if (/^\+?[\d\s-]+$/.test(v)) return `${digitsOnly(v)}@c.us`;
  return v;
}

module.exports = {
  google: {
    keyFile: path.resolve(__dirname, '..', process.env.GOOGLE_SERVICE_ACCOUNT_FILE || './credentials/service-account.json'),
    targetId: () => required('TARGET_SPREADSHEET_ID'),
    // Tab the bot fills and screenshots (matched ignoring case and spaces)
    hourlyTab: process.env.HOURLY_TAB || 'HOURLY',
    // Screenshot goes from column A to this column (13 = M, TOTAL)
    hourlyLastColumn: parseInt(process.env.HOURLY_LAST_COLUMN || '13', 10),
  },
  // Each store's daily sales sheet, and the label of its row in the HOURLY tab
  stores: [
    { name: 'Bellfort', sourceId: () => required('BELLFORT_SPREADSHEET_ID'), hourlyLabel: process.env.BELLFORT_HOURLY_LABEL || 'BELLFORT AVE' },
    { name: 'Shaver', sourceId: () => required('SHAVER_SPREADSHEET_ID'), hourlyLabel: process.env.SHAVER_HOURLY_LABEL || 'SHAVER ST' },
  ],
  whatsapp: {
    target: () => normaliseTarget(required('WHATSAPP_TARGET')),
    // Number of the account expected to be linked (safety check only; login is by QR code)
    sender: () => digitsOnly(required('WHATSAPP_SENDER')),
  },
  schedule: {
    cron: process.env.CRON_SCHEDULE || '0 0-18 * * *',
    timezone: process.env.TIMEZONE || 'Asia/Karachi',
    runOnStart: process.env.RUN_ON_START === 'true',
    // Runs before this hour report the previous day, so the midnight run sends the finished day
    previousDayBeforeHour: parseInt(process.env.PREVIOUS_DAY_BEFORE_HOUR || '1', 10),
  },
};
