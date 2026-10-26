const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const QRCode = require('qrcode');
const log = require('./logger');

// Saved next to package.json; terminal QR codes often don't scan, this one does
const QR_FILE = path.join(__dirname, '..', 'qr.png');
// Page that always shows the newest qr.png. WhatsApp replaces the QR about every
// 20 seconds, and an image viewer keeps showing the old, expired one.
const QR_PAGE = path.join(__dirname, '..', 'qr.html');

let pageOpened = false;

/** Writes the WhatsApp QR as a large PNG (refreshed for every new QR) and opens the live QR page on Windows. */
async function saveQrImage(qr, { open = process.platform === 'win32' } = {}) {
  await QRCode.toFile(QR_FILE, qr, {
    type: 'png',
    width: 800,
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  log.info(`New QR saved to ${QR_FILE} - scan it from WhatsApp > Settings > Linked devices > Link a device`);

  if (!pageOpened) {
    fs.writeFileSync(QR_PAGE, qrPageHtml());
    pageOpened = true;
    log.info(`Live QR page (always shows the newest QR): ${QR_PAGE}`);
    if (open) exec(`start "" "${QR_PAGE}"`, (err) => err && log.warn('Could not open QR page:', err.message));
  }
}

/** Removes the QR image once login has succeeded; the open page then says "Connected". */
function deleteQrImage() {
  try {
    if (fs.existsSync(QR_FILE)) {
      fs.unlinkSync(QR_FILE);
      log.info('QR image deleted');
    }
    // Leave a short note in place of the live page, then remove it shortly after
    if (fs.existsSync(QR_PAGE)) {
      fs.writeFileSync(QR_PAGE, '<!doctype html><meta charset="utf-8"><title>WhatsApp connected</title><body style="font:28px Arial;text-align:center;padding-top:80px">Connected ✅ You can close this tab.</body>');
      setTimeout(() => fs.rmSync(QR_PAGE, { force: true }), 15000).unref();
    }
  } catch (err) {
    log.warn('Could not delete QR image:', err.message);
  }
  pageOpened = false;
}

function qrPageHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>WhatsApp QR</title>
<style>
  body { margin: 0; background: #fff; font-family: Arial, sans-serif; text-align: center; color: #111; }
  h1 { font-size: 22px; margin: 18px 0 6px; }
  p { margin: 4px 0; color: #444; }
  img { width: min(90vmin, 640px); height: auto; margin-top: 10px; image-rendering: pixelated; }
  #status { font-size: 26px; margin-top: 30px; }
</style></head><body>
  <h1>WhatsApp &gt; Settings &gt; Linked devices &gt; Link a device</h1>
  <p>This page refreshes by itself. Always scan the code shown here.</p>
  <p id="updated"></p>
  <img id="qr" alt="">
  <div id="status"></div>
<script>
  const img = document.getElementById('qr');
  let lastOk = 0;
  img.onload = () => { lastOk = Date.now(); img.style.display = ''; document.getElementById('status').textContent = ''; };
  img.onerror = () => {
    img.style.display = 'none';
    // The bot deletes qr.png once you are logged in
    if (lastOk) { document.getElementById('status').textContent = 'Connected ✅ You can close this tab.'; clearInterval(timer); }
  };
  const refresh = () => { img.src = 'qr.png?t=' + Date.now(); document.getElementById('updated').textContent = 'Checked ' + new Date().toLocaleTimeString(); };
  refresh();
  const timer = setInterval(refresh, 1000);
</script>
</body></html>`;
}

module.exports = { saveQrImage, deleteQrImage, QR_FILE };
