const config = require('./config');
const sheets = require('./sheets');
const { findDailyTables, summariseTable } = require('./daily');
const { findStoreRow, buildRowValues } = require('./target');
const { captureReport } = require('./screenshot');
const { sendImage, getBrowser } = require('./whatsapp');
const log = require('./logger');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

let running = false;

/**
 * One run: for each store, find today's table in its sheet and write the
 * figures into its row of the target's HOURLY tab, then send one screenshot
 * of the HOURLY report captioned "Till <hour>". Nothing else is sent.
 * Options for testing: { date: 'YYYY-MM-DD', send: false, write: false }.
 */
async function runJob({ date = reportDate(), send = true, write = true } = {}) {
  if (running) {
    log.warn('Previous run still in progress, skipping this one');
    return;
  }
  running = true;
  const started = Date.now();

  try {
    const targetId = config.google.targetId();
    const tab = await resolveTab(targetId, config.google.hourlyTab);
    log.info(`Report date ${date}`);

    // A store whose day can't be read is skipped, so the screenshot is always sent
    const grid = await sheets.readGrid(targetId, tab);
    for (const store of config.stores) {
      try {
        const day = await readStoreDay(store, date);
        const row = findStoreRow(grid, store.hourlyLabel);
        const values = buildRowValues(day);
        if (write) {
          await sheets.updateRange(targetId, `${sheets.quoteTab(tab)}!C${row}:K${row}`, [values]);
          log.info(`${store.name}: wrote HOURLY row ${row} (total $${day.total.toFixed(2)})`);
        } else {
          log.info(`${store.name}: would write HOURLY row ${row} C:K = ${JSON.stringify(values)} (total $${day.total.toFixed(2)})`);
        }
      } catch (err) {
        log.warn(`${store.name}: not updated - ${err.message}`);
      }
    }

    // Export after writing so the screenshot shows the updated sheet
    const zip = await sheets.exportHtmlZip(targetId);
    const image = await captureReport(zip, tab, config.google.hourlyLastColumn, send ? getBrowser() : undefined);
    const caption = buildCaption();

    if (send) await sendImage(config.whatsapp.target(), image, caption);
    log.info(`Run finished in ${((Date.now() - started) / 1000).toFixed(1)}s (caption "${caption}")`);
    return [{ title: 'HOURLY', image }];
  } catch (err) {
    log.error('Run failed:', err.message);
    if (!send) throw err;
  } finally {
    running = false;
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
    const table = findDailyTables(grid).find((t) => t.date === date);
    if (table) {
      log.info(`${store.name}: found ${date} in tab "${tab}"`);
      return summariseTable(grid, table);
    }
  }
  throw new Error(`${store.name}: no daily table dated ${date}`);
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

/** Caption under the screenshot: the current hour in store time, e.g. "Till 1 PM". */
function buildCaption(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: config.schedule.timezone, hour: 'numeric', hourCycle: 'h23',
  }).format(now));
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `Till ${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}

module.exports = { runJob, reportDate };
