// Test a run without WhatsApp: shows what would be written and saves the screenshots to ./preview
//   npm run preview                 -> today's report date, no writing
//   npm run preview -- 2026-10-18   -> a specific day
//   npm run preview -- --write      -> also write into the target sheet
const fs = require('fs');
const path = require('path');
const { runJob } = require('./job');

(async () => {
  const date = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const write = process.argv.includes('--write');
  const shots = await runJob({ date, write, send: false });

  const dir = path.join(__dirname, '..', 'preview');
  fs.mkdirSync(dir, { recursive: true });
  for (const shot of shots) {
    const file = path.join(dir, `${shot.title.replace(/[^\w]+/g, '_')}.png`);
    fs.writeFileSync(file, Buffer.from(shot.image, 'base64'));
    console.log(`Saved ${file}`);
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
