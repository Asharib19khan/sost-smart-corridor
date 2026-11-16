// Render demo receipts to PNG + one print-ready PDF using the frontend's Playwright install.
// Run from repo root: node demo/receipts/render.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../frontend/package.json'));
const { chromium } = require('@playwright/test');

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 });
for (const id of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
  await page.goto(pathToFileURL(path.join(here, `${id}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(here, `${id}.png`), clip: { x: 0, y: 0, width: 900, height: 620 } });
}
await page.goto(pathToFileURL(path.join(here, 'all_receipts.html')).href);
await page.pdf({ path: path.join(here, 'receipts_print.pdf'), width: '900px', height: '620px', printBackground: true });
await browser.close();
console.log('rendered');
