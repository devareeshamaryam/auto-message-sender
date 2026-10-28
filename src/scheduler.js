const fs = require('fs');
const path = require('path');
const config = require('./config');
const { runJob, reportDate, currentHour } = require('./job');
const log = require('./logger');

/**
 * Sends exactly one screenshot per hour slot (SEND_HOURS, store time).
 *
 * Instead of firing once on the hour (and losing the slot if that one run
 * fails, the PC was asleep, or the bot restarted), it checks every minute: a
 * slot that hasn't been sent yet is sent, until LATE_MINUTES past the hour.
 * Failed runs are retried every RETRY_MINUTES. Sent slots are remembered in
 * state.json, so a restart never sends the same hour twice.
 */
const STATE_FILE = path.join(__dirname, '..', 'state.json');
const RETRY_MINUTES = 3;

let state = loadState();
let lastFailure = 0;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { sent: {} };
  }
}

function markSent(slot, note) {
  state.sent[slot] = { at: new Date().toISOString(), ...(note ? { note } : {}) };
  // Keep the last few days only
  const keys = Object.keys(state.sent).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 100))) delete state.sent[k];
  for (const k of Object.keys(state.partial || {})) if (k < slot.slice(0, 10)) delete state.partial[k];
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function storeMinute(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: config.schedule.timezone, minute: 'numeric' }).format(now));
}

let busy = false;
async function tick() {
  if (busy) return;
  const hour = currentHour();
  const minute = storeMinute();
  const date = reportDate();
  const slot = `${date} ${String(hour).padStart(2, '0')}`;

  if (!config.schedule.hours.includes(hour)) return;
  if (state.sent[slot]) return;
  if (minute > config.schedule.lateMinutes) {
    log.error(`Slot ${slot} missed: not sent by ${config.schedule.lateMinutes} minutes past the hour`);
    markSent(slot, 'missed');
    return;
  }
  if (Date.now() - lastFailure < RETRY_MINUTES * 60000) return;

  busy = true;
  // Groups that already got this slot before a failure further down the list
  state.partial = state.partial || {};
  const already = state.partial[slot] || [];
  try {
    await runJob({ date, hour, skipTargets: already });
    delete state.partial[slot];
    markSent(slot);
  } catch (err) {
    if (err.sentTo && err.sentTo.length) {
      state.partial[slot] = [...new Set([...already, ...err.sentTo])];
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    }
    lastFailure = Date.now();
    log.error(`Slot ${slot} failed: ${err.message} - retrying in ${RETRY_MINUTES} minutes`);
  } finally {
    busy = false;
  }
}

function startScheduler() {
  const hours = config.schedule.hours;
  log.info(`Sending every hour ${hours[0]}:00-${hours[hours.length - 1]}:${String(config.schedule.lateMinutes).padStart(2, '0')} (${config.schedule.timezone}), one screenshot per hour`);
  setInterval(() => tick().catch((err) => log.error('Scheduler error:', err.message)), 60 * 1000);
  return tick();
}

module.exports = { startScheduler, tick };
