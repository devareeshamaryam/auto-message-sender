# Sheets → WhatsApp Bot

Reads two Google Sheets, writes the combined rows into a third sheet, and posts a summary to a WhatsApp group/channel on a schedule.

## Setup

1. **Service account**: put the key JSON at `credentials/service-account.json`.
2. **Share all 3 sheets** with the service account's `client_email` (from the JSON). Give it Viewer on the sources and Editor on the target.
3. **Fill `.env`**: sheet IDs, ranges, `MERGE_MODE`, `JOIN_KEY`, `WHATSAPP_TARGET`, `CRON_SCHEDULE`.
4. `npm install`
5. `npm run list-chats`: scan the QR code with WhatsApp (Linked devices), then copy the group ID into `WHATSAPP_TARGET`.
6. `npm run run-once`: do one test run.
7. `npm start`: run on the schedule.

## Project layout

| File | Purpose |
|---|---|
| `src/index.js` | Entry point and cron scheduler |
| `src/job.js` | One sync run: read, merge, write, then send a screenshot. `buildCaption()` sets the caption |
| `src/screenshot.js` | Draws the target sheet as a PNG (the latest `SCREENSHOT_MAX_ROWS` rows, with new rows in green) |
| `src/transform.js` | Merge rules. Put your business logic here |
| `src/sheets.js` | Google Sheets API helpers |
| `src/whatsapp.js` | WhatsApp Web client (session saved in `.wwebjs_auth/`) |

## Keep it running (Windows)

```
npm install -g pm2 pm2-windows-startup
pm2 start src/index.js --name sheets-bot
pm2 save
pm2-startup install
```
