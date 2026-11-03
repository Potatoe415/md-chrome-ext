// Turns the logo artwork (the M on a rounded white card, on a grey page) into assets/logo.png: the M alone
// on a transparent square, its anti-aliased edges kept, with a small margin.
// Usage: node scripts/logo.mjs <image>
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const MARGIN = 0.04; // transparent margin around the M, as a share of the square

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('usage: node scripts/logo.mjs <image>');
const type = extname(source).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const dataUrl = `data:${type};base64,${(await readFile(source)).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const { png, box } = await page.evaluate(
  async ({ src, margin }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = img.width, h = img.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, w, h);
    const d = pixels.data;
    const white = (x, y) => {
      const i = (y * w + x) * 4;
      return d[i] >= 252 && d[i + 1] >= 252 && d[i + 2] >= 252;
    };

    // The card: the white run through the middle row and column; only its inside is kept.
    const mx = w >> 1, my = h >> 1;
    let left = 0, right = w - 1, top = 0, bottom = h - 1;
    while (left < mx && !white(left, my)) left++;
    while (right > mx && !white(right, my)) right--;
    while (top < my && !white(mx, top)) top++;
    while (bottom > my && !white(mx, bottom)) bottom--;
    // Inside the card's rounded rectangle, a few pixels in from its edge (and its shadow).
    const inset = 6, radius = (right - left) * 0.2;
    const l = left + inset, r = right - inset, t = top + inset, b = bottom - inset;
    const inside = (x, y) => {
      if (x < l || x > r || y < t || y > b) return false;
      const cx = Math.min(Math.max(x, l + radius), r - radius), cy = Math.min(Math.max(y, t + radius), b - radius);
      return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
    };

    // Matte against the white card: how far a pixel is from white sets its opacity, and edge pixels
    // (part white, part colour) get their colour back without the white.
    const SOLID = 150;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = inside(x, y) ? Math.min(1, (255 - Math.min(d[i], d[i + 1], d[i + 2])) / SOLID) : 0;
        if (a < 0.03) {
          d[i + 3] = 0;
          continue;
        }
        if (a < 1) for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.round(255 - (255 - d[i + c]) / a));
        d[i + 3] = Math.round(a * 255);
        if (a > 0.5) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    ctx.putImageData(pixels, 0, 0);

    const ink = Math.max(maxX - minX, maxY - minY) + 1;
    const side = Math.round(ink / (1 - 2 * margin));
    const sx = Math.round((minX + maxX + 1 - side) / 2), sy = Math.round((minY + maxY + 1 - side) / 2);
    const out = new OffscreenCanvas(side, side);
    out.getContext('2d').drawImage(canvas, sx, sy, side, side, 0, 0, side, side);
    const blob = await out.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { png: btoa(bin), box: { side, ink: [minX, minY, maxX, maxY] } };
  },
  { src: dataUrl, margin: MARGIN },
);
await browser.close();

await writeFile(join(root, 'assets/logo.png'), Buffer.from(png, 'base64'));
console.log('assets/logo.png', box);
