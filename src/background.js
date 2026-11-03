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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'mdv:mount' || sender.tab?.id === undefined) return;

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
