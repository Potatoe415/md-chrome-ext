"use strict";
// Turns Chrome's plain-text page into the Markdown Reader page. Must run before the reader scripts:
// their top-level code looks up the page's elements.
(() => {
  const head = document.head ?? document.documentElement.insertBefore(document.createElement('head'), document.body);
  // Chrome's own text-page styles go; the reader's, on its extension page, stay.
  head.querySelectorAll('style:not([data-mdv]), link[rel="stylesheet"]:not([data-mdv])').forEach((el) => el.remove());

  const viewport = document.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1';
  const description = document.createElement('meta');
  description.name = 'description';
  description.id = 'doc-description';
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = chrome.runtime.getURL('icons/icon-32.png');
  head.append(viewport, description, icon);

  document.body.removeAttribute('style');
  const page = new DOMParser().parseFromString(MR_PAGE, 'text/html');
  document.body.replaceChildren(...[...page.body.childNodes].map((node) => document.importNode(node, true)));

  const font = new FontFace(
    'DM Sans',
    `url(${chrome.runtime.getURL('fonts/dm-sans-latin-wght.woff2')}) format('woff2')`,
    { weight: '100 1000', style: 'normal', display: 'swap' },
  );
  document.fonts.add(font);
  font.load().catch(() => {});
})();
