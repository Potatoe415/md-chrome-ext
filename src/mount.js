"use strict";
// Turns Chrome's plain-text page into the Markdown Reader page. Must run before the reader scripts:
// their top-level code looks up the page's elements.
(() => {
  const head = document.head ?? document.documentElement.insertBefore(document.createElement('head'), document.body);
  head.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => el.remove());

  const viewport = document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1';
  const description = document.createElement('meta');
  description.name = 'description';
  description.id = 'doc-description';
  head.append(viewport, description);

  document.body.removeAttribute('style');
  document.body.innerHTML = MR_PAGE;

  const font = new FontFace(
    'DM Sans',
    `url(${chrome.runtime.getURL('fonts/dm-sans-latin-wght.woff2')}) format('woff2')`,
    { weight: '100 1000', style: 'normal', display: 'swap' },
  );
  document.fonts.add(font);
  font.load().catch(() => {});
})();
