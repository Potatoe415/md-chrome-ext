"use strict";
// Markdown Reader — menus, contents panel, scroll progress, clicks and keyboard shortcuts.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// ---------- mobile: one ⋮ menu instead of Open / Theme / Word / Print ----------
function syncMore(){
  const hasDoc = !!cur && !$('wrap').hidden;
  $('mmThemeVal').textContent = msg(LABEL[theme]);
  $('mmWord').hidden = $('mmPrint').hidden = $('mmSep').hidden = !hasDoc;
}
$('moreBtn').onclick = () => {
  const m = $('moreMenu'), r = $('moreBtn').getBoundingClientRect();
  syncMore();
  m.style.top = (r.bottom + 8) + 'px'; m.style.right = Math.max(8, innerWidth - r.right) + 'px';
  m.hidden = !m.hidden;
};
const mm = (id, fn, keep) => { $(id).onclick = () => { if (!keep) $('moreMenu').hidden = true; fn(); }; };
mm('mmOpen', () => $('fileIn').click());
mm('mmFolder', () => $('dirIn').click());
mm('mmTheme', () => { cycleTheme(); syncMore(); }, true);
mm('mmTypo', () => openTypo($('moreBtn')));
mm('mmWord', saveDocx);
mm('mmPrint', () => print());

// ---------- contents panel on narrow screens (floating button, bottom left) ----------
const narrow = () => matchMedia('(max-width: 1099px)').matches;
function openToc(){
  const toc = $('toc'); if (!toc) return;
  document.body.classList.add('toc-open'); $('tocFab').setAttribute('aria-expanded', 'true');
  const on = toc.querySelector('a.on'); if (on) toc.scrollTop = on.offsetTop - toc.clientHeight / 2;
}
function closeToc(){ document.body.classList.remove('toc-open'); $('tocFab').setAttribute('aria-expanded', 'false'); }
$('tocFab').onclick = () => document.body.classList.contains('toc-open') ? closeToc() : openToc();
$('scrim').onclick = closeToc;
document.addEventListener('click', e => { if (narrow() && e.target.closest && e.target.closest('#toc a')) setTimeout(closeToc, 0); }, true);

// ---------- scroll progress + table-of-contents highlight ----------
const bar = $('bar'), totop = $('totop');
function onScroll(){ const h = document.documentElement, max = h.scrollHeight - h.clientHeight; bar.style.width = (cur && max > 0 ? h.scrollTop / max * 100 : 0) + '%'; totop.classList.toggle('on', !!cur && h.scrollTop > 900); }
addEventListener('scroll', onScroll, {passive: true});
totop.onclick = () => scrollTo({top: 0});
function setupSpy(links, fallback){
  if (spy) spy.disconnect(); spy = null;
  const toc = $('toc'); if (!toc) return;
  const mark = a => {
    toc.querySelectorAll('a.on').forEach(x => x.classList.remove('on')); a.classList.add('on');
    const tr = toc.getBoundingClientRect(), cr = a.getBoundingClientRect();
    if (tr.height && (cr.top < tr.top || cr.bottom > tr.bottom)) toc.scrollTop += cr.top - tr.top - tr.height / 3;
  };
  if (fallback) mark(fallback);
  const ids = Object.keys(links); if (!ids.length || !('IntersectionObserver' in window)) return;
  spy = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting && links[en.target.id]) mark(links[en.target.id]); }), {rootMargin: '-80px 0px -70% 0px'});
  ids.forEach(id => { const el = document.getElementById(id); if (el) spy.observe(el); });
}

// ---------- clicks ----------
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('[data-open], a[data-missing]'); if (!a) return;
  e.preventDefault();
  if (a.dataset.missing){ note(msg('linkMissing', {s: a.dataset.missing})); return; }
  go({p: a.dataset.open, a: a.dataset.anchor || ''}, 'push');
});
addEventListener('popstate', e => {
  const st = e.state; if (!st || !st.p || !docs.has(st.p)) return;
  if (curState && st.p === curState.p && !st.a && !st.q) return;
  go(st, null);
});
$('pick').onchange = e => go({p: e.target.value}, 'push');
$('homeBtn').onclick = goHome;
$('printBtn').onclick = () => print();
const openPicker = () => $('fileIn').click();
$('openBtn').onclick = openPicker; $('chooseBtn').onclick = e => { e.stopPropagation(); openPicker(); };
$('folderBtn').onclick = e => { e.stopPropagation(); $('dirIn').click(); };
$('drop').onclick = openPicker;
$('drop').onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openPicker(); } };
$('fileIn').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) ingest(fs.map(f => ({file: f, path: f.name}))); };
$('dirIn').onchange = e => {
  const fs = [...e.target.files].filter(f => !(f.webkitRelativePath || '').split('/').some(s => SKIP_DIR.test(s))); e.target.value = '';
  if (fs.length) ingest(fs.map(f => ({file: f, path: f.webkitRelativePath || f.name})));
};
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey, typing = e.target.closest && e.target.closest('input, select, textarea, [contenteditable]');
  const sxOpen = !$('sx').hidden;
  if (mod && k === 'o'){ e.preventDefault(); openPicker(); return; }
  if ((mod && k === 'k') || (mod && e.shiftKey && k === 'f') || (!mod && !typing && e.key === '/' && docs.size)){ e.preventDefault(); sxOpen ? closeSearch() : openSearch(); return; }
  if (e.key === 'Escape' && !$('moreMenu').hidden){ $('moreMenu').hidden = true; return; }
  if (e.key === 'Escape' && !$('typoMenu').hidden){ $('typoMenu').hidden = true; return; }
  if (e.key === 'Escape' && document.body.classList.contains('toc-open')){ closeToc(); return; }
  if (e.key === 'Escape'){ if (sxOpen){ e.preventDefault(); closeSearch(); } else if (findQ){ closeFind(); } return; }
  if (sxOpen) return;
  if (e.key === 'F3' && findQ){ e.preventDefault(); e.shiftKey ? $('fbprev').click() : $('fbnext').click(); }
});
