// Renders icons/ from assets/logo.png (made by scripts/logo.mjs), and the Chrome Web Store images into store/
// (a screenshot of store/demo.md opened with the extension, and the small promo tile).
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../test/serve.mjs';
import { launchExtension, webEnabledCopy } from '../test/extension-copy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconUrl = `data:image/png;base64,${(await readFile(join(root, 'assets/logo.png'))).toString('base64')}`;

await mkdir(join(root, 'icons'), { recursive: true });
await mkdir(join(root, 'store'), { recursive: true });

// name → [canvas size, artwork size, toolbar]. The Web Store icon is 96 × 96 artwork with 16 px of
// transparent padding on each side; the others fill their square. Toolbar icons use a tighter card (less
// white around the M, so it matches the size of other toolbar icons) with a hairline, so the white card
// keeps its full size on a light toolbar.
const ICONS = {
  'icon-16': [16, 16, true],
  'icon-32': [32, 32, true],
  'icon-48': [48, 48, true],
  'icon-128': [128, 96, false],
  'logo-32': [32, 32, false],
  'logo-64': [64, 64, false],
  'logo-128': [128, 128, false],
};
const CORNER = 136 / 762; // corner radius / card size, from scripts/logo.mjs
const TOOLBAR_MARGIN = 0.07; // white left around the M on toolbar icons, as a share of the icon

const browser = await chromium.launch();
const helper = await browser.newPage();
const rendered = await helper.evaluate(
  async ({ src, icons, corner, margin }) => {
    const img = new Image();
    img.src = src;
    await img.decode();

    // The tight card: a square around the M (its coloured pixels) with a small white margin, rounded again.
    const tight = (() => {
      const w = img.width, h = img.height;
      const probe = new OffscreenCanvas(w, h).getContext('2d');
      probe.drawImage(img, 0, 0);
      const d = probe.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (d[i + 3] > 200 && Math.min(d[i], d[i + 1], d[i + 2]) < 200) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      }
      const ink = Math.max(maxX - minX, maxY - minY) + 1;
      const side = Math.round(ink / (1 - 2 * margin));
      const sx = Math.round((minX + maxX + 1 - side) / 2), sy = Math.round((minY + maxY + 1 - side) / 2);
      const card = new OffscreenCanvas(side, side);
      const ctx = card.getContext('2d');
      ctx.beginPath();
      ctx.roundRect(0, 0, side, side, side * corner);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, side, side);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);
      return card;
    })();

    // Halve with smoothing until close to the target, then one high-quality resize: a single big step blurs.
    const resize = async (target, source) => {
      let bitmap = await createImageBitmap(source);
      while (bitmap.width / 2 >= target * 2) {
        const half = Math.round(bitmap.width / 2);
        bitmap = await createImageBitmap(bitmap, { resizeWidth: half, resizeHeight: half, resizeQuality: 'high' });
      }
      return createImageBitmap(bitmap, { resizeWidth: target, resizeHeight: target, resizeQuality: 'high' });
    };
    const out = {};
    for (const [name, [size, art, toolbar]] of Object.entries(icons)) {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      const off = (size - art) / 2;
      ctx.drawImage(await resize(art, toolbar ? tight : img), off, off);
      if (toolbar) {
        ctx.strokeStyle = 'rgba(32, 33, 36, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(off + 0.5, off + 0.5, art - 1, art - 1, art * corner);
        ctx.stroke();
      }
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      out[name] = btoa(String.fromCharCode(...bytes));
    }
    return out;
  },
  { src: iconUrl, icons: ICONS, corner: CORNER, margin: TOOLBAR_MARGIN },
);
for (const [name, b64] of Object.entries(rendered)) {
  await writeFile(join(root, `icons/${name}.png`), Buffer.from(b64, 'base64'));
  console.log(`icons/${name}.png`);
}

const tile = await browser.newPage({ viewport: { width: 440, height: 280 } });
await tile.setContent(`
  <style>
    @font-face { font-family: 'DM Sans'; src: url('data:font/woff2;base64,${(await readFile(join(root, 'fonts/dm-sans-latin-wght.woff2'))).toString('base64')}'); font-weight: 100 1000; }
    html, body { margin: 0; height: 100%; }
    body { display: flex; align-items: center; gap: 22px; padding: 0 36px; box-sizing: border-box;
           background: #f9f4f2; font-family: 'DM Sans', sans-serif; color: #2d2c2b; }
    h1 { margin: 0; font-size: 34px; line-height: 1.05; letter-spacing: -0.03em; }
    p { margin: 10px 0 0; font-size: 16px; color: #63605d; }
  </style>
  <img src="data:image/png;base64,${rendered['logo-128']}" width="112" height="112"
       style="filter: drop-shadow(0 6px 14px rgba(20, 19, 19, 0.12))">
  <div><h1>Markdown<br>CoolReader</h1><p>Read .md files in Chrome</p></div>`);
await tile.evaluate(() => Promise.all([document.fonts.ready, document.querySelector('img').decode()]));
await tile.screenshot({ path: join(root, 'store/promo-440x280.png') });
console.log('store/promo-440x280.png');
await browser.close();

const server = await serve();
const ext = await webEnabledCopy(root);
const { context, close } = await launchExtension(ext, { viewport: { width: 1280, height: 800 }, locale: 'en-US' });
const page = await context.newPage();
await page.goto('http://localhost:8765/store/demo.md');
await page.waitForSelector('#doc h1');
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, 'store/screenshot-1280x800.png') });
console.log('store/screenshot-1280x800.png');
await close();
server.close();
await rm(ext, { recursive: true, force: true });
