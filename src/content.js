(() => {
  'use strict';

  const MARKDOWN_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

  if (!MARKDOWN_TYPES.has(document.contentType)) return;
  if (globalThis.MDV_SOURCE) return;

  // Chrome affiche les fichiers texte sous la forme <body><pre>…</pre></body>.
  const pre = document.body?.querySelector(':scope > pre');
  if (!pre) return;

  const root = document.documentElement;
  root.style.visibility = 'hidden';

  globalThis.MDV_SOURCE = {
    text: pre.textContent,
    name: fileName(),
    mtime: location.protocol === 'file:' ? Date.parse(document.lastModified) || 0 : 0,
  };

  chrome.runtime
    .sendMessage({ type: 'mdv:mount' })
    .then((res) => {
      if (!res?.ok) throw new Error(res?.error ?? 'injection failed');
    })
    .catch((err) => {
      console.error('[Markdown Reader]', err);
      root.style.removeProperty('visibility');
    });

  function fileName() {
    const last = location.pathname.split('/').pop() || 'README.md';
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  }
})();
