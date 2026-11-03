"use strict";
// Markdown Reader — loading files (picker, drop, folders) and navigation between them.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// ---------- load files ----------
async function ingest(list){
  const epubs = list.some(x => EPUB.test(x.path));
  list = list.filter(x => TEXT.test(x.path) || IMG.test(x.path) || /^text\//.test((x.file && x.file.type) || ''));
  if (!list.some(x => !IMG.test(x.path))){ epubs ? epubElsewhere() : note(msg('nothingToRead')); return; }
  if (!edMayReplace()) return;
  closeFind(); searchIndex.clear(); indexing = null; gen++;
  imgs.forEach(u => URL.revokeObjectURL(u)); imgs.clear(); docs.clear();
  const tmp = new Map();
  for (const x of list){
    const p = norm(x.path);
    if (IMG.test(p)){ imgs.set(p, URL.createObjectURL(x.file)); continue; }
    // ignoreBOM keeps a byte order mark in the text, so a saved file starts with it again
    try { tmp.set(p, {path: p, text: x.text != null ? x.text : new TextDecoder('utf-8', {ignoreBOM: true}).decode(await x.file.arrayBuffer()), mtime: x.mtime || (x.file && x.file.lastModified) || 0}); } catch {}
  }
  const keys = [...tmp.keys()].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b, undefined, {numeric: true}));
  keys.forEach(k => docs.set(k, tmp.get(k))); // insertion order = sorted order (used by search results)
  const pick = $('pick');
  pick.innerHTML = keys.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  pick.hidden = keys.length < 2;
  pick.title = msg('pickTitle', {n: keys.length});
  $('searchBtn').hidden = false;
  const first = keys.find(k => /(^|\/)(readme|index|00[_-]?start[^/]*)\.md$/i.test(k)) || keys[0];
  curState = null;
  await go({p: first}, 'replace');
  if (epubs) epubElsewhere();
  else if (keys.length > 1) note(msg('filesLoaded', {n: keys.length}));
}
const epubElsewhere = () => note(msg('epubElsewhere'));

async function fromDrop(dt){
  // Everything must be grabbed synchronously: DataTransfer items expire after the first await.
  // Dropped FILES are read with getAsFile() (always works). Only dropped FOLDERS need a directory API:
  // on a page opened from disk (file://), Chrome/Edge on Windows refuse the old webkitGetAsEntry().file()
  // ("A URI supplied to the API was malformed"), so folders use the File System Access API first.
  const want = n => TEXT.test(n) || IMG.test(n) || EPUB.test(n);
  const items = [...(dt.items || [])].filter(i => i.kind === 'file').map(i => {
    let entry = null, handle = null, file = null;
    try { entry = i.webkitGetAsEntry ? i.webkitGetAsEntry() : null; } catch {}
    try { if (entry && entry.isDirectory && i.getAsFileSystemHandle) handle = i.getAsFileSystemHandle(); } catch {}
    try { file = i.getAsFile(); } catch {}
    return {entry, handle, file};
  });
  if (!items.length) return [...(dt.files || [])].map(f => ({file: f, path: f.name}));
  const out = []; let failed = 0;
  const walkHandle = async (h, prefix) => {
    if (out.length > 4000) return;
    if (h.kind === 'file'){ if (want(h.name)) out.push({file: await h.getFile(), path: prefix + h.name}); return; }
    if (SKIP_DIR.test(h.name)) return;
    for await (const c of h.values()) await walkHandle(c, prefix + h.name + '/');
  };
  const walkEntry = async (e, prefix) => {
    if (out.length > 4000) return;
    if (e.isFile){
      if (!want(e.name)) return;
      try { out.push({file: await new Promise((res, rej) => e.file(res, rej)), path: prefix + e.name}); } catch { failed++; }
    } else if (e.isDirectory){
      if (SKIP_DIR.test(e.name)) return;
      const r = e.createReader(); let batch;
      do { batch = await new Promise((res, rej) => r.readEntries(res, rej)); for (const c of batch) await walkEntry(c, prefix + e.name + '/'); } while (batch.length);
    }
  };
  for (const it of items){
    if (!(it.entry && it.entry.isDirectory)){ if (it.file) out.push({file: it.file, path: it.file.name}); continue; }
    const before = out.length;
    try { const h = it.handle && await it.handle; if (h){ await walkHandle(h, ''); continue; } } catch { out.length = before; }
    try { await walkEntry(it.entry, ''); } catch { failed++; }
  }
  if (!out.length && items.some(it => it.entry && it.entry.isDirectory))
    throw new Error(msg('folderBlocked'));
  if (failed) note(msg('folderFailed', {n: failed}));
  return out;
}

// ---------- navigation (state = {p: file, a: anchor, q/g/o: search hit}) ----------
function go(st, hist){
  if (!docs.has(st.p)) return;
  edLeave(true); // edits stay in memory, the file is still to save
  try { showMd(st.p, st.a || ''); }
  catch (e){ console.error(e); note(e.message || String(e)); if (!cur) goHome(); return; }
  if (st.q){ findQ = st.q; highlight(st.q, {g: st.g, o: st.o}); }
  else if (findQ) highlight(findQ, null);
  curState = {p: st.p, a: st.a || ''};
  if (st.q) Object.assign(curState, {q: st.q, g: st.g, o: st.o});
  const url = location.pathname + location.search;
  if (hist === 'push') history.pushState(curState, '', url); else if (hist === 'replace') history.replaceState(curState, '', url);
}

async function resumeScroll(f){
  if (!(f > 0)) return;
  const art = $('doc'); // wait for the page's images so it has its final height
  if (art) await Promise.race([Promise.all([...art.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => {}) : null)), new Promise(r => setTimeout(r, 1500))]);
  const h = document.documentElement;
  scrollTo({top: f * (h.scrollHeight - h.clientHeight), behavior: 'instant'});
}

function goHome(){
  edLeave(true);
  closeFind(); cur = null; curState = null; $('wrap').hidden = true; $('home').hidden = false; $('printBtn').hidden = true; $('wordBtn').hidden = true;
  $('crumbs').textContent = ''; $('meta').textContent = ''; document.title = msg('metaTitle');
  document.body.classList.remove('has-toc'); closeToc();
  if (spy) spy.disconnect(); scrollTo({top: 0}); onScroll(); edSync();
}
