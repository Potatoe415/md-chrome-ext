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
  root.replaceChildren(DOMPurify.sanitize(root.innerHTML, { ...MDV_PURIFY, RETURN_DOM_FRAGMENT: true }));
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

// Left panel listing every heading, open on wide screens and folding to a rail. It replaces the reader's
// own contents (h2 / h3 only, beside the text from 3 headings).
const mdvNav = (() => {
  const el = (tag, attrs = {}, ns) => {
    const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const icon = el('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, SVG);
  icon.append(el('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }, SVG), el('path', { d: 'M9 4v16' }, SVG));
  const btn = el('button', { type: 'button', class: 'mdv-nav-btn', 'aria-expanded': 'false', 'aria-controls': 'mdvNavList' });
  btn.append(icon);
  const title = el('span', { class: 'mdv-nav-h' });
  const bar = el('div', { class: 'mdv-nav-top' });
  bar.append(btn, title);
  const list = el('div', { class: 'mdv-nav-list', id: 'mdvNavList' });
  const nav = el('nav', { class: 'mdv-nav', 'data-ui': '' });
  nav.append(bar, list);
  document.body.append(nav);
  const narrow = () => matchMedia('(max-width: 1099px)').matches;
  let observer = null, started = false;

  const setOpen = (open) => {
    document.body.classList.toggle('mdv-nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  const mark = (a) => {
    if (!a) return;
    list.querySelectorAll('a.on').forEach((x) => x.classList.remove('on'));
    a.classList.add('on');
    const lr = list.getBoundingClientRect(), ar = a.getBoundingClientRect();
    if (lr.height && (ar.top < lr.top || ar.bottom > lr.bottom)) list.scrollTop += ar.top - lr.top - lr.height / 3;
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!document.body.classList.contains('mdv-nav-open'));
  });
  list.addEventListener('click', (e) => {
    if (narrow() && e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (narrow() && !nav.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && narrow()) setOpen(false);
  });

  function show(art) {
    observer?.disconnect();
    observer = null;
    btn.title = msg('contents');
    btn.setAttribute('aria-label', msg('contents'));
    title.textContent = msg('onThisPage');
    const heads = [...art.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')].filter((h) => h.textContent.trim());
    const top = Math.min(...heads.map((h) => +h.tagName[1]));
    const links = new Map();
    list.replaceChildren(
      ...heads.map((h) => {
        const a = document.createElement('a');
        a.href = `#${h.id}`;
        a.textContent = h.textContent.trim();
        a.title = a.textContent;
        a.style.setProperty('--lvl', +h.tagName[1] - top);
        links.set(h.id, a);
        return a;
      }),
    );
    document.body.classList.toggle('mdv-nav-on', heads.length > 0);
    if (!started) {
      started = true;
      setOpen(!narrow());
    }
    mark(list.firstElementChild);
    if (!heads.length) return;
    observer = new IntersectionObserver(
      (entries) => entries.forEach((en) => en.isIntersecting && mark(links.get(en.target.id))),
      { rootMargin: '-80px 0px -70% 0px' },
    );
    heads.forEach((h) => observer.observe(h));
  }

  function hide() {
    observer?.disconnect();
    observer = null;
    document.body.classList.remove('mdv-nav-on');
  }

  return { show, hide };
})();

const mrShowMd = showMd;
showMd = (path, anchor) => {
  mrShowMd(path, anchor);
  spy?.disconnect();
  spy = null;
  $('toc')?.remove();
  $('wrap').classList.remove('has-toc');
  document.body.classList.remove('has-toc');
  mdvNav.show($('doc'));
};

const mrGoHome = goHome;
goHome = () => {
  mrGoHome();
  mdvNav.hide();
};
$('homeBtn').onclick = goHome;

// The extension is in English only: no ☰ language menu, the reader's strings in English.
$('appMenu').remove();
$('homeBtn').querySelector('.nm').textContent = 'Markdown CoolReader';
(() => {
  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('icons/logo-32.png');
  logo.srcset = `${logo.src} 1x, ${chrome.runtime.getURL('icons/logo-64.png')} 2x, ${chrome.runtime.getURL('icons/logo-128.png')} 4x`;
  logo.alt = '';
  $('homeBtn').querySelector('.mk').replaceChildren(logo);
})();
I18N.metaTitle.en = 'Markdown CoolReader';
I18N.epubElsewhere.en = 'EPUB books are not supported: only Markdown and text files open here.';
lang = 'en';
applyStatic();
applyPrefs();

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
