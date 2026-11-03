"use strict";
// Markdown Reader — search across every open file, and the find bar.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// =====================================================================
// ---------- search across every open file ----------
// Text is split into blocks (paragraph, list item, cell…) the same way when indexing and when
// displaying, so a hit can be found again on the page, highlighted and scrolled to.
// Matching ignores case and accents ("ete" finds "été").
// =====================================================================
const foldCache = new Map();
function foldChar(c){
  let f = foldCache.get(c);
  if (f === undefined){ f = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); f = /\s/.test(c) ? ' ' : (f.length ? f[0] : c); foldCache.set(c, f); }
  return f;
}
function fold(s){ let o = ''; for (let i = 0; i < s.length; i++) o += foldChar(s[i]); return o; }
const normQ = q => String(q || '').trim().replace(/\s+/g, ' ');
const BLOCK = 'p,li,h1,h2,h3,h4,h5,h6,td,th,pre,blockquote,dt,dd,figcaption,caption,summary,div,section,article,aside,figure,header,footer';
function groupsOf(art){
  const map = new Map(), order = [], skip = '[data-ui],script,style,svg,mark.hit';
  const w = art.ownerDocument.createTreeWalker(art, NodeFilter.SHOW_TEXT);
  while (w.nextNode()){
    const n = w.currentNode;
    const pe = n.parentElement; if (!pe || pe.closest(skip)) continue;
    const bl = pe.closest(BLOCK) || art; let g = map.get(bl);
    if (!g){ g = {el: bl, nodes: [], t: ''}; map.set(bl, g); order.push(g); }
    g.nodes.push(n); g.t += n.nodeValue;
  }
  return order;
}
const searchIndex = new Map(); // path → {p, head, groups:[{t, f}]}
let indexing = null, gen = 0;
function ensureIndex(progress){
  if (indexing) return indexing;
  const g0 = gen;
  indexing = (async () => {
    const all = [...docs.values()]; let done = 0;
    for (const d of all){
      if (gen !== g0) return;
      progress && progress(msg('indexing', {i: ++done, n: all.length, s: d.path.split('/').pop()}));
      if (searchIndex.has(d.path)) continue;
      const {art} = buildMd(d.path);
      searchIndex.set(d.path, {p: d.path, head: d.path, groups: groupsOf(art).map(g => ({t: g.t, f: fold(g.t)}))});
    }
  })();
  return indexing;
}
const LIMIT = 500;
function runSearch(q, scope){
  const fq = fold(normQ(q)); if (fq.length < 2) return {hits: [], more: false};
  const hits = []; let more = false;
  const order = [...docs.keys()];
  const entries = [...searchIndex.values()].sort((a, b) => order.indexOf(a.p) - order.indexOf(b.p));
  outer: for (const e of entries){
    if (scope === 'doc' && e.p !== cur) continue;
    for (let gi = 0; gi < e.groups.length; gi++){
      const g = e.groups[gi]; let i = g.f.indexOf(fq), o = 0;
      while (i >= 0){
        if (hits.length >= LIMIT){ more = true; break outer; }
        hits.push({e, gi, o, i, len: fq.length}); o++;
        i = g.f.indexOf(fq, i + fq.length);
      }
    }
  }
  return {hits, more};
}
function snippet(t, i, len){
  const a = Math.max(0, i - 70), b = Math.min(t.length, i + len + 90);
  let pre = t.slice(a, i), post = t.slice(i + len, b);
  if (a > 0) pre = '…' + pre.replace(/^\S*\s/, ''); if (b < t.length) post = post.replace(/\s\S*$/, '') + '…';
  const c = s => esc(s.replace(/\s+/g, ' '));
  return c(pre) + '<mark>' + c(t.slice(i, i + len)) + '</mark>' + c(post);
}

