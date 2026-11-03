import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { chromium } from 'playwright';

const SKIP = new Set(['.git', 'node_modules', 'test', 'dist', 'store']);

// A copy of the extension whose website access is granted at install: in Playwright nobody can accept
// the permission prompt that optional_host_permissions needs.
export async function webEnabledCopy(root) {
  const dir = await mkdtemp(join(tmpdir(), 'mdv-ext-'));
  await cp(root, dir, { recursive: true, filter: (src) => src === root || !SKIP.has(basename(src)) });
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  manifest.host_permissions = [...manifest.host_permissions, ...manifest.optional_host_permissions];
  delete manifest.optional_host_permissions;
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

// Launches Chromium with the extension in `dir`, once its service worker has finished installing.
export async function launchExtension(dir, options = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'mdv-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    ...options,
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const web = await worker.evaluate(() => chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] }));
  if (web) {
    await worker.evaluate(async () => {
      while (!(await chrome.scripting.getRegisteredContentScripts({ ids: ['mdv-web'] })).length) {
        await new Promise((r) => setTimeout(r, 50));
      }
    });
  }
  const close = async () => {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  };
  return { context, worker, close };
}
