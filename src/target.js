const { parseDate } = require('./daily');

/**
 * The target "data entry" tab holds one monthly table per store, each starting
 * with a title row (e.g. "SHAVER STORE"), then "MOTHLY SALES RECORD", the
 * column header row (DATE | NAME OF EMPLOYEE | ...), one row per day, and a
 * TOTAL SALES row.
 *
 * The bot fills columns C..P of the day's row. NAME OF EMPLOYEE (B) is left
 * alone and TOTAL SALES (Q) is a formula in the sheet.
 */

/** Finds the 1-based sheet row for `date` in the table titled `title`. */
function findTargetRow(grid, title, date) {
  const wanted = title.trim().toUpperCase();
  const titleIdx = grid.findIndex((r) => (r || []).some((c) => String(c).trim().toUpperCase() === wanted));
  if (titleIdx < 0) throw new Error(`Target: table titled "${title}" not found`);

  for (let i = titleIdx + 1; i < grid.length; i++) {
    const first = String((grid[i] || [])[0] ?? '').trim().toUpperCase();
    if (first === 'TOTAL SALES') break;
    if (parseDate(first) === date) return i + 1;
  }
  throw new Error(`Target: no row for ${date} in the "${title}" table`);
}

/** Values for columns C..P of a target row, from a summariseTable() result. */
function buildRowValues(day) {
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

module.exports = { findTargetRow, buildRowValues };
