# Store Sales → WhatsApp Bot

On a schedule, the bot:

1. Opens the Bellfort and Shaver daily sales sheets and finds the day's **PHONE REPAIR PRO** table by its date (in whichever tab it is).
2. Totals bill payments, activations, repairs, phones and accessories. Only rows with a price count, because empty rows still show default dropdown values.
3. Writes those figures into the day's row of each store's table in the target sheet's **data entry** tab: columns C–P. Name of Employee (B) is left empty and Total Sales (Q) is the sheet's own formula.
4. Sends a screenshot of each store's table to WhatsApp, with the time as the caption.

## Setup

1. Put the service account key at `credentials/service-account.json`, and share all three sheets with its `client_email` (Editor on the target).
2. Fill `.env` (see `.env.example`).
3. `npm install`
4. `npm run preview`: reads the sheets and saves the screenshots to `preview/` without writing or sending anything. Add a date to preview a specific day (`npm run preview -- 2026-10-18`), or `--write` to also fill the target.
5. `npm run list-chats`: scan the QR code with WhatsApp (Linked devices), then copy the group ID into `WHATSAPP_TARGET`.
6. `npm run run-once`: one real run.
7. `npm start`: run on the schedule.

## Project layout

| File | Purpose |
|---|---|
| `src/index.js` | Entry point and cron scheduler |
| `src/job.js` | One run: find each store's day, write the target row, send screenshots |
| `src/daily.js` | Finds and totals the daily tables in the store sheets |
| `src/target.js` | Finds the day's row in the target and builds the values for C–P |
| `src/screenshot.js` | Screenshots each store's table from Google's formatted HTML export |
| `src/sheets.js` | Google Sheets API helpers |
| `src/whatsapp.js` | WhatsApp Web client (session saved in `.wwebjs_auth/`) |

## New month

The target is one spreadsheet per month. When you start a new one, put its ID in `TARGET_SPREADSHEET_ID`. It needs the same "data entry" layout, with that month's dates in column A.

## Keep it running (Windows)

```
npm install -g pm2 pm2-windows-startup
pm2 start src/index.js --name sheets-bot
pm2 save
pm2-startup install
```
