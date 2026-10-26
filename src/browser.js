const fs = require('fs');
const log = require('./logger');

let warned = false;

/**
 * Chrome to launch: CHROME_PATH if that file exists, otherwise Puppeteer's own
 * Chromium. A .env copied from Windows to a Linux server keeps working.
 */
function chromePath() {
  const configured = process.env.CHROME_PATH;
  if (!configured) return undefined;
  if (fs.existsSync(configured)) return configured;
  if (!warned) {
    log.warn(`CHROME_PATH "${configured}" not found, using Puppeteer's bundled Chromium`);
    warned = true;
  }
  return undefined;
}

module.exports = { chromePath };
