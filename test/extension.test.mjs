// Loads the unpacked extension in Playwright's Chromium and opens Markdown served over http.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:8765/test';
let server, context, profile;

before(async () => {
  server = await serve();
  profile = await mkdtemp(join(tmpdir(), 'mdv-'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
});

after(async () => {
  await context?.close();
  server?.close();
  await rm(profile, { recursive: true, force: true });
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
  assert.equal(await page.locator('#doc h1').first().textContent(), 'Titre principal');
  assert.match(await page.title(), /Exemple · sample\.md/);
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
  assert.equal(await page.locator('#doc a', { hasText: "l'autre fichier" }).getAttribute('href'), `${BASE}/other.md#suite`);
  assert.equal(await page.locator('#doc a', { hasText: 'le wikilink' }).getAttribute('href'), `${BASE}/other.md`);
  await page.locator('#doc a', { hasText: "l'autre fichier" }).click();
  await page.waitForURL(`${BASE}/other.md#suite`);
  await page.waitForSelector('#doc h1');
  assert.equal(await page.locator('#doc h1').first().textContent(), 'Autre fichier');
  assert.ok(await page.evaluate(() => scrollY > 0 || document.getElementById('suite').getBoundingClientRect().top < innerHeight));
  await page.close();
});

test('opens on the anchor of the address', async () => {
  const { page } = await open('sample.md#tableau');
  await page.waitForTimeout(200);
  assert.ok(page.url().endsWith('#tableau'));
  const top = await page.locator('#tableau').evaluate((el) => el.getBoundingClientRect().top);
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
    'Titre principal',
    'Liste de tâches',
    'Code',
    'Tableau',
    'Titre principal',
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

  await list.locator('a', { hasText: 'Tableau' }).click();
  await page.waitForTimeout(400);
  assert.ok((await page.locator('#tableau').evaluate((el) => el.getBoundingClientRect().top)) < 300);
  assert.equal(await list.locator('a.on').textContent(), 'Tableau');

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

test('leaves html pages whose address ends in .md alone', async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/sample.md?html`);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#mrBar').count(), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).visibility), 'visible');
  await page.close();
});
