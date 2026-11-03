"use strict";
// Markdown Reader — editing commands. Only what Markdown can write is offered: headings, bold, italic,
// strikethrough, code, links, lists, tasks, quotes, code blocks, lines, tables, and the "# ", "- "… shortcuts.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// ---------- where the caret is ----------
function edCtx(){
  const ed = edS.ed, r = edS.range;
  let n = r && ed.contains(r.startContainer) ? r.startContainer : ed; if (n.nodeType === 3) n = n.parentNode;
  const up = sel => { const x = n.closest(sel); return x && x !== ed && ed.contains(x) ? x : null; };
  return {n, pre: up('pre'), code: up('code'), cell: up('td,th'), li: up('li'), quote: up('blockquote'), a: up('a')};
}
const edSel = () => { const s = getSelection(); return s.rangeCount ? s.getRangeAt(0) : null; };
const edHere = () => { const r = edSel(); if (!r) return null; const n = r.startContainer; return n.nodeType === 3 ? n.parentNode : n; };
function edTopOf(n){ const ed = edS.ed; if (!n || n === ed) return null; while (n && n.parentNode !== ed) n = n.parentNode; return n; }
// the editor's children touched by the selection
function edTopBlocks(){
  const r = edSel(); if (!r) return [];
  const at = (c, o, end) => c === edS.ed ? edS.ed.childNodes[Math.max(0, end ? o - 1 : o)] : edTopOf(c);
  const a = at(r.startContainer, r.startOffset), z = at(r.endContainer, r.endOffset, !r.collapsed) || a;
  const out = []; for (let n = a; n; n = n.nextSibling){ out.push(n); if (n === z) break; }
  return out.filter(n => n.nodeType === 1 && !n.hasAttribute('data-lock'));
}
// list items touched by the selection (the innermost ones)
function edItems(){
  const r = edSel(); if (!r) return [];
  const lis = [...edS.ed.querySelectorAll('li')].filter(li => r.intersectsNode(li));
  return lis.filter(li => !lis.some(o => o !== li && li.contains(o)));
}
// run fn, then put the selection back on the same nodes (moving nodes would lose it)
function edKeep(fn){
  const s = getSelection(), r = edSel(), b = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
  fn();
  if (b && edS.ed.contains(b[0]) && edS.ed.contains(b[2])) try {
    const n = document.createRange(); n.setStart(b[0], Math.min(b[1], edLen(b[0]))); n.setEnd(b[2], Math.min(b[3], edLen(b[2])));
    s.removeAllRanges(); s.addRange(n);
  } catch {}
}
function edFocus(){
  const ed = edS.ed, s = getSelection(), r = edSel();
  if (!(r && ed.contains(r.startContainer))){
    if (edS.range && ed.contains(edS.range.startContainer)){ s.removeAllRanges(); s.addRange(edS.range); }
    else edCaret(ed.firstElementChild || ed, false);
  }
  ed.focus({preventScroll: true});
}
function edNewPara(after){ const p = document.createElement('p'); p.append(document.createElement('br')); after.after(p); return p; }
// insert el after the block holding the caret; an empty paragraph there is kept for after el
function edAfterTop(el){
  const r = edSel(), t = r ? edTopOf(r.startContainer) || (r.startContainer === edS.ed ? edS.ed.childNodes[r.startOffset - 1] : null) : null;
  const empty = !!t && t.tagName === 'P' && !t.textContent.trim() && !t.querySelector('img,[data-md]');
  if (!t) edS.ed.append(el); else if (empty) t.before(el); else t.after(el);
  return empty ? t : (el.nextElementSibling && el.nextElementSibling.tagName === 'P' ? el.nextElementSibling : edNewPara(el));
}

