const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const puppeteer = require('puppeteer');

/**
 * Screenshots the first report block of a tab from Google's HTML export, so the
 * image keeps the sheet's real colours, borders and wrapped text.
 *
 * The block runs from the top of the tab down to the first TOTAL SALES row,
 * and from column A to `lastColumn` (1-based, e.g. 13 = M). Returns a base64 PNG.
 * Pass an existing Puppeteer browser to reuse it (e.g. the WhatsApp one).
 */
async function captureReport(zipBuffer, tabName, lastColumn, browser) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-export-'));
  const ownBrowser = !browser;
  let page;
  try {
    new AdmZip(zipBuffer).extractAllTo(dir, true);
    // Export file names keep the tab name as is, including stray spaces
    const htmlName = fs.readdirSync(dir).find((f) => f.endsWith('.html') && f.slice(0, -5).trim() === tabName.trim());
    if (!htmlName) throw new Error(`Tab "${tabName}" missing from the target export`);
    const htmlFile = path.join(dir, htmlName);

    if (ownBrowser) {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.CHROME_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.goto(`file:///${htmlFile.replace(/\\/g, '/')}`, { waitUntil: 'load' });

    // The top title ("PHONE REPAIR PRO") sits over row 1 rather than in a cell, so the
    // export leaves that row blank. Copy the same title cell from the tab's lower block.
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('table tbody tr')];
      const topCell = rows[0] && rows[0].querySelector('td');
      if (!topCell || topCell.innerText.trim()) return;
      const title = rows.slice(1).map((r) => r.querySelector('td')).find((c) => c && c.colSpan > 1 && c.innerText.trim() === 'PHONE REPAIR PRO');
      if (!title) return;
      topCell.className = title.className;
      topCell.innerHTML = title.innerHTML;
    });

    // Make the viewport as big as the table so every row is painted
    const size = await page.evaluate(() => {
      const t = document.querySelector('table');
      return { width: Math.ceil(t.scrollWidth) + 20, height: Math.ceil(t.scrollHeight) + 20 };
    });
    await page.setViewport({ ...size, deviceScaleFactor: 2 });

    const clip = await page.evaluate((lastColumn) => {
      const rows = [...document.querySelectorAll('table tbody tr')];
      // Data cells only; the export puts the row number in a <th>
      const text = (r) => [...r.querySelectorAll('td')].map((c) => c.innerText).join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
      const end = rows.findIndex((r) => text(r).startsWith('TOTAL SALES'));
      if (end < 0) return null;
      // Right edge of column `lastColumn`, taken from the first row whose cells aren't merged
      const plain = rows.find((r) => r.querySelectorAll('td').length >= lastColumn && ![...r.querySelectorAll('td')].some((c) => c.colSpan > 1));
      const firstCell = plain.querySelectorAll('td')[0].getBoundingClientRect();
      const lastCell = plain.querySelectorAll('td')[lastColumn - 1].getBoundingClientRect();
      const top = rows[0].getBoundingClientRect().top;
      return { x: firstCell.left, y: top, width: lastCell.right - firstCell.left + 1, height: rows[end].getBoundingClientRect().bottom - top + 1 };
    }, lastColumn);
    if (!clip) throw new Error(`No TOTAL SALES row found in tab "${tabName}"`);

    return await page.screenshot({ clip, encoding: 'base64' });
  } finally {
    if (page) await page.close();
    if (ownBrowser && browser) await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { captureReport };
