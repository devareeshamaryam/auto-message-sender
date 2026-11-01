const { parseDate } = require('./daily');

/**
 * The target's HOURLY tab: a "HOURLY SALES REPORT" block with one row per store
 * (BELLFORT AVE, SHAVER ST) and a TOTAL SALES row.
 *
 * The bot fills columns C..K of each store's row with today's figures:
 *   C NO.OF BILLPAYMENT | D AMOUNT | E NO. OF ACT | F AMOUNT | G NO OF REPAIRS |
 *   H REPAIR SALES | I NO. OF PHONE | J AMOUNT | K ACCESSORIES
 * EMPLOYEE (B) and CASHOUT (L) are left alone; TOTAL (M) and the TOTAL SALES
 * row are formulas in the sheet.
 */

/** 1-based sheet row of the store's first row in the tab (the top report block). */
function findStoreRow(grid, label) {
  const wanted = label.trim().toUpperCase();
  const idx = grid.findIndex((r) => String((r || [])[0] ?? '').trim().toUpperCase() === wanted);
  if (idx < 0) throw new Error(`HOURLY tab: no row labelled "${label}"`);
  return idx + 1;
}

/** Values for columns C..K of a store row, from a summariseTable() result. */
function buildRowValues(day) {
  const count = (n) => (n > 0 ? n : '');
  const money = (n) => (n > 0 ? Math.round(n * 100) / 100 : '');
  return [
    count(day.billPayments.count),
    money(day.billPayments.amount),
    count(day.activations.count),
    money(day.activations.amount),
    count(day.repairs.count),
    money(day.repairs.amount),
    count(day.phones.count),
    money(day.phones.amount),
    money(day.accessories),
  ];
}

/**
 * The target's DATA ENTRY tab holds one monthly table per store, each starting
 * with a title row ("PHONE REPAIR STORE" for Bellfort, "SHAVER STORE"), then
 * "MOTHLY SALES RECORD", the column header row (DATE | NAME OF EMPLOYEE | ...),
 * one row per day, and a TOTAL SALES row.
 *
 * The bot fills columns C..P of the day's row. NAME OF EMPLOYEE (B) is left
 * alone and TOTAL SALES (Q) is a formula in the sheet.
 */

/** Finds the 1-based sheet row for `date` in the DATA ENTRY table titled `title`. */
function findDayRow(grid, title, date) {
  const wanted = title.trim().toUpperCase();
  const titleIdx = grid.findIndex((r) => (r || []).some((c) => String(c).trim().toUpperCase() === wanted));
  if (titleIdx < 0) throw new Error(`DATA ENTRY tab: table titled "${title}" not found`);

  for (let i = titleIdx + 1; i < grid.length; i++) {
    const first = String((grid[i] || [])[0] ?? '').trim();
    if (first.toUpperCase() === 'TOTAL SALES') break;
    if (parseDate(first) === date) return i + 1;
  }
  throw new Error(`DATA ENTRY tab: no row for ${date} in the "${title}" table`);
}

/** Values for columns C..P of a DATA ENTRY row, from a summariseTable() result. */
function buildDayValues(day) {
  const count = (n) => (n > 0 ? n : '');
  const money = (n) => (n > 0 ? Math.round(n * 100) / 100 : '');
  const list = (items) => items.join('\n');
  return [
    count(day.activations.count),
    list(day.activations.names),
    money(day.activations.amount),
    count(day.billPayments.count),
    list(day.billPayments.names),
    money(day.billPayments.amount),
    count(day.repairs.count),
    list(day.repairs.phones),
    list(day.repairs.reasons),
    money(day.repairs.amount),
    count(day.phones.count),
    list(day.phones.names),
    money(day.phones.amount),
    money(day.accessories),
  ];
}

module.exports = { findStoreRow, buildRowValues, findDayRow, buildDayValues };