// ---------- commands ----------
const edExec = (cmd, v) => { try { return document.execCommand(cmd, false, v == null ? null : v); } catch { return false; } };
// in headings and table headers, already drawn bold, the browser's bold command would remove boldness instead
function edBold(){
  const h = edHere(), heavy = h && h.closest('h1,h2,h3,h4,h5,h6,th');
  if (!heavy || !edS.ed.contains(heavy)) return edExec('bold');
  const x = h.closest('b,strong');
  if (x && heavy.contains(x)){ edKeep(() => x.replaceWith(...x.childNodes)); return; }
  const r = edSel(); if (!r || r.collapsed || !heavy.contains(r.endContainer)) return;
  const el = document.createElement('strong'); el.append(r.extractContents()); r.insertNode(el);
  const n = document.createRange(); n.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(n);
}
function edSetBlock(tag){ edExec('formatBlock', '<' + tag + '>'); }
function edSetTask(items, on){
  const added = [];
  edKeep(() => items.forEach(li => {
    const box = mdTaskBox(li);
    if (on && !box){
      const i = document.createElement('input'); i.type = 'checkbox';
      (li.firstElementChild && li.firstElementChild.tagName === 'P' ? li.firstElementChild : li).prepend(i);
      added.push(i);
    }
    if (!on && box) box.remove();
  }));
  // a caret left in front of a new box goes after it, where the text is
  const r = edSel(), i = r && r.collapsed && added.find(x => x.parentNode === r.startContainer && r.startOffset === 0);
  if (i){ const n = document.createRange(); n.setStartAfter(i); n.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(n); }
}
// ---------- lists (done by hand: the browser's list commands nest lists inside paragraphs) ----------
const ED_BLOCK = 'p,h1,h2,h3,h4,h5,h6,div,pre';
function edBlockAt(n){ const e = n.nodeType === 3 ? n.parentNode : n; const b = e.closest(ED_BLOCK); return b && b !== edS.ed && edS.ed.contains(b) && !b.closest('li,td,th,[data-lock]') ? b : null; }
// the paragraphs / headings touched by the selection, when they sit side by side
function edRangeBlocks(){
  const r = edSel(); if (!r) return [];
  const a = edBlockAt(r.startContainer) || (r.startContainer === edS.ed ? edS.ed.childNodes[r.startOffset] : null), z = edBlockAt(r.endContainer) || a;
  if (!a || a.nodeType !== 1) return [];
  if (!z || z.parentNode !== a.parentNode) return [a];
  const out = []; for (let n = a; n; n = n.nextSibling){ if (n.nodeType === 1 && !n.hasAttribute('data-lock')) out.push(n); if (n === z) break; }
  return out;
}
function edMakeList(tag){
  const blocks = edRangeBlocks(); if (!blocks.length) return null;
  let list = document.createElement(tag), first = null;
  edKeep(() => {
    blocks[0].before(list);
    blocks.forEach(b => {
      const li = document.createElement('li');
      if (b.tagName === 'PRE') li.append(b); else { li.append(...b.childNodes); b.remove(); }
      if (!li.firstChild) li.append(document.createElement('br'));
      list.append(li); first = first || li;
    });
    const prev = list.previousElementSibling, next = list.nextElementSibling;
    if (prev && prev.tagName === tag){ prev.append(...list.childNodes); list.remove(); list = prev; }
    if (next && next.tagName === tag){ list.append(...next.childNodes); next.remove(); }
  });
  edEnsureIn(first);
  return list;
}
// the caret is inside el (or one of its siblings in the same parent), else it goes into el
function edEnsureIn(el){
  const h = edHere(), ok = h && el && el.parentNode && [...el.parentNode.children].some(x => x.contains(h));
  if (!ok && el) edCaret(el, !!el.textContent.trim());
}
// list items → paragraphs, splitting the list around them
function edUnlist(items){
  let last = null;
  edKeep(() => items.forEach(li => {
    const list = li.parentElement, after = [];
    for (let n = li.nextSibling; n; n = n.nextSibling) after.push(n);
    const box = mdTaskBox(li); if (box) box.remove();
    const out = [], p = document.createElement('p');
    [...li.childNodes].forEach(n => { if (mdIsInline(n)) p.append(n); else out.push(n); });
    if (p.childNodes.length || !out.length){ if (!p.textContent.trim() && !p.querySelector('img,br,[data-md]')) p.append(document.createElement('br')); out.unshift(p); }
    list.after(...out);
    if (after.some(n => n.nodeType === 1)){
      const more = document.createElement(list.tagName);
      if (list.tagName === 'OL') more.setAttribute('start', String((Number(list.getAttribute('start')) || 1) + [...list.children].indexOf(li) + 1));
      more.append(...after); out[out.length - 1].after(more);
    }
    li.remove(); if (!list.querySelector('li')) list.remove();
    last = out[0];
  }));
  edEnsureIn(last);
}
function edRetag(list, tag){
  const n = document.createElement(tag);
  edKeep(() => { list.before(n); n.append(...list.childNodes); list.remove(); });
  return n;
}
function edToggleList(tag){
  const c = edCtx();
  if (!c.li) return edMakeList(tag);
  const list = c.li.parentElement, items = edItems();
  if (list.tagName !== tag) return edRetag(list, tag);
  if (tag === 'UL' && items.some(mdTaskBox)) return edSetTask(items, false); // a task list becomes a plain one
  edUnlist(items);
}
function edToggleTask(){
  if (!edCtx().li && !edMakeList('UL')) return;
  edS.range = edSel();
  const items = edItems(); if (!items.length) return;
  edSetTask(items, !mdTaskBox(items[0]));
}
function edIndent(li){
  const prev = li.previousElementSibling; if (!prev || prev.tagName !== 'LI') return;
  const tag = li.parentElement.tagName;
  edKeep(() => { let sub = prev.lastElementChild; if (!sub || sub.tagName !== tag){ sub = document.createElement(tag); prev.append(sub); } sub.append(li); });
}
function edOutdent(li){
  const list = li.parentElement, up = list.parentElement;
  if (!up || up.tagName !== 'LI'){ edUnlist([li]); return; }
  edKeep(() => {
    const after = []; for (let n = li.nextSibling; n; n = n.nextSibling) after.push(n);
    up.after(li);
    if (after.some(n => n.nodeType === 1)){ const sub = document.createElement(list.tagName); sub.append(...after); li.append(sub); }
    if (!list.querySelector('li')) list.remove();
  });
}
function edToggleQuote(){
  const q = edCtx().quote;
  if (q){
    edKeep(() => {
      let para = null;
      [...q.childNodes].forEach(k => {
        if (mdIsInline(k)){ if (!para){ para = document.createElement('p'); q.before(para); } para.append(k); }
        else { para = null; q.before(k); }
      });
      q.remove();
    });
    return;
  }
  const blocks = edTopBlocks(); if (!blocks.length) return;
  edKeep(() => { const bq = document.createElement('blockquote'); blocks[0].before(bq); bq.append(...blocks); });
}
function edNewPre(text){
  const pre = document.createElement('pre'), code = document.createElement('code');
  pre.spellcheck = false; code.textContent = text; code.append(document.createElement('br')); pre.append(code);
  return pre;
}
function edToggleCodeBlock(){
  const c = edCtx();
  if (c.pre){
    const ps = mdPreText(c.pre).replace(/\n+$/, '').split('\n').map(l => { const p = document.createElement('p'); if (l) p.textContent = l; else p.append(document.createElement('br')); return p; });
    c.pre.replaceWith(...ps); edCaret(ps[ps.length - 1], true);
    return;
  }
  if (c.cell) return;
  const blocks = c.li ? [] : edTopBlocks().filter(b => /^(P|H[1-6]|DIV)$/.test(b.tagName));
  if (!blocks.length){ const pre = edNewPre(''); edAfterTop(pre); edCaret(pre.firstChild, false); return; }
  const pre = edNewPre(blocks.map(b => mdPreText(b).replace(/\n+$/, '')).join('\n'));
  blocks[0].before(pre); blocks.forEach(b => b.remove());
  const r = document.createRange(), code = pre.firstChild; r.setStartBefore(code.lastChild); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function edToggleCode(){
  const c = edCtx(); if (c.pre) return;
  const s = getSelection(), r = edSel(); if (!r) return;
  if (c.code){ edKeep(() => c.code.replaceWith(...c.code.childNodes)); return; }
  const code = document.createElement('code');
  code.textContent = r.collapsed ? msg('edCodePh') : r.toString().replace(/\s*\n\s*/g, ' ');
  if (!code.textContent.trim()) return;
  r.deleteContents(); r.insertNode(code);
  const n = document.createRange(); n.selectNodeContents(code); s.removeAllRanges(); s.addRange(n);
}
function edInsertHr(){ const hr = document.createElement('hr'); edCaret(edAfterTop(hr), false); }
function edInsertTable(){
  const t = document.createElement('table'), head = t.createTHead().insertRow(), body = t.createTBody();
  for (let i = 0; i < 3; i++){ const th = document.createElement('th'); th.textContent = msg('edCol', {n: i + 1}); head.append(th); }
  for (let r = 0; r < 2; r++){ const row = body.insertRow(); for (let i = 0; i < 3; i++) row.append(document.createElement('td')); }
  edAfterTop(t);
  const r = document.createRange(); r.selectNodeContents(head.cells[0]);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function edTableOp(op, cell){
  cell = cell || edCtx().cell; if (!cell) return null;
  const row = cell.parentElement, table = cell.closest('table'), idx = cell.cellIndex;
  const ncol = Math.max(...[...table.rows].map(x => x.cells.length));
  if (op === 'rowAdd'){
    const tr = document.createElement('tr');
    for (let i = 0; i < ncol; i++){ const td = document.createElement('td'), h = table.rows[0].cells[i], a = h && h.getAttribute('align'); if (a) td.setAttribute('align', a); tr.append(td); }
    if (row.parentElement.tagName === 'THEAD') (table.tBodies[0] || table.createTBody()).prepend(tr); else row.after(tr);
    edCaret(tr.cells[Math.min(idx, ncol - 1)], false);
    return tr;
  }
  if (op === 'colAdd'){
    [...table.rows].forEach(x => { const n = document.createElement(x.parentElement.tagName === 'THEAD' ? 'th' : 'td'), ref = x.cells[idx]; if (ref) ref.after(n); else x.append(n); });
    edCaret(row.cells[idx + 1], false);
  }
  if (op === 'rowDel'){
    if (row.rowIndex === 0) return null; // Markdown tables always have their header row
    const next = row.nextElementSibling || row.previousElementSibling || table.rows[0];
    row.remove(); edCaret(next.cells[Math.min(idx, next.cells.length - 1)] || next, false);
  }
  if (op === 'colDel'){
    if (ncol <= 1){ const p = edNewPara(table); table.remove(); edCaret(p, false); return true; }
    [...table.rows].forEach(x => { if (x.cells[idx]) x.cells[idx].remove(); });
    edCaret(row.cells[Math.min(idx, row.cells.length - 1)], false);
  }
  return true;
}
function edCellMove(cell, dir){
  const table = cell.closest('table'), rows = [...table.rows], row = cell.parentElement;
  if (dir === 'down'){
    const next = rows[row.rowIndex + 1];
    if (next) edCaret(next.cells[Math.min(cell.cellIndex, next.cells.length - 1)], true); else edTableOp('rowAdd', cell);
    return;
  }
  const cells = rows.flatMap(x => [...x.cells]), i = cells.indexOf(cell) + (dir === 'next' ? 1 : -1);
  if (i >= cells.length){ const tr = edTableOp('rowAdd', cell); if (tr) edCaret(tr.cells[0], false); return; }
  if (i < 0) return;
  const r = document.createRange(); r.selectNodeContents(cells[i]);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
// "# ", "- ", "1. ", "> ", "[ ] " typed at the start of a paragraph become what they mean in Markdown
function edAutoFormat(){
  const r = edSel(); if (!r || !r.collapsed) return false;
  const c = edCtx(); if (c.pre || c.code || c.cell) return false;
  const blk = c.n.closest('p,li'); if (!blk || !edS.ed.contains(blk)) return false;
  const head = document.createRange(); head.setStart(blk, 0); head.setEnd(r.startContainer, r.startOffset);
  const t = head.toString().replace(/\u00a0/g, ' '), para = blk.tagName === 'P' && !blk.closest('li');
  // an emptied block keeps a <br> for the caret, else the browser formats the next block instead
  const strip = () => {
    head.deleteContents(); blk.normalize();
    if (!blk.firstChild){ blk.append(document.createElement('br')); edCaret(blk, false); }
  };
  let m;
  if (para && (m = /^(#{1,6}) $/.exec(t))){ strip(); edSetBlock('h' + m[1].length); }
  else if (para && /^[-*+] $/.test(t)){ strip(); edMakeList('UL'); }
  else if (para && (m = /^(\d{1,9})[.)] $/.exec(t))){
    strip(); const ol = edMakeList('OL');
    if (ol && +m[1] !== 1 && ol.children.length === 1) ol.setAttribute('start', String(+m[1]));
  }
  else if (para && t === '> '){ strip(); edToggleQuote(); }
  else if ((m = /^\[( |x|X)\] $/.exec(t)) && !(blk.closest('li') && mdTaskBox(blk.closest('li')))){
    strip(); if (!blk.closest('li')) edMakeList('UL');
    const li = edHere() && edHere().closest('li');
    if (li){ edSetTask([li], true); if (m[1] !== ' ') mdTaskBox(li).setAttribute('checked', ''); }
  }
  else return false;
  return true;
}

