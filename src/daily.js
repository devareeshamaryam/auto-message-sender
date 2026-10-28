/**
 * Parses the "PHONE REPAIR PRO" daily tables in the Shaver / Bellfort sheets.
 *
 * Each tab holds a stack of daily tables. A table has a title row with the
 * day's date (usually "PHONE REPAIR PRO" ... 10/27/2026, though the title text
 * is sometimes missing), a column header row (BILL PAYMENTS | COST | S. PRICE |
 * ACTIVATION | ... ), item rows, a subtotal row, and a TOTAL SALES summary
 * ending with a sign-off date (e.g. "aman | 10/27/26").
 *
 * Empty item rows still carry default dropdown values (LYCA, LCD, PHONES ...),
 * so a row only counts as a sale when its S. PRICE is above zero.
 */

function toNumber(value) {
  const n = parseFloat(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function clean(value) {
  return String(value ?? '').trim();
}

/** Parses "10/18/2026", "10/18/26" or "18-October-2026" into "YYYY-MM-DD". */
function parseDate(value) {
  const s = clean(value);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return isoDate(year, Number(m[1]), Number(m[2]));
  }
  m = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (m) {
    const month = MONTHS.findIndex((name) => name.startsWith(m[2].slice(0, 3).toLowerCase())) + 1;
    if (month) return isoDate(Number(m[3]), month, Number(m[1]));
  }
  return null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isColumnHeader(row) {
  return clean((row || [])[0]).toUpperCase() === 'BILL PAYMENTS' && clean((row || [])[1]).toUpperCase() === 'COST';
}

function dateInRows(grid, from, to) {
  for (let i = to - 1; i >= from; i--) {
    const date = (grid[i] || []).map(parseDate).find(Boolean);
    if (date) return date;
  }
  return null;
}

/**
 * Finds every daily table in a tab: [{ date, startRow, endRow, warning? }]
 * (0-based, endRow exclusive).
 *
 * Tables are found by their column header row (BILL PAYMENTS | COST | ...),
 * not by the "PHONE REPAIR PRO" title, which staff sometimes overwrite. The
 * date is the one just above that header (column K of the title row); if
 * it's missing, the sign-off date under TOTAL SALES (e.g. "aman | 10/27/26")
 * is used instead.
 */
function findDailyTables(grid) {
  const headers = [];
  grid.forEach((row, i) => { if (isColumnHeader(row)) headers.push(i); });

  const tables = headers.map((h, n) => {
    const prevHeader = n > 0 ? headers[n - 1] : -1;
    const nextHeader = n + 1 < headers.length ? headers[n + 1] : grid.length;
    // Title row with the date sits 1-3 rows above the header
    const topFrom = Math.max(prevHeader + 1, h - 3);
    const topDate = dateInRows(grid, topFrom, h);
    // Sign-off date sits under this table's TOTAL SALES, before the next table's title
    const totalsIdx = grid.findIndex((r, i) => i > h && i < nextHeader && (r || []).some((c) => clean(c).toUpperCase() === 'TOTAL SALES'));
    const bottomDate = totalsIdx > 0 ? dateInRows(grid, totalsIdx, Math.min(totalsIdx + 6, nextHeader - 3)) : null;

    const table = { date: topDate || bottomDate, startRow: topFrom, headerRow: h };
    if (topDate && bottomDate && topDate !== bottomDate) {
      table.warning = `table at row ${h + 1} is dated ${topDate} at the top but ${bottomDate} at the bottom`;
    }
    return table;
  }).filter((t) => t.date);

  return tables.map((t, i) => ({ ...t, endRow: i + 1 < tables.length ? tables[i + 1].startRow : grid.length }));
}

/** Column positions of each section, read from the table's header row. */
function locateColumns(header) {
  const h = header.map((c) => clean(c).toUpperCase());
  const find = (label, from = 0) => h.findIndex((c, i) => i >= from && c === label);
  const bill = find('BILL PAYMENTS');
  const act = find('ACTIVATION');
  const rep = find('REPAIRS');
  const ph = find('PHONES');
  if ([bill, act, rep, ph].some((i) => i < 0)) return null;
  return {
    bill: { name: bill, price: find('S. PRICE', bill) },
    act: { name: act, price: find('S. PRICE', act) },
    rep: { name: rep, details: find('DETAILS', rep), phone: find('PHONE NAME', rep), price: find('S. PRICE', rep) },
    ph: { type: ph, phone: find('PHONE NAME', ph), price: find('S. PRICE', ph) },
  };
}

/**
 * Reads one daily table into the figures the target "data entry" row needs.
 * Phones/accessories rows that have a phone name count as phone sales; rows
 * without a name, or marked ACCESSORIES, count as accessories.
 */
function summariseTable(grid, table) {
  const rows = grid.slice(table.startRow, table.endRow).map((r) => r || []);
  const headerIdx = rows.findIndex(isColumnHeader);
  if (headerIdx < 0) throw new Error(`Daily table for ${table.date}: column header row not found`);
  const cols = locateColumns(rows[headerIdx]);
  if (!cols) throw new Error(`Daily table for ${table.date}: unexpected column headers`);

  // Item rows run from the header to the subtotal row (the last filled row before TOTAL SALES)
  let totalsIdx = rows.findIndex((r, i) => i > headerIdx && r.some((c) => clean(c).toUpperCase() === 'TOTAL SALES'));
  if (totalsIdx < 0) totalsIdx = rows.length;
  let subtotalIdx = totalsIdx - 1;
  while (subtotalIdx > headerIdx && !rows[subtotalIdx].some((c) => clean(c))) subtotalIdx--;
  const items = rows.slice(headerIdx + 1, subtotalIdx);

  const out = {
    date: table.date,
    activations: { count: 0, names: [], amount: 0 },
    billPayments: { count: 0, names: [], amount: 0 },
    repairs: { count: 0, phones: [], reasons: [], amount: 0 },
    phones: { count: 0, names: [], amount: 0 },
    accessories: 0,
  };

  for (const r of items) {
    const billPrice = toNumber(r[cols.bill.price]);
    if (billPrice > 0) {
      out.billPayments.count++;
      out.billPayments.amount += billPrice;
      if (clean(r[cols.bill.name])) out.billPayments.names.push(clean(r[cols.bill.name]));
    }

    const actPrice = toNumber(r[cols.act.price]);
    if (actPrice > 0) {
      out.activations.count++;
      out.activations.amount += actPrice;
      if (clean(r[cols.act.name])) out.activations.names.push(clean(r[cols.act.name]));
    }

    const repPrice = toNumber(r[cols.rep.price]);
    if (repPrice > 0) {
      out.repairs.count++;
      out.repairs.amount += repPrice;
      if (clean(r[cols.rep.phone])) out.repairs.phones.push(clean(r[cols.rep.phone]));
      if (clean(r[cols.rep.details])) out.repairs.reasons.push(clean(r[cols.rep.details]));
    }

    const phPrice = toNumber(r[cols.ph.price]);
    if (phPrice > 0) {
      const name = clean(r[cols.ph.phone]);
      if (name && clean(r[cols.ph.type]).toUpperCase() !== 'ACCESSORIES') {
        out.phones.count++;
        out.phones.amount += phPrice;
        out.phones.names.push(name);
      } else {
        out.accessories += phPrice;
      }
    }
  }

  out.total = out.activations.amount + out.billPayments.amount + out.repairs.amount + out.phones.amount + out.accessories;
  return out;
}

module.exports = { findDailyTables, summariseTable, parseDate, toNumber };
