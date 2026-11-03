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
