# Server par deploy (24/7, PC ke baghair)

Bot ek Linux server (VPS) par chalega. PC band ho, so jaye ya internet chala jaye, tab bhi har ghante screenshot jayegi.

**Kul waqt:** ~30–40 minute. **Kharcha:** Hetzner CX22 ~€4–5 mahana.

---

## 1. Server banayein (Hetzner)

1. https://console.hetzner.cloud par account banayein, aur **New Project** banayein.
2. **Add Server** par click karein:
   - **Location:** koi bhi (Ashburn, US ho to behtar)
   - **Image:** **Ubuntu 24.04**
   - **Type:** **Shared vCPU → x86 → CX22** (2 vCPU, 4 GB RAM)
     ⚠️ **ARM (CAX) mat lein.** Puppeteer ka Chrome ARM par nahi chalta.
   - **SSH key:** apne PC ki key add karein. Key nahi hai to Windows PowerShell mein `ssh-keygen` chalayein (har sawal par Enter dabayein), phir `type $env:USERPROFILE\.ssh\id_ed25519.pub` ka output yahan paste karein.
3. **Create** dabayein, aur server ka **IP address** note kar lein. Neeche har jagah `SERVER_IP` ki jagah yahi IP likhein.

## 2. Server tayyar karein

Windows PowerShell se server par login karein:

```
ssh root@SERVER_IP
```

Server par yeh commands chalayein (poora block copy-paste kar dein):

```
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
apt install -y ca-certificates fonts-liberation fonts-dejavu-core libasound2t64 \
  libatk-bridge2.0-0t64 libatk1.0-0t64 libcups2t64 libdrm2 libgbm1 libgtk-3-0t64 \
  libnspr4 libnss3 libpango-1.0-0 libcairo2 libxcomposite1 libxdamage1 libxfixes3 \
  libxkbcommon0 libxrandr2 libxshmfence1
npm install -g pm2
ufw allow OpenSSH && ufw --force enable
node -v
```

Aakhir mein `v22.x.x` nazar aana chahiye.

## 3. Project server par bhejein

**Apne PC par**, ek naye PowerShell window mein, project folder se:

```
cd "D:\google sheets automation"
tar --exclude=node_modules --exclude=.wwebjs_auth --exclude=.wwebjs_cache --exclude=preview --exclude=.git -czf ..\bot.tgz .
scp ..\bot.tgz root@SERVER_IP:/root/
```

Is mein `.env` aur `credentials/service-account.json` bhi chale jate hain. Yeh dono zaroori hain.

**Server par** (`ssh root@SERVER_IP` wali window mein):

```
mkdir -p /opt/sheets-bot
tar -xzf /root/bot.tgz -C /opt/sheets-bot
cd /opt/sheets-bot
npm ci
node -e "console.log(require('puppeteer').executablePath())"
```

Aakhri command ek `chrome` ka path dikhaye to sab theek hai.

## 4. Server ke liye `.env` badlein

```
nano /opt/sheets-bot/.env
```

- `CHROME_PATH=` ko **khaali** kar dein (Windows wala path hata dein).
- Aakhir mein yeh line add karein:
  ```
  QR_PORT=8080
  ```

Save karne ke liye **Ctrl+O**, phir **Enter**, phir **Ctrl+X**.

## 5. Google Sheets check karein (WhatsApp ke baghair)

```
cd /opt/sheets-bot
npm run preview
```

`Run finished ... (caption "Till ...")` aaye to Google wala hissa server par chal raha hai.

## 6. WhatsApp jorein (ek dafa QR scan)

Server ka naya browser WhatsApp ke liye ek **naya linked device** hai. Is liye ek dafa QR scan karna hoga. SMS code ki zaroorat nahi, sirf QR.

1. **PC par** ek naya PowerShell window kholein, aur yeh chalayein (yeh tunnel hai, isay khula rehne dein):
   ```
   ssh -L 8080:localhost:8080 root@SERVER_IP
   ```
2. Usi window mein:
   ```
   cd /opt/sheets-bot
   npm run test-send
   ```
3. PC ke Chrome mein **http://localhost:8080** kholein. Wahan QR nazar aayega, aur page har second khud naya QR dikhata hai.
4. **923198414042 wale phone** par: **WhatsApp → Settings → Linked devices → Link a device**, aur QR scan karein.
5. Terminal mein yeh aana chahiye:
   ```
   INFO  Logged in as 923198414042, sending to 120363429835624952@g.us
   INFO  Message sent to 120363429835624952@g.us
   INFO  Test message sent. WhatsApp link works.
   ```
   Testing group mein "Test from bot" aayega, aur browser page par "Connected ✅".

## 7. PC wala bot band karein

Warna har screenshot **do dafa** jayegi, ek PC se aur ek server se.

**PC par:**
```
pm2 delete sheets-bot
```

Phir phone par **WhatsApp → Settings → Linked devices** mein jayein, aur purana Windows/Chrome device **Log out** kar dein. Server wala naya device rehne dein.

## 8. Server par bot hamesha ke liye chalu karein

**Server par:**
```
cd /opt/sheets-bot
pm2 start src/index.js --name sheets-bot
pm2 save
pm2 startup
```

`pm2 startup` ek command print karega jo `sudo env PATH=...` se shuru hoti hai. **Woh command copy kar ke chalayein.** Is ke baad server restart hone par bhi bot khud chalu ho jayega.

Check karein:
```
pm2 logs sheets-bot --lines 20
```
Yeh nazar aana chahiye: `Scheduled "0 12-19 * * *" (America/Chicago). Waiting for next run...`

**Deploy mukammal.** Ab PC band bhi ho to har ghante 12–7 PM (Texas) screenshot jayegi.

---

## Roz-marra ke commands (server par)

| Kaam | Command |
|---|---|
| Bot chal raha hai? | `pm2 status` (`online` dikhna chahiye) |
| Log dekhna | `pm2 logs sheets-bot` (band karne ke liye Ctrl+C) |
| Restart | `pm2 restart sheets-bot` |
| Abhi ek screenshot bhejna | `pm2 stop sheets-bot && npm run run-once; pm2 start sheets-bot` |
| Group badalna | `nano .env` → `WHATSAPP_TARGET=...` → `pm2 restart sheets-bot` |
| Groups ki list | `pm2 stop sheets-bot && npm run list-chats; pm2 start sheets-bot` |

## Naya code server par bhejna

PC par step 3 ke pehle teen commands (`cd`, `tar`, `scp`) dobara chalayein. Phir server par:
```
cd /opt/sheets-bot && cp .env /root/env.backup
tar -xzf /root/bot.tgz -C /opt/sheets-bot
cp /root/env.backup .env
npm ci && pm2 restart sheets-bot
```
Server wali `.env` (khaali `CHROME_PATH` aur `QR_PORT`) backup se wapas aa jati hai.

## Agar WhatsApp logout ho jaye

Log mein `WhatsApp disconnected: LOGOUT` ya `QR scan needed` aaye, to:
```
pm2 stop sheets-bot
```
Phir step 6 dobara karein, aur us ke baad `pm2 start sheets-bot`.

**Logout se bachne ke liye:** 923198414042 wale phone ko hafte mein kam az kam ek dafa internet se jorein.

## Har mahine

Naye mahine ki target file bane to:
```
nano .env
```
`TARGET_SPREADSHEET_ID` badlein, phir `pm2 restart sheets-bot` chalayein. Nayi file ko service account ke email ke saath **Editor** access par share karna na bhoolein.
