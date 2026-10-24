const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const puppeteer = require('puppeteer');

/**
 * Screenshots store tables from a tab of Google's HTML export, so the image
 * keeps the sheet's real colours, borders and wrapped text.
 *
 * Each section runs from the row containing its title (e.g. "SHAVER STORE")
 * down to the next TOTAL SALES row. Returns [{ title, image }] with base64 PNGs.
 * Pass an existing Puppeteer browser to reuse it (e.g. the WhatsApp one).
 */
async function captureTables(zipBuffer, tabName, titles, browser) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-export-'));
  const ownBrowser = !browser;
  let page;
  try {
    new AdmZip(zipBuffer).extractAllTo(dir, true);
    const htmlFile = path.join(dir, `${tabName}.html`);
    if (!fs.existsSync(htmlFile)) throw new Error(`Tab "${tabName}" missing from the target export`);

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

    // Make the viewport as big as the table so every row is painted
    const size = await page.evaluate(() => {
      const t = document.querySelector('table');
      return { width: Math.ceil(t.scrollWidth) + 20, height: Math.ceil(t.scrollHeight) + 20 };
    });
    await page.setViewport(size);

    const clips = await page.evaluate((titles) => {
      const rows = [...document.querySelectorAll('table tbody tr')];
      // Data cells only; the export puts the row number in a <th>
      const text = (r) => [...r.querySelectorAll('td')].map((c) => c.innerText).join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
      const table = document.querySelector('table').getBoundingClientRect();
      return titles.map((title) => {
        const start = rows.findIndex((r) => text(r) === title.toUpperCase());
        if (start < 0) return null;
        let end = rows.findIndex((r, i) => i > start && text(r).startsWith('TOTAL SALES'));
        if (end < 0) end = rows.length - 1;
        const top = rows[start].getBoundingClientRect().top;
        return { x: table.left, y: top, width: table.width, height: rows[end].getBoundingClientRect().bottom - top };
      });
    }, titles);

    const results = [];
    for (let i = 0; i < titles.length; i++) {
      if (!clips[i]) throw new Error(`Table "${titles[i]}" not found in the target export`);
      results.push({ title: titles[i], image: await page.screenshot({ clip: clips[i], encoding: 'base64' }) });
    }
    return results;
  } finally {
    if (page) await page.close();
    if (ownBrowser && browser) await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { captureTables };
