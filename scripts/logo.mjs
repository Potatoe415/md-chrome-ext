// Turns the logo artwork (a rounded white card on a grey page) into assets/logo.png: the card alone,
// cut along its rounded corners, so the grey page and the card's shadow become transparent.
// Usage: node scripts/logo.mjs <image>
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('usage: node scripts/logo.mjs <image>');
const type = extname(source).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const dataUrl = `data:${type};base64,${(await readFile(source)).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const { png, box } = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = img.width, h = img.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  const white = (x, y) => {
    const i = (y * w + x) * 4;
    return d[i] >= 252 && d[i + 1] >= 252 && d[i + 2] >= 252;
  };

  // The card: the white run through the middle row and column.
  const mx = w >> 1, my = h >> 1;
  let left = 0, right = w - 1, top = 0, bottom = h - 1;
  while (left < mx && !white(left, my)) left++;
  while (right > mx && !white(right, my)) right--;
  while (top < my && !white(mx, top)) top++;
  while (bottom > my && !white(mx, bottom)) bottom--;
  const inset = 2;
  left += inset; right -= inset; top += inset; bottom -= inset;
  const size = Math.min(right - left, bottom - top) + 1;

  // Corner radius from where the white starts just below the top edge: x = r - sqrt(r² - (r - dy)²).
  const dy = 2;
  let first = left;
  while (first < mx && !white(first, top + dy)) first++;
  const off = first - left;
  let r = off;
  while (r - Math.sqrt(r * r - (r - dy) * (r - dy)) < off && r < size / 2) r++;

  const out = new OffscreenCanvas(size, size);
  const octx = out.getContext('2d');
  octx.beginPath();
  octx.roundRect(0, 0, size, size, r);
  octx.clip();
  octx.drawImage(canvas, left, top, size, size, 0, 0, size, size);
  const blob = await out.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { png: btoa(bin), box: { left, top, size, radius: r } };
}, dataUrl);
await browser.close();

await writeFile(join(root, 'assets/logo.png'), Buffer.from(png, 'base64'));
console.log('assets/logo.png', box);
