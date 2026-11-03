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

// name → [canvas size, artwork size]. The Web Store icon is 96 × 96 artwork with 16 px of transparent
// padding on each side; the others fill their square.
const ICONS = {
  'icon-16': [16, 16],
  'icon-32': [32, 32],
  'icon-48': [48, 48],
  'icon-128': [128, 96],
  'logo-32': [32, 32],
  'logo-64': [64, 64],
  'logo-128': [128, 128],
};

const browser = await chromium.launch();
const helper = await browser.newPage();
const rendered = await helper.evaluate(
  async ({ src, icons }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    // Halve with smoothing until close to the target, then one high-quality resize: a single big step blurs.
    const resize = async (target) => {
      let bitmap = await createImageBitmap(img);
      while (bitmap.width / 2 >= target * 2) {
        const half = Math.round(bitmap.width / 2);
        bitmap = await createImageBitmap(bitmap, { resizeWidth: half, resizeHeight: half, resizeQuality: 'high' });
      }
      return createImageBitmap(bitmap, { resizeWidth: target, resizeHeight: target, resizeQuality: 'high' });
    };
    const out = {};
    for (const [name, [size, art]] of Object.entries(icons)) {
      const canvas = new OffscreenCanvas(size, size);
      const off = (size - art) / 2;
      canvas.getContext('2d').drawImage(await resize(art), off, off);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      out[name] = btoa(String.fromCharCode(...bytes));
    }
    return out;
  },
  { src: iconUrl, icons: ICONS },
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
    body { display: flex; align-items: center; gap: 26px; padding: 0 40px; box-sizing: border-box;
           background: #f9f4f2; font-family: 'DM Sans', sans-serif; color: #2d2c2b; }
    h1 { margin: 0; font-size: 34px; line-height: 1.05; letter-spacing: -0.03em; }
    p { margin: 10px 0 0; font-size: 16px; color: #63605d; }
  </style>
  <img src="data:image/png;base64,${rendered['logo-128']}" width="110" height="110">
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
