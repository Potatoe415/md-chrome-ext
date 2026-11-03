// Renders icons/ from assets/logo.png (made by scripts/logo.mjs), and the Chrome Web Store images into store/
// (a screenshot of store/demo.md opened with the extension, and the small promo tile).
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../test/serve.mjs';
import { launchExtension, webEnabledCopy } from '../test/extension-copy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconUrl = `data:image/png;base64,${(await readFile(join(root, 'assets/logo.png'))).toString('base64')}`;

await mkdir(join(root, 'icons'), { recursive: true });
await mkdir(join(root, 'store'), { recursive: true });

const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // Web Store icon: 96 × 96 artwork with 16 px of transparent padding on each side.
  const art = size === 128 ? 96 : size;
  await page.setContent(
    `<style>html,body{margin:0}body{display:grid;place-items:center;height:100vh}</style><img src="${iconUrl}" width="${art}" height="${art}">`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: join(root, `icons/icon-${size}.png`), omitBackground: true });
  await page.close();
  console.log(`icons/icon-${size}.png`);
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
  <img src="${iconUrl}" width="104" height="104">
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
