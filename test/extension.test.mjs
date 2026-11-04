// Loads the unpacked extension in Playwright's Chromium. Most tests open Markdown served over http with
// website access granted; the last ones use the extension as published (websites not allowed yet).
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchExtension, webEnabledCopy } from './extension-copy.mjs';
import { serve } from './serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:8765/test';
let server, context, close, ext;

before(async () => {
  server = await serve();
  ext = await webEnabledCopy(root);
  ({ context, close } = await launchExtension(ext, { locale: 'fr-FR' }));
});

after(async () => {
  await close?.();
  server?.close();
  await rm(ext, { recursive: true, force: true });
});

async function open(path) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/${path}`);
  await page.waitForSelector('#doc h1');
  return { page, errors };
}

test('renders the file with the Markdown Reader', async () => {
  const { page, errors } = await open('sample.md');
  assert.deepEqual(errors, []);
  assert.equal(await page.locator('#doc h1').first().textContent(), 'Main title');
  assert.match(await page.title(), /Example · sample\.md/);
  assert.equal(await page.locator('#homeBtn .nm').textContent(), 'Markdown CoolReader');
  assert.equal(await page.locator('#appMenu').count(), 0);
  assert.ok(await page.locator('#homeBtn .mk img').evaluate((img) => img.decode().then(() => img.naturalWidth > 0)));
  assert.match(await page.locator('link[rel="icon"]').getAttribute('href'), /^chrome-extension:\/\/.+\/icons\/icon-32\.png$/);
  assert.equal(await page.locator('.mdv-nav-h').textContent(), 'On this page');
  assert.match(await page.locator('#meta').textContent(), /min read/);
  assert.equal(await page.locator('#doc .fm .pill').count(), 2);
  assert.equal(await page.locator('#doc li.task').count(), 2);
  assert.ok((await page.locator('#doc pre code .hljs-keyword').count()) > 0);
  assert.equal(await page.locator('#home').isHidden(), true);
  assert.equal(await page.locator('#editBtn').isVisible(), true);
  await page.screenshot({ path: join(root, 'test', 'screenshot.png'), fullPage: true });
  await page.close();
});

test('runs nothing from the document', async () => {
  const { page } = await open('sample.md');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.body.dataset.xss ?? null), null);
  assert.equal(await page.locator('#doc script, #doc iframe[srcdoc]').count(), 0);
  assert.notEqual(await page.title(), 'XSS');
  await page.close();
});

test('loads images beside the file and links to other files', async () => {
  const { page } = await open('sample.md');
  const img = page.locator('#doc img[alt="Logo"]');
  await assert.doesNotReject(img.evaluate((el) => el.decode()));
  assert.equal(await img.getAttribute('src'), `${BASE}/logo.svg`);
  assert.equal(await page.locator('#doc a.missing').count(), 0);
  assert.equal(await page.locator('#doc a', { hasText: 'the other file' }).getAttribute('href'), `${BASE}/other.md#next`);
  assert.equal(await page.locator('#doc a', { hasText: 'the wikilink' }).getAttribute('href'), `${BASE}/other.md`);
  await page.locator('#doc a', { hasText: 'the other file' }).click();
  await page.waitForURL(`${BASE}/other.md#next`);
  await page.waitForSelector('#doc h1');
  assert.equal(await page.locator('#doc h1').first().textContent(), 'Other file');
  assert.ok(await page.evaluate(() => scrollY > 0 || document.getElementById('next').getBoundingClientRect().top < innerHeight));
  await page.close();
});

test('opens on the anchor of the address', async () => {
  const { page } = await open('sample.md#table');
  await page.waitForTimeout(200);
  assert.ok(page.url().endsWith('#table'));
  const top = await page.locator('#table').evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(top < 300, `heading at ${top}px`);
  await page.close();
});

