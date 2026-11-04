// What makes up the reader, for the tabs it is injected into (src/background.js) and for its own page
// (src/page.js). Needs reader/scripts.js first.
self.MDV_CSS = ['reader/design.css', 'reader/page.css', 'src/reader.css'];

// Classic scripts sharing one global scope, in this order (see src/adapter.js).
self.MDV_JS = [
  'vendor/purify.min.js',
  'vendor/highlight.min.js',
  'reader/marked.umd.js',
  'reader/page-html.js',
  'src/mount.js',
  ...self.READER_SCRIPTS.map((name) => `reader/${name}.js`),
  'src/adapter.js',
];
