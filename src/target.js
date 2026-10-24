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

module.exports = { findStoreRow, buildRowValues };
