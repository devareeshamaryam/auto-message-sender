const { google } = require('googleapis');
const config = require('./config');

let auth;
let sheetsClient;

function getAuth() {
  if (!auth) {
    auth = new google.auth.GoogleAuth({
      keyFile: config.google.keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  return auth;
}

function getClient() {
  if (!sheetsClient) sheetsClient = google.sheets({ version: 'v4', auth: getAuth() });
  return sheetsClient;
}

/** Tab names in the order they appear in the spreadsheet. */
async function listTabs(spreadsheetId) {
  const res = await getClient().spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(title,sheetId)' });
  return res.data.sheets.map((s) => ({ title: s.properties.title, gid: s.properties.sheetId }));
}

/** Reads a whole tab as a grid of displayed (formatted) values. */
async function readGrid(spreadsheetId, tab) {
  const res = await getClient().spreadsheets.values.get({ spreadsheetId, range: quoteTab(tab) });
  return res.data.values || [];
}

async function updateRange(spreadsheetId, range, values) {
  await getClient().spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

/** Downloads the spreadsheet as Google's zipped HTML export (one formatted .html per tab). */
async function exportHtmlZip(spreadsheetId) {
  const token = await getAuth().getAccessToken();
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=zip`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Exporting target sheet failed (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function quoteTab(tab) {
  return `'${tab.replace(/'/g, "''")}'`;
}

module.exports = { listTabs, readGrid, updateRange, exportHtmlZip, quoteTab };