test('lists every heading in a left panel that folds to a rail', async () => {
  const { page } = await open('sample.md');
  const nav = page.locator('.mdv-nav');
  const list = nav.locator('.mdv-nav-list');
  const btn = nav.locator('.mdv-nav-btn');
  assert.equal(await page.locator('nav.toc').count(), 0);
  assert.equal(await list.isVisible(), true);
  assert.equal(await btn.getAttribute('aria-expanded'), 'true');
  assert.ok((await nav.boundingBox()).width > 250);
  const box = await nav.boundingBox();
  assert.ok(await page.locator('#doc').evaluate((el, r) => el.getBoundingClientRect().left >= r, box.x + box.width));
  assert.deepEqual(await list.locator('a').allTextContents(), [
    'Main title',
    'Task list',
    'Code',
    'Table',
    'Main title',
  ]);
  await page.screenshot({ path: join(root, 'test', 'screenshot-nav.png') });

  await btn.click();
  await page.waitForTimeout(300);
  assert.equal(await list.isVisible(), false);
  assert.equal(await btn.getAttribute('aria-expanded'), 'false');
  assert.ok((await nav.boundingBox()).width < 60);
  await btn.click();
  await page.waitForTimeout(300);
  assert.equal(await list.isVisible(), true);

  await list.locator('a', { hasText: 'Table' }).click();
  await page.waitForTimeout(400);
  assert.ok((await page.locator('#table').evaluate((el) => el.getBoundingClientRect().top)) < 300);
  assert.equal(await list.locator('a.on').textContent(), 'Table');

  await page.locator('#editBtn').click();
  await page.waitForSelector('#ed[contenteditable="true"]');
  assert.equal(await nav.isVisible(), false);
  await page.locator('#edDone').click();
  await page.waitForSelector('#doc h1');
  assert.equal(await nav.isVisible(), true);
  await page.close();
});

test('keeps the panel folded on narrow screens', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(`${BASE}/sample.md`);
  await page.waitForSelector('#doc h1');
  const nav = page.locator('.mdv-nav');
  assert.equal(await nav.locator('.mdv-nav-list').isVisible(), false);
  assert.ok((await nav.boundingBox()).width < 60);
  await page.close();
});

test('edits on the page', async () => {
  const { page } = await open('sample.md');
  await page.locator('#editBtn').click();
  await page.waitForSelector('#ed[contenteditable="true"]');
  assert.equal(await page.locator('#edbar').isVisible(), true);
  await page.locator('#edDone').click();
  await page.waitForSelector('#doc h1');
  await page.close();
});

