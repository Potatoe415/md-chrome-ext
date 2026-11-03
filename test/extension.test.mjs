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
  assert.ok((await page.locator('nav.toc a').count()) >= 3);
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
