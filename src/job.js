const config = require('./config');
const sheets = require('./sheets');
const { findDailyTables, summariseTable } = require('./daily');
const { findStoreRow, buildRowValues } = require('./target');
const { captureReport } = require('./screenshot');
const { sendImage } = require('./whatsapp');
const log = require('./logger');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

let running = false;

const EMPTY_ROW = Array(9).fill('');

/**
 * One run: for each store, find today's table in its sheet and write the
 * figures into its row of the target's HOURLY tab, then send one screenshot
 * of the HOURLY report captioned "Till <hour>". Nothing else is sent.
 *
 * A store whose table for today can't be found gets an empty row, never the
 * previous day's numbers. Throws if the run fails, so the scheduler can retry.
 * Options: { date, hour (store-time hour for the caption), send, write }.
 */
async function runJob({ date = reportDate(), hour = currentHour(), send = true, write = true } = {}) {
  if (running) throw new Error('Previous run still in progress');
  running = true;
  const started = Date.now();

  try {
    const targetId = config.google.targetId();
    const tab = await resolveTab(targetId, config.google.hourlyTab);
    const caption = buildCaption(hour);
    log.info(`Report date ${date}, slot "${caption}"`);

    const grid = await sheets.readGrid(targetId, tab);
    const expected = [];
    for (const store of config.stores) {
      const row = findStoreRow(grid, store.hourlyLabel);
      let values = EMPTY_ROW;
      let total = 0;
      try {
        const day = await readStoreDay(store, date);
        values = buildRowValues(day);
        total = day.total;
      } catch (err) {
        // Clear the row rather than leave yesterday's figures on the screenshot
        log.warn(`${store.name}: ${err.message} - its row will be left empty`);
      }
      expected.push({ label: store.hourlyLabel, values });
      if (write) {
        await sheets.updateRange(targetId, `${sheets.quoteTab(tab)}!C${row}:K${row}`, [values]);
        log.info(`${store.name}: wrote HOURLY row ${row} (total $${total.toFixed(2)})`);
      } else {
        log.info(`${store.name}: would write HOURLY row ${row} C:K = ${JSON.stringify(values)} (total $${total.toFixed(2)})`);
      }
    }

    const image = await captureFresh(targetId, tab, write ? expected : null);
    if (send) await sendImage(config.whatsapp.target(), image, caption);
    log.info(`Run finished in ${((Date.now() - started) / 1000).toFixed(1)}s (caption "${caption}")`);
    return [{ title: 'HOURLY', image }];
  } finally {
    running = false;
  }
}

/** Exports the target and screenshots it, re-exporting until it shows the numbers just written. */
async function captureFresh(targetId, tab, expected) {
  for (let attempt = 1; ; attempt++) {
    const zip = await sheets.exportHtmlZip(targetId);
    try {
      // Own short-lived browser, so a broken WhatsApp connection can't block the screenshot
      return await captureReport(zip, tab, config.google.hourlyLastColumn, expected);
    } catch (err) {
      if (!err.stale || attempt >= 6) throw err;
      log.warn(`${err.message} - re-exporting in 5s (attempt ${attempt + 1}/6)`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
/** The tab's real title, ignoring case and stray spaces (the HOURLY tab is named "HOURLY "). */
async function resolveTab(spreadsheetId, name) {
  const tabs = await sheets.listTabs(spreadsheetId);
  const tab = tabs.find((t) => t.title.trim().toLowerCase() === name.trim().toLowerCase());
  if (!tab) throw new Error(`Target has no tab named "${name}"`);
  return tab.title;
}
/** Finds and summarises the store's daily table for `date`, checking this month's tabs first. */
async function readStoreDay(store, date) {
  const id = store.sourceId();
  const month = MONTHS[Number(date.slice(5, 7)) - 1];
  const tabs = (await sheets.listTabs(id)).map((t) => t.title).reverse();
  const isThisMonth = (title) => title.toLowerCase().includes(month.slice(0, 3));
  const ordered = [...tabs.filter(isThisMonth), ...tabs.filter((t) => !isThisMonth(t))];

  for (const tab of ordered) {
    const grid = await sheets.readGrid(id, tab);
    const matches = findDailyTables(grid).filter((t) => t.date === date);
    if (matches.length) {
      // Two tables with the same date usually means one was copied and not re-dated; the lower one is the newer
      const table = matches[matches.length - 1];
      if (matches.length > 1) log.warn(`${store.name}: ${matches.length} tables dated ${date} in "${tab}", using the one at row ${table.headerRow + 1}`);
      if (table.warning) log.warn(`${store.name}: ${table.warning}`);
      const day = summariseTable(grid, table);
      log.info(`${store.name}: found ${date} in tab "${tab}" at row ${table.headerRow + 1}`);
      return day;
    }
  }
  throw new Error(`no daily table dated ${date}`);
}

/** Today's date in the configured timezone, or yesterday before PREVIOUS_DAY_BEFORE_HOUR. */
function reportDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: config.schedule.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (Number(parts.hour) < config.schedule.previousDayBeforeHour) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

/** Current hour (0-23) in store time. */
function currentHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: config.schedule.timezone, hour: 'numeric', hourCycle: 'h23',
  }).format(now));
}

/** Caption under the screenshot for a store-time hour, e.g. 13 -> "Till 1 PM". */
function buildCaption(hour) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `Till ${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}

module.exports = { runJob, reportDate, currentHour };
