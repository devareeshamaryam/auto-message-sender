const config = require('./config');
const sheets = require('./sheets');
const { findDailyTables, summariseTable } = require('./daily');
const { findTargetRow, buildRowValues } = require('./target');
const { captureTables } = require('./screenshot');
const { sendMessage, sendImage, getBrowser } = require('./whatsapp');
const log = require('./logger');

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

let running = false;

/**
 * One run: for each store, find the report day's table in its sheet, write the
 * figures into that day's row of the target, then send screenshots.
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
    const targetTab = config.google.targetTab;
    log.info(`Report date ${date}`);

    const targetGrid = await sheets.readGrid(targetId, targetTab);
    for (const store of config.stores) {
      const day = await readStoreDay(store, date);
      const row = findTargetRow(targetGrid, store.targetTitle, date);
      const values = buildRowValues(day);
      if (write) {
        await sheets.updateRange(targetId, `${sheets.quoteTab(targetTab)}!C${row}:P${row}`, [values]);
        log.info(`${store.name}: wrote row ${row} (total $${day.total.toFixed(2)})`);
      } else {
        log.info(`${store.name}: would write row ${row} C:P = ${JSON.stringify(values)} (total $${day.total.toFixed(2)})`);
      }
    }

    // Export after writing so the screenshots show the updated sheet
    const zip = await sheets.exportHtmlZip(targetId);
    const shots = await captureTables(zip, targetTab, config.stores.map((s) => s.targetTitle), send ? getBrowser() : undefined);

    if (send) {
      const caption = buildCaption();
      for (let i = 0; i < shots.length; i++) {
        await sendImage(config.whatsapp.target(), shots[i].image, `${config.stores[i].name} - ${caption}`);
      }
    }
    log.info(`Run finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return shots;
  } catch (err) {
    log.error('Run failed:', err.message);
    if (!send) throw err;
    try {
      await sendMessage(config.whatsapp.target(), `⚠️ Sheet sync failed: ${err.message}`);
    } catch (notifyErr) {
      log.error('Could not send failure message:', notifyErr.message);
    }
  } finally {
    running = false;
  }
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

/** Caption under each screenshot, e.g. "19 Oct 2026, 2:00 pm". */
function buildCaption() {
  return new Date().toLocaleString('en-GB', {
    timeZone: config.schedule.timezone,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

module.exports = { runJob, reportDate };
