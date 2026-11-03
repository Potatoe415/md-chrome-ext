importScripts('/reader/scripts.js');

const CSS = ['reader/design.css', 'reader/page.css', 'src/reader.css'];

// Classic scripts sharing one global scope, in this order (see src/adapter.js).
const JS = [
  'vendor/purify.min.js',
  'vendor/highlight.min.js',
  'reader/marked.umd.js',
  'reader/page-html.js',
  'src/mount.js',
  ...self.READER_SCRIPTS.map((name) => `reader/${name}.js`),
  'src/adapter.js',
];

// Web pages are optional: their content script is registered only while the user grants the sites.
// Registered scripts take match patterns only (no include_globs), so the extensions go in the path.
const WEB = { origins: ['http://*/*', 'https://*/*'] };
const WEB_SCRIPT = 'mdv-web';
const EXTENSIONS = ['md', 'MD', 'markdown', 'mdown', 'mkd', 'mdx'];
const WEB_MATCHES = ['http', 'https'].flatMap((scheme) =>
  EXTENSIONS.flatMap((ext) => [`${scheme}://*/*.${ext}`, `${scheme}://*/*.${ext}?*`]),
);

async function syncWebScript() {
  const granted = await chrome.permissions.contains(WEB);
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [WEB_SCRIPT] })).length > 0;
  if (granted && !registered) {
    await chrome.scripting.registerContentScripts([
      { id: WEB_SCRIPT, matches: WEB_MATCHES, js: ['src/content.js'], runAt: 'document_end' },
    ]);
  } else if (!granted && registered) {
    await chrome.scripting.unregisterContentScripts({ ids: [WEB_SCRIPT] });
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncWebScript();
  if (reason === chrome.runtime.OnInstalledReason.INSTALL && !(await chrome.extension.isAllowedFileSchemeAccess())) {
    chrome.runtime.openOptionsPage();
  }
});
chrome.runtime.onStartup.addListener(syncWebScript);
chrome.permissions.onAdded.addListener(syncWebScript);
chrome.permissions.onRemoved.addListener(syncWebScript);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

const MARKDOWN_URL = /^(file|https?):\/\/[^?#]*\.(md|markdown|mdown|mkd|mdx)([?#]|$)/i;

// ---------- HTML export: the reader's styles and the document's images, inlined ----------
const base64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

let exportCss = null;
async function getExportCss() {
  if (exportCss) return exportCss;
  const font = await (await fetch(chrome.runtime.getURL('fonts/dm-sans-latin-wght.woff2'))).arrayBuffer();
  const sheets = await Promise.all(CSS.map(async (file) => (await fetch(chrome.runtime.getURL(file))).text()));
  exportCss =
    `@font-face{font-family:'DM Sans';src:url(data:font/woff2;base64,${base64(font)}) format('woff2');` +
    `font-weight:100 1000;font-style:normal;font-display:swap}\n${sheets.join('\n')}`;
  return exportCss;
}

// Runs in a tab showing the image itself: there it is same-origin, so it can be read back.
function readOwnImage() {
  const type = document.contentType;
  if (type === 'image/svg+xml') {
    const bytes = new TextEncoder().encode(new XMLSerializer().serializeToString(document.documentElement));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:image/svg+xml;base64,${btoa(bin)}`;
  }
  const img = document.querySelector('img');
  if (!img || !img.naturalWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  if (type === 'image/jpeg') return canvas.toDataURL('image/jpeg', 0.92);
  if (type === 'image/webp') return canvas.toDataURL('image/webp', 0.92);
  return canvas.toDataURL('image/png');
}

function loaded(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('timeout')), 10000);
    const listener = (id, info, tab) => {
      if (id === tabId && info.status === 'complete' && tab.url !== 'about:blank') done();
    };
    const done = (err) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      err ? reject(err) : resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Local images cannot be fetched (file:// is closed to fetch and XHR), so each one is opened in one
// background tab, read there, and the tab is closed.
async function readFileImages(urls) {
  const out = {};
  if (!urls.length) return out;
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  try {
    for (const url of urls) {
      try {
        const ready = loaded(tab.id);
        await chrome.tabs.update(tab.id, { url });
        await ready;
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readOwnImage });
        out[url] = result;
      } catch {
        out[url] = null;
      }
    }
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
  return out;
}

async function readWebImages(urls) {
  const out = {};
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        const type = (res.headers.get('content-type') || 'image/png').split(';')[0];
        out[url] = type.startsWith('image/') ? `data:${type};base64,${base64(await res.arrayBuffer())}` : null;
      } catch {
        out[url] = null;
      }
    }),
  );
  return out;
}

const IMAGE_PATH = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
const imageUrl = (raw, scheme) => {
  try {
    const url = new URL(raw);
    return scheme.test(url.protocol) && IMAGE_PATH.test(url.pathname) ? url.href : null;
  } catch {
    return null;
  }
};

// Only image addresses are read, and files on the computer only for a document opened from the computer.
async function exportAssets(urls, fromFile) {
  const list = [...new Set(urls)].slice(0, 300);
  const files = fromFile ? list.map((u) => imageUrl(u, /^file:$/)).filter(Boolean) : [];
  const web = list.map((u) => imageUrl(u, /^https?:$/)).filter(Boolean);
  const [css, fileImages, webImages] = await Promise.all([getExportCss(), readFileImages(files), readWebImages(web)]);
  return { css, images: { ...fileImages, ...webImages } };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined || !MARKDOWN_URL.test(sender.url ?? '')) return;
  if (message?.type !== 'mdv:export') return;
  const urls = Array.isArray(message.images) ? message.images.filter((u) => typeof u === 'string') : [];
  exportAssets(urls, sender.url.startsWith('file:')).then(sendResponse, (err) =>
    sendResponse({ error: String(err?.message ?? err) }),
  );
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'mdv:mount' || sender.id !== chrome.runtime.id || sender.tab?.id === undefined) return;
  if (!MARKDOWN_URL.test(sender.url ?? '')) return;

  const target = { tabId: sender.tab.id, frameIds: [sender.frameId] };
  chrome.scripting
    .insertCSS({ target, files: CSS })
    .then(() => chrome.scripting.executeScript({ target, files: JS }))
    .then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }),
    );
  return true;
});
