"use strict";
// Markdown Reader — language switch, files from the OS (Open with / Share), drag & drop, paste.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// ---------- language switch (☰ menu, js/shared/shell.js saves it): re-translate and re-render what is on screen ----------
document.addEventListener('app-lang', async e => {
  if (e.detail === lang) return;
  lang = e.detail;
  applyStatic(); applyPrefs();
  if (curState && !edS){ // while editing, only the interface is translated
    const h = document.documentElement, f = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
    go(Object.assign({}, curState), null); resumeScroll(f);
  }
});

// ---------- files handed over by the OS: "Open with" (installed app) and "Share" (Android) ----------
if ('launchQueue' in window) launchQueue.setConsumer(async params => {
  if (!params.files || !params.files.length) return;
  try { const fs = await Promise.all(params.files.map(h => h.getFile())); ingest(fs.map(f => ({file: f, path: f.name}))); }
  catch (e){ note(msg('cantOpenFile', {s: e.message || e})); }
});
if (new URLSearchParams(location.search).has('shared') && 'caches' in window) (async () => {
  history.replaceState(null, '', location.pathname);
  try {
    const cache = await caches.open('imgpress-shared-files'), reqs = await cache.keys();
    const fs = await Promise.all(reqs.map(async q => { const res = await cache.match(q); return new File([await res.blob()], decodeURIComponent(res.headers.get('x-file-name') || 'shared.md'), {type: res.headers.get('content-type') || ''}); }));
    await caches.delete('imgpress-shared-files');
    if (fs.length) ingest(fs.map(f => ({file: f, path: f.name}))); else note(msg('shareEmpty'));
  } catch (e){ note(msg('shareFailed', {s: e.message || e})); }
})();

// ---------- drag & drop anywhere on the page ----------
let dragDepth = 0;
const hasFiles = e => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files');
addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('over').classList.add('on'); });
addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0){ dragDepth = 0; $('over').classList.remove('on'); } });
addEventListener('drop', async e => {
  if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $('over').classList.remove('on');
  try { closeSearch(); await ingest(await fromDrop(e.dataTransfer)); } catch (err){ note(msg('dropFailed', {s: err.message || err})); }
});

// ---------- paste Markdown text (or a copied file) ----------
document.addEventListener('paste', async e => {
  if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
  const cd = e.clipboardData; if (!cd) return;
  const fs = [...cd.files]; if (fs.length){ e.preventDefault(); ingest(fs.map(f => ({file: f, path: f.name}))); return; }
  const t = cd.getData('text/plain'); if (!t || !t.trim()) return;
  e.preventDefault(); ingest([{path: 'Pasted.md', text: t, mtime: Date.now()}]);
});