test('shows the original text and goes back to the page', async () => {
  const { page, errors } = await open('sample.md');
  const btn = page.locator('#srcBtn');
  assert.equal(await btn.isVisible(), true);
  assert.equal(await btn.getAttribute('aria-pressed'), 'false');

  await btn.click();
  const src = page.locator('#mdvSrc');
  assert.equal(await src.isVisible(), true);
  assert.equal(await src.textContent(), (await readFile(join(root, 'test', 'sample.md'), 'utf8')).replace(/\r\n/g, '\n'));
  assert.equal(await page.locator('#doc').isVisible(), false);
  assert.equal(await page.locator('.mdv-nav').isVisible(), false);
  assert.equal(await btn.getAttribute('aria-pressed'), 'true');
  assert.equal(await btn.getAttribute('title'), 'Show the formatted page');

  await btn.click();
  assert.equal(await src.count(), 0);
  assert.equal(await page.locator('#doc').isVisible(), true);
  assert.equal(await page.locator('.mdv-nav').isVisible(), true);

  // editing starts from the formatted page
  await btn.click();
  await page.locator('#editBtn').click();
  await page.waitForSelector('#ed[contenteditable="true"]');
  assert.equal(await src.count(), 0);
  assert.equal(await btn.isVisible(), false);
  await page.locator('#edDone').click();
  await page.waitForSelector('#doc h1');
  assert.equal(await btn.isVisible(), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('leaves html pages whose address ends in .md alone', async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/sample.md?html`);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#mrBar').count(), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).visibility), 'visible');
  await page.close();
});

test('as published: formats local files, leaves websites until allowed', async () => {
  const published = await launchExtension(root);
  try {
    const { context: ctx, worker } = published;
    const id = new URL(worker.url()).host;

    const local = await ctx.newPage();
    await local.goto(pathToFileURL(join(root, 'test', 'sample.md')).href);
    await local.waitForSelector('#doc h1');
    assert.equal(await local.locator('#doc img[alt="Logo"]').getAttribute('src'), pathToFileURL(join(root, 'test', 'logo.svg')).href);

    const pages = ctx.pages().length;
    assert.equal(await local.locator('#htmlBtn').isVisible(), true);
    const [download] = await Promise.all([local.waitForEvent('download'), local.locator('#htmlBtn').click()]);
    assert.equal(download.suggestedFilename(), 'sample.html');
    const html = await readFile(await download.path(), 'utf8');
    assert.match(html, /<title>Example<\/title>/);
    assert.match(html, /<img src="data:image\/svg\+xml;base64,[^"]+" alt="Logo">/);
    assert.match(html, /font-family:'DM Sans';src:url\(data:font\/woff2;base64,/);
    assert.match(html, /<article id="doc">[\s\S]*<h2 id="table">Table<\/h2>/);
    assert.match(html, /hljs-keyword/);
    assert.doesNotMatch(html, /<script|onerror=|srcdoc/i);
    await local.waitForTimeout(300);
    assert.equal(ctx.pages().length, pages);

    const web = await ctx.newPage();
    await web.goto(`${BASE}/sample.md`);
    await web.waitForTimeout(500);
    assert.equal(await web.locator('#mrBar').count(), 0);
    assert.equal(await web.locator('body > pre').count(), 1);

    const welcome = await ctx.newPage();
    const problems = [];
    welcome.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    welcome.on('pageerror', (e) => problems.push(e.message));
    await welcome.goto(`chrome-extension://${id}/src/welcome.html`);
    await welcome.waitForFunction(() => document.getElementById('webBtn').textContent);
    assert.equal(await welcome.locator('#fileState').getAttribute('class'), 'wl-pill on');
    assert.equal(await welcome.locator('#fileHelp').isHidden(), true);
    assert.equal(await welcome.locator('#webState').getAttribute('class'), 'wl-pill');
    assert.equal(await welcome.locator('#webBtn').getAttribute('data-on'), 'false');
    assert.ok(await welcome.locator('.wl-head img').evaluate((img) => img.decode().then(() => img.naturalWidth > 0)));
    assert.deepEqual(problems, []);
    await welcome.screenshot({ path: join(root, 'test', 'screenshot-welcome.png'), fullPage: true });
    await welcome.locator('#openReader').click();
    await welcome.waitForURL(`chrome-extension://${id}/src/reader.html`);
    await welcome.waitForSelector('#drop');
  } finally {
    await published.close();
  }
});

test('opens files from its own page, without access to file URLs', async () => {
  const published = await launchExtension(root);
  try {
    const { context: ctx, worker } = published;
    const id = new URL(worker.url()).host;
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await page.goto(`chrome-extension://${id}/src/reader.html`);
    await page.waitForSelector('#chooseBtn');
    assert.equal(await page.locator('#home').isVisible(), true);
    assert.equal(await page.locator('#homeBtn .nm').textContent(), 'Markdown CoolReader');
    assert.equal(await page.locator('[data-id="home-settings-link"]').getAttribute('href'), `chrome-extension://${id}/src/welcome.html`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes('DM Sans')), true);

    await page.locator('#fileIn').setInputFiles([join(root, 'test', 'sample.md'), join(root, 'test', 'logo.svg')]);
    await page.waitForSelector('#doc h1');
    assert.equal(await page.locator('#doc h1').first().textContent(), 'Main title');
    assert.ok((await page.locator('#doc pre code .hljs-keyword').count()) > 0);
    const img = page.locator('#doc img[alt="Logo"]');
    assert.match(await img.getAttribute('src'), /^blob:/);
    await assert.doesNotReject(img.evaluate((el) => el.decode()));

    await page.locator('#srcBtn').click();
    assert.match(await page.locator('#mdvSrc').textContent(), /^---\r?\ntitle: Example/);
    await page.locator('#srcBtn').click();

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#htmlBtn').click()]);
    assert.equal(download.suggestedFilename(), 'sample.html');
    assert.match(await readFile(await download.path(), 'utf8'), /<img src="data:image\/svg\+xml;base64,[^"]+" alt="Logo">/);
    // The page's CSP reports the sample's onerror= while DOMParser reads it, in an inert draft: nothing runs.
    assert.equal(await page.evaluate(() => document.body.dataset.xss ?? null), null);
    assert.equal(await page.locator('#doc [onerror]').count(), 0);
    assert.deepEqual(problems.filter((p) => !p.startsWith('Executing inline event handler')), []);
    await page.screenshot({ path: join(root, 'test', 'screenshot-open.png'), fullPage: true });
  } finally {
    await published.close();
  }
});
