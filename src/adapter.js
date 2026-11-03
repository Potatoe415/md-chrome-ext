"use strict";
// Runs last, in the reader's global scope. The reader's top-level functions are global bindings: the ones
// replaced here keep the upstream behaviour and add what a document opened from its own URL needs.

const MDV_PURIFY = {
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};
let mdvGen = -1;
// true while the open files are still the one this tab was opened on (an Open or a drop replaces them)
const mdvOwnDoc = () => gen === mdvGen;
const mdvUrl = (raw) => {
  try {
    return new URL(raw, location.href).href;
  } catch {
    return null;
  }
};

// The reader strips scripts and event handlers; DOMPurify also removes srcdoc, SVG animations and the rest.
const mrSanitize = sanitize;
sanitize = (root) => {
  mrSanitize(root);
  root.innerHTML = DOMPurify.sanitize(root.innerHTML, MDV_PURIFY);
};

// Images beside the file load from their real address instead of a dropped folder.
const mrResolveIn = resolveIn;
resolveIn = (map, raw, dir) => {
  const hit = mrResolveIn(map, raw, dir);
  if (hit || map !== imgs || !mdvOwnDoc()) return hit;
  const src = String(raw || '').trim();
  if (!src || /^(?!file:)[a-z][a-z0-9+.-]*:/i.test(src)) return null;
  const url = mdvUrl(src);
  if (url) imgs.set(url, url);
  return url;
};

// Links to other files open them in the browser, where this extension formats them in turn.
const mrBuildMd = buildMd;
buildMd = (path) => {
  const built = mrBuildMd(path);
  if (mdvOwnDoc()) {
    built.art.querySelectorAll('a[data-missing]').forEach((a) => {
      const url = mdvUrl(a.dataset.missing);
      if (!url) return;
      a.href = url;
      a.classList.remove('missing');
      a.removeAttribute('data-missing');
      a.removeAttribute('title');
    });
  }
  return built;
};

// Syntax highlighting of fenced code (reading view only: the editor renders its own blocks).
const mrEnhance = enhance;
enhance = (root) => {
  mrEnhance(root);
  root.querySelectorAll('pre > code[class*="language-"]').forEach((code) => {
    const lang = /\blanguage-([\w+#.-]+)/.exec(code.className)?.[1];
    if (lang && hljs.getLanguage(lang)) hljs.highlightElement(code);
  });
};

// ☰ menu: language. Upstream this is src/shared/shell.js, which fires the `app-lang` event boot.js listens to.
(() => {
  const box = $('appMenu'), btn = $('appMenuBtn'), panel = $('appMenuPanel');
  const setOpen = (open) => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!box.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    setOpen(false);
    if (b.dataset.lang === lang) return;
    try {
      localStorage.setItem('imgpress-lang', b.dataset.lang);
    } catch {}
    document.dispatchEvent(new CustomEvent('app-lang', { detail: b.dataset.lang }));
  });
})();

(async () => {
  const { text, name, mtime } = globalThis.MDV_SOURCE;
  const url = location.href;
  let anchor = location.hash.slice(1);
  try {
    anchor = decodeURIComponent(anchor);
  } catch {}
  try {
    mdvGen = gen + 1;
    await ingest([{ path: name, text, mtime }]);
    if (anchor && cur) go({ p: cur, a: anchor }, null);
    history.replaceState(curState, '', url);
  } finally {
    document.documentElement.style.removeProperty('visibility');
  }
})();
