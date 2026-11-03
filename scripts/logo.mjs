// Turns the logo artwork (the M on a white card, as a JPEG) into assets/logo.png: the white made
// transparent with its soft edges kept, cropped to the M and centred on a 1024 × 1024 square.
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
const png = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const { width: w, height: h } = img;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, w, h);
  const d = pixels.data;

  // Only the inside of the white card: its shadow and the grey page around it are not part of the logo.
  const inside = (x, y) => x > w * 0.16 && x < w * 0.96 && y > h * 0.14 && y < h * 0.73;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!inside(x, y)) {
        d[i + 3] = 0;
        continue;
      }
      // colour to alpha against white
      const a = Math.max(255 - d[i], 255 - d[i + 1], 255 - d[i + 2]) / 255;
      if (a < 0.05) {
        d[i + 3] = 0;
        continue;
      }
      for (let c = 0; c < 3; c++) d[i + c] = Math.round(255 - (255 - d[i + c]) / a);
      const solid = Math.min(1, (a - 0.05) / 0.5);
      d[i + 3] = Math.round(solid * 255);
      if (solid > 0.5) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  ctx.putImageData(pixels, 0, 0);

  const size = 1024, box = Math.max(maxX - minX, maxY - minY) * 1.18;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const out = new OffscreenCanvas(size, size);
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, cx - box / 2, cy - box / 2, box, box, 0, 0, size, size);
  const blob = await out.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}, dataUrl);
await browser.close();

await writeFile(join(root, 'assets/logo.png'), Buffer.from(png, 'base64'));
console.log('assets/logo.png');
