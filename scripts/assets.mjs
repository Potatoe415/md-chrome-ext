// Renders icons/ from assets/logo.png (made by scripts/logo.mjs), and the Chrome Web Store images into store/:
// five captioned screenshots of store/handbook.md opened with the extension, the small promo tile and the marquee.
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

// ---------- Web Store images: JPEG, no alpha, as the dashboard asks ----------
const DOC = 'http://localhost:8765/store/handbook.md';
const png = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
const server = await serve();

// Raw captures at twice the size, so they stay sharp once framed.
const shots = {};
const ext = await webEnabledCopy(root);
const { context, close } = await launchExtension(ext, {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  locale: 'en-US',
});
const open = async () => {
  const page = await context.newPage();
  await page.goto(DOC);
  await page.waitForSelector('#doc h1');
  await page.evaluate(() => document.fonts.ready);
  return page;
};
let page = await open();
shots.read = await page.screenshot();
await page.keyboard.press('Control+K');
await page.keyboard.type('review');
await page.waitForTimeout(500);
shots.search = await page.screenshot();
await page.close();

page = await open();
await page.locator('#editBtn').click();
await page.waitForSelector('#ed[contenteditable="true"]');
await page.locator('#ed strong').first().dblclick();
await page.waitForTimeout(300);
shots.edit = await page.screenshot();
await page.close();

page = await context.newPage();
await page.addInitScript(() => localStorage.setItem('mdr-prefs', JSON.stringify({ theme: 'dark', size: 1.08, width: 'normal', font: 'sans' })));
await page.goto(DOC);
await page.waitForSelector('#doc h1');
await page.evaluate(() => document.fonts.ready);
await page.locator('#typoBtn').click();
await page.waitForTimeout(300);
shots.dark = await page.screenshot();
await close();
await rm(ext, { recursive: true, force: true });

// The same file in Chrome without the extension.
page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await page.goto(DOC);
shots.raw = await page.screenshot();
await page.close();
server.close();

const font = (await readFile(join(root, 'fonts/dm-sans-latin-wght.woff2'))).toString('base64');
const logo = `data:image/png;base64,${rendered['logo-128']}`;
const STYLE = `
  @font-face { font-family: 'DM Sans'; src: url(data:font/woff2;base64,${font}); font-weight: 100 1000; }
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body { position: relative; font-family: 'DM Sans', sans-serif; color: #232221; -webkit-font-smoothing: antialiased;
         background: radial-gradient(120% 90% at 0% 0%, #e7f1ff 0%, transparent 60%),
                     radial-gradient(110% 90% at 100% 100%, #f1e6ff 0%, transparent 60%), #fbf8f6; }
  .cap { position: absolute; inset: 52px 0 auto; text-align: center; }
  .cap h1 { margin: 0; font-size: 42px; line-height: 1.1; font-weight: 700; letter-spacing: -0.025em; }
  .cap p { margin: 12px auto 0; max-width: 860px; font-size: 20px; line-height: 1.45; color: #5b5854; }
  .win { position: absolute; overflow: hidden; background: #fff; border-radius: 14px 14px 0 0;
         box-shadow: 0 30px 70px rgba(48, 32, 96, 0.18), 0 0 0 1px rgba(20, 19, 19, 0.06); }
  .win .chrome { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; background: #eef0f3; }
  .win .chrome i { width: 11px; height: 11px; border-radius: 50%; background: #d4d7dc; }
  .win .chrome span { margin-left: 14px; flex: 1; height: 24px; line-height: 24px; padding: 0 12px; border-radius: 12px;
                      background: #fff; color: #6b6f76; font-size: 13px; white-space: nowrap; overflow: hidden; }
  .win img { display: block; width: 100%; }
  .tag { position: absolute; padding: 6px 14px; border-radius: 999px; font-size: 15px; font-weight: 600;
         background: #fff; color: #44423f; box-shadow: 0 4px 14px rgba(48, 32, 96, 0.12); }
  .tag.on { background: linear-gradient(90deg, #1e88f5, #8a2be2); color: #fff; }`;
// h: crop the capture to that height (keeping its top left corner) instead of showing it whole
const win = (shot, { x, y, w, h, url = 'file:///C:/Users/you/Documents/handbook.md' }) =>
  `<div class="win" style="left:${x}px;top:${y}px;width:${w}px"><div class="chrome"><i></i><i></i><i></i><span>${url}</span></div>` +
  `<img src="${png(shot)}"${h ? ` style="height:${h - 38}px;object-fit:cover;object-position:left top"` : ''}></div>`;

async function render(file, width, height, body) {
  const p = await browser.newPage({ viewport: { width, height } });
  await p.setContent(`<!doctype html><style>${STYLE}</style>${body}`);
  await p.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]));
  await p.screenshot({ path: join(root, 'store', file), type: 'jpeg', quality: 92 });
  await p.close();
  console.log(`store/${file}`);
}

const slide = (title, text, shot) => `
  <div class="cap"><h1>${title}</h1><p>${text}</p></div>
  ${win(shot, { x: 80, y: 196, w: 1120 })}`;

await render('screenshot-1-read.jpg', 1280, 800, slide(
  'Markdown, ready to read',
  'Open any .md file in Chrome and get clean typography, tables, code and a headings panel.',
  shots.read,
));
await render('screenshot-2-before-after.jpg', 1280, 800, `
  <div class="cap"><h1>From raw text to a real document</h1><p>Nothing to set up. Open the file and it is formatted.</p></div>
  ${win(shots.raw, { x: 56, y: 236, w: 566, h: 564 })}
  ${win(shots.read, { x: 658, y: 236, w: 566, h: 564 })}
  <div class="tag" style="left:56px;top:190px">Chrome on its own</div>
  <div class="tag on" style="left:658px;top:190px">With Markdown CoolReader</div>`);
await render('screenshot-3-dark.jpg', 1280, 800, slide(
  'Read your way',
  'Light, dark or automatic theme, with adjustable text size, width and font.',
  shots.dark,
));
await render('screenshot-4-search.jpg', 1280, 800, slide(
  'Find anything, fast',
  'Search the document with Ctrl+K and step through every match.',
  shots.search,
));
await render('screenshot-5-edit.jpg', 1280, 800, slide(
  'Edit in place, export anywhere',
  'Fix the text on the formatted page and save the .md, or export to Word, HTML or PDF.',
  shots.edit,
));

await render('promo-440x280.jpg', 440, 280, `
  <div style="position:absolute;inset:0;display:flex;align-items:center;gap:22px;padding:0 38px">
    <img src="${logo}" width="96" height="96">
    <div><div style="font-size:31px;font-weight:700;line-height:1.08;letter-spacing:-0.025em">Markdown<br>CoolReader</div>
    <div style="margin-top:10px;font-size:15px;color:#5b5854">Read .md files in Chrome</div></div>
  </div>`);

await render('marquee-1400x560.jpg', 1400, 560, `
  <div style="position:absolute;left:84px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center">
    <img src="${logo}" width="84" height="84">
    <div style="margin-top:26px;font-size:54px;font-weight:700;line-height:1.05;letter-spacing:-0.03em">Markdown CoolReader</div>
    <div style="margin-top:16px;font-size:22px;line-height:1.45;color:#5b5854">Read, search, edit and export Markdown files, right in Chrome.</div>
  </div>
  ${win(shots.read, { x: 660, y: 70, w: 880 })}`);

await browser.close();