// --- search panel ---
let scope = 'all', results = [], sel = -1, findQ = '', sxTimer = 0;
function openSearch(){
  if (!docs.size){ note(msg('openFileFirst')); return; }
  const sx = $('sx'); sx.hidden = false;
  const one = docs.size < 2;
  $('sxscope').hidden = one;
  const inp = $('sxq');
  if (!inp.value && findQ) inp.value = findQ;
  inp.placeholder = one ? msg('searchInFile') : msg('searchInN', {n: docs.size});
  inp.focus(); inp.select();
  document.body.style.overflow = 'hidden';
  const info = $('sxinfo');
  ensureIndex(m => { info.textContent = m; }).then(() => doSearch());
  if (searchIndex.size) doSearch();
}
function closeSearch(){ $('sx').hidden = true; document.body.style.overflow = ''; }
function doSearch(){
  const q = $('sxq').value, box = $('sxres'), info = $('sxinfo');
  if (normQ(q).length < 2){ box.innerHTML = `<div class="sxempty">${esc(msg('type2'))}<br><span>${msg('caseHint')}</span></div>`; results = []; sel = -1; info.textContent = countLabel(); return; }
  const {hits, more} = runSearch(q, scope); results = hits; sel = hits.length ? 0 : -1;
  if (!hits.length){ box.innerHTML = `<div class="sxempty">${esc(msg('noResults', {s: normQ(q)}))}</div>`; info.textContent = countLabel(); return; }
  const byEntry = new Map(); hits.forEach((h, k) => { if (!byEntry.has(h.e)) byEntry.set(h.e, []); byEntry.get(h.e).push(k); });
  let html = '';
  byEntry.forEach((ks, e) => {
    html += `<div class="sxg"><b>${esc(e.head)}</b><span>${ks.length}</span></div>`;
    ks.forEach(k => { const h = hits[k], g = h.e.groups[h.gi]; html += `<button type="button" class="sxh" data-r="${k}">${snippet(g.t, h.i, h.len)}</button>`; });
  });
  box.innerHTML = html; box.scrollTop = 0; markSel();
  const files = new Set(hits.map(h => h.e.p)).size;
  info.textContent = (more ? msg('firstN', {n: LIMIT}) : msgN('results', hits.length)) + (docs.size > 1 ? msgN('inFiles', files) : '');
}
const countLabel = () => { const n = docs.size; return n > 1 ? msg('filesOpen', {n}) : ''; };
function markSel(){
  const box = $('sxres');
  box.querySelectorAll('.sxh.sel').forEach(x => x.classList.remove('sel'));
  const el = box.querySelector(`.sxh[data-r="${sel}"]`); if (!el) return;
  el.classList.add('sel'); el.scrollIntoView({block: 'nearest'});
}
function openHit(k){
  const h = results[k]; if (!h) return;
  closeSearch();
  go({p: h.e.p, q: normQ($('sxq').value), g: h.gi, o: h.o}, 'push');
}
$('sxq').addEventListener('input', () => { clearTimeout(sxTimer); sxTimer = setTimeout(doSearch, 140); });
$('sxq').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown'){ e.preventDefault(); if (results.length){ sel = Math.min(results.length - 1, sel + 1); markSel(); } }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); if (results.length){ sel = Math.max(0, sel - 1); markSel(); } }
  else if (e.key === 'Enter'){ e.preventDefault(); clearTimeout(sxTimer); if (!results.length) doSearch(); if (sel >= 0) openHit(sel); }
});
$('sxres').addEventListener('click', e => { const b = e.target.closest('.sxh'); if (b) openHit(+b.dataset.r); });
$('sxres').addEventListener('mousemove', e => { const b = e.target.closest('.sxh'); if (b && +b.dataset.r !== sel){ sel = +b.dataset.r; markSel(); } });
$('sxscope').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (!b) return; scope = b.dataset.s; $('sxscope').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); doSearch(); $('sxq').focus(); });
$('sx').addEventListener('mousedown', e => { if (e.target === $('sx')) closeSearch(); });
$('searchBtn').onclick = openSearch;

// --- highlights on the page + find bar ---
let marks = [], mi = -1;
function clearMarks(){
  document.querySelectorAll('#doc mark.hit').forEach(m => { const p = m.parentNode; m.replaceWith(document.createTextNode(m.textContent)); p && p.normalize(); });
  marks = []; mi = -1;
}
function highlight(q, target){
  clearMarks();
  const art = $('doc'); const fq = fold(normQ(q));
  if (!art || fq.length < 2){ updateFind(); return; }
  let tHit = -1;
  // match on the whole block text, then wrap each text-node piece (a hit can span bold/italic/links)
  groupsOf(art).forEach((g, gi) => {
    const f = fold(g.t); let i = f.indexOf(fq), k = 0; if (i < 0) return;
    const offs = []; let acc = 0; g.nodes.forEach(n => { offs.push(acc); acc += n.nodeValue.length; });
    const segs = new Map();
    while (i >= 0){
      const h = marks.length, e = i + fq.length; marks.push([]);
      if (target && gi === target.g && k === target.o) tHit = h;
      g.nodes.forEach((n, ni) => { const s0 = offs[ni], a = Math.max(i, s0), b = Math.min(e, s0 + n.nodeValue.length); if (a < b){ if (!segs.has(ni)) segs.set(ni, []); segs.get(ni).push({a: a - s0, b: b - s0, h}); } });
      k++; i = f.indexOf(fq, e);
    }
    segs.forEach((list, ni) => {
      const n = g.nodes[ni], v = n.nodeValue, frag = document.createDocumentFragment(); let last = 0;
      list.forEach(sg => { frag.append(v.slice(last, sg.a)); const m = document.createElement('mark'); m.className = 'hit'; m.textContent = v.slice(sg.a, sg.b); frag.append(m); marks[sg.h].push(m); last = sg.b; });
      frag.append(v.slice(last)); n.replaceWith(frag);
    });
  });
  marks = marks.filter(x => x.length);
  if (target && tHit >= 0) setCur(tHit); else updateFind();
}
function setCur(i){
  if (!marks.length){ updateFind(); return; }
  mi = (i + marks.length) % marks.length;
  document.querySelectorAll('#doc mark.hit.cur').forEach(m => m.classList.remove('cur'));
  marks[mi].forEach(m => m.classList.add('cur'));
  const m = marks[mi][0], det = m.closest('details'); if (det) det.open = true;
  m.scrollIntoView({block: 'center', behavior: 'instant'});
  updateFind();
}
function updateFind(){
  const fb = $('fb');
  if (!findQ || !cur){ fb.hidden = true; document.body.classList.remove('has-fb'); return; }
  fb.hidden = false; document.body.classList.add('has-fb');
  $('fbq').textContent = '“' + findQ + '”';
  $('fbn').textContent = marks.length ? (mi >= 0 ? `${mi + 1} / ${marks.length}` : msg('onPage', {n: marks.length})) : msg('noneOnPage');
}
function closeFind(){ findQ = ''; clearMarks(); updateFind(); }
$('fbnext').onclick = () => setCur(mi + 1);
$('fbprev').onclick = () => setCur(mi < 0 ? marks.length - 1 : mi - 1);
$('fbx').onclick = closeFind;
$('fbq').onclick = () => { $('sxq').value = findQ; openSearch(); };
