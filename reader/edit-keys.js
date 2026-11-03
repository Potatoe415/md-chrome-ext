"use strict";
// Markdown Reader — editing: paste and drop, the link box, the toolbar, the editor's keyboard and input events.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// ---------- Enter and → where the browser does not do what Markdown means ----------
// Enter in a code block: a new line; on an empty last line, leave the block
function edPreEnter(pre){
  const s = getSelection(), r = edSel(), code = pre.querySelector('code') || pre;
  const tail = document.createRange(); tail.setStart(r.endContainer, r.endOffset); tail.setEnd(code, code.childNodes.length);
  const head = document.createRange(); head.setStart(code, 0); head.setEnd(r.startContainer, r.startOffset);
  const before = head.toString(), after = tail.toString();
  if (r.collapsed && !after && before.endsWith('\n')){
    code.textContent = mdPreText(code).replace(/\n+$/, '');
    let p = pre.nextElementSibling; if (!p || p.tagName !== 'P' || p.textContent.trim()) p = edNewPara(pre);
    edCaret(p, false);
    return;
  }
  r.deleteContents();
  const nl = document.createTextNode('\n'); r.insertNode(nl);
  if (!after && !(code.lastChild && code.lastChild.nodeName === 'BR')) code.append(document.createElement('br'));
  const n = document.createRange(); n.setStartAfter(nl); n.collapse(true); s.removeAllRanges(); s.addRange(n);
}
// Enter on an empty list item: a nested item moves up a level, otherwise a paragraph takes its place
function edLiExit(li){
  const list = li.parentElement;
  if (list.parentElement.tagName === 'LI'){ edOutdent(li); return; }
  const items = [...list.children].filter(x => x.tagName === 'LI'), rest = [];
  for (let n = li.nextSibling; n; n = n.nextSibling) rest.push(n);
  const p = document.createElement('p'); p.append(document.createElement('br')); list.after(p);
  if (rest.some(n => n.nodeType === 1)){
    const more = document.createElement(list.tagName);
    if (list.tagName === 'OL') more.setAttribute('start', String((Number(list.getAttribute('start')) || 1) + items.indexOf(li)));
    more.append(...rest); p.after(more);
  }
  li.remove();
  if (!list.querySelector('li')) list.remove();
  edCaret(p, false);
}
// → at the very end of inline code steps out of it (a zero-width space holds the caret; never saved)
function edLeaveCode(){
  const r = edSel(), h = edHere(), code = h && h.closest('code');
  if (!r || !r.collapsed || !code || code.closest('pre') || !edS.ed.contains(code)) return false;
  const tail = document.createRange(); tail.setStart(r.endContainer, r.endOffset); tail.setEnd(code, code.childNodes.length);
  if (tail.toString()) return false;
  let t = code.nextSibling;
  if (!t || t.nodeType !== 3){ t = document.createTextNode('\u200b'); code.after(t); }
  const n = document.createRange(); n.setStart(t, t.nodeValue[0] === '\u200b' ? 1 : 0); n.collapse(true);
  getSelection().removeAllRanges(); getSelection().addRange(n);
  return true;
}
// Enter after inline code or a link: the browser carries it into the new line; Markdown users do not expect it
function edDropCarried(){
  const h = edHere(), blk = h && h.closest('p,li,h1,h2,h3,h4,h5,h6');
  if (!blk || !edS.ed.contains(blk) || blk.textContent.replace(/\u200b/g, '') || !blk.querySelector('code,a')) return;
  blk.replaceChildren(document.createElement('br')); edCaret(blk, false);
}
const edEmptyLi = li => !li.textContent.trim() && !li.querySelector('img,[data-md],ul,ol,pre,table');

// ---------- paste and drop: through Markdown, so only what Markdown can say comes in ----------
function edHtmlToMd(html){
  const doc = new DOMParser().parseFromString(html, 'text/html'), body = doc.body;
  sanitize(body);
  body.querySelectorAll('[data-ui]').forEach(x => x.remove());
  body.querySelectorAll('b,strong').forEach(x => { const w = x.style.fontWeight; if (w === 'normal' || (+w && +w < 600)) x.replaceWith(...x.childNodes); });
  body.querySelectorAll('span[style]').forEach(x => {
    const st = x.style, w = st.fontWeight, wrap = tag => { const e = doc.createElement(tag); e.append(...x.childNodes); x.append(e); };
    if (w === 'bold' || +w >= 600) wrap('strong');
    if (st.fontStyle === 'italic') wrap('em');
    if (/line-through/.test(st.textDecoration || st.textDecorationLine || '')) wrap('del');
  });
  return mdBlocks(body, {}).join('\n\n');
}
function edInsertText(text){
  const s = getSelection(), r = edSel(); if (!r) return;
  r.deleteContents(); const t = document.createTextNode(text); r.insertNode(t);
  const n = document.createRange(); n.setStartAfter(t); n.collapse(true); s.removeAllRanges(); s.addRange(n);
}
function edInsertData(html, txt){
  if (edH.timer) edHistPush();
  edS.range = edSel();
  const c = edCtx();
  txt = (txt || '').replace(/\r\n?/g, '\n');
  if (c.pre) edInsertText(txt);
  else if (c.code || c.cell) edInsertText(txt.replace(/\s*\n\s*/g, ' '));
  else if (html && html.trim()){
    const md = edHtmlToMd(html); if (!md.trim()) return;
    const box = edRender(md, dirOf(edS.path)), one = box.childNodes.length === 1 && box.firstChild.nodeName === 'P';
    edExec('insertHTML', one ? box.firstChild.innerHTML : box.innerHTML);
  }
  else if (txt) edExec('insertText', txt);
  else return;
  edChanged();
}

// ---------- link box ----------
function edOpenLink(){
  const c = edCtx(); if (c.pre || c.code) return;
  const r = edSel(); if (!r) return;
  edS.linkRange = r.cloneRange(); edS.linkA = c.a;
  const pop = $('edLink'), at = r.getBoundingClientRect(), btn = $('edbar').querySelector('[data-cmd="link"]').getBoundingClientRect();
  $('edUrl').value = c.a ? c.a.getAttribute('href') || '' : '';
  $('edUnlink').hidden = !c.a;
  pop.hidden = false;
  const top = at.bottom && at.top > btn.bottom ? at.bottom + 8 : btn.bottom + 8, left = at.bottom ? at.left : btn.left;
  pop.style.top = Math.min(top, innerHeight - pop.offsetHeight - 8) + 'px';
  pop.style.left = Math.max(8, Math.min(left, innerWidth - pop.offsetWidth - 8)) + 'px';
  $('edUrl').focus(); $('edUrl').select();
}
function edCloseLink(){
  $('edLink').hidden = true;
  if (!edS) return;
  if (edS.linkRange){ const s = getSelection(); s.removeAllRanges(); s.addRange(edS.linkRange); }
  edS.ed.focus({preventScroll: true});
}
function edApplyLink(){
  let url = $('edUrl').value.trim(); edCloseLink();
  if (!edS || !url) return;
  if (/^(javascript|vbscript|data):/i.test(url.replace(/[\s\u0000-\u001f]/g, ''))){ note(msg('edBadUrl')); return; }
  if (/^www\./i.test(url)) url = 'https://' + url;
  if (edH.timer) edHistPush();
  const a = edS.linkA, r = edSel();
  if (a && edS.ed.contains(a)) a.setAttribute('href', url);
  else if (r && r.collapsed){
    const n = document.createElement('a'); n.setAttribute('href', url); n.textContent = url; r.insertNode(n);
    const after = document.createRange(); after.setStartAfter(n); after.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(after);
  } else edExec('createLink', url);
  edChanged();
}
function edUnlink(){
  edCloseLink();
  const a = edS && edS.linkA; if (!a || !edS.ed.contains(a)) return;
  if (edH.timer) edHistPush();
  edKeep(() => a.replaceWith(...a.childNodes));
  edChanged();
}
$('edLinkOk').onclick = edApplyLink;
$('edUnlink').onclick = edUnlink;
$('edUrl').addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); edApplyLink(); }
  else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); edCloseLink(); }
});
document.addEventListener('mousedown', e => { if (!$('edLink').hidden && !e.target.closest('#edLink')) $('edLink').hidden = true; });

// ---------- toolbar ----------
const ED_CMDS = {
  bold: edBold, italic: () => edExec('italic'), strike: () => edExec('strikeThrough'), code: edToggleCode,
  ul: () => edToggleList('UL'), ol: () => edToggleList('OL'), task: edToggleTask, quote: edToggleQuote,
  pre: edToggleCodeBlock, hr: edInsertHr, table: edInsertTable,
  rowAdd: () => edTableOp('rowAdd'), colAdd: () => edTableOp('colAdd'), rowDel: () => edTableOp('rowDel'), colDel: () => edTableOp('colDel')
};
function edRun(cmd){
  if (!edS) return;
  if (cmd === 'undo') return edUndo();
  if (cmd === 'redo') return edRedo();
  const b = $('edbar').querySelector(`[data-cmd="${cmd}"]`); if (b && b.disabled) return;
  edFocus();
  if (cmd === 'link') return edOpenLink();
  if (edH.timer) edHistPush();
  ED_CMDS[cmd]();
  edChanged();
}
let edStateFrame = 0;
function edState(){
  if (!edS) return;
  const c = edCtx(), bar = $('edbar'), inCode = !!(c.pre || c.code), task = !!(c.li && mdTaskBox(c.li));
  // from the markup, not the browser's guess (a heading is drawn bold, it is not bold text in Markdown)
  const q = cmd => { const x = c.n.closest(cmd === 'bold' ? 'b,strong' : cmd === 'italic' ? 'i,em' : 'del,s,strike'); return !!x && edS.ed.contains(x); };
  const set = (cmd, on, off) => {
    const b = bar.querySelector(`[data-cmd="${cmd}"]`); if (!b) return;
    if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.disabled = !!off;
  };
  set('bold', !inCode && q('bold'), inCode); set('italic', !inCode && q('italic'), inCode); set('strike', !inCode && q('strikeThrough'), inCode);
  set('code', !!c.code && !c.pre, !!c.pre); set('link', !!c.a, inCode);
  const list = c.li && c.li.parentElement;
  set('ul', !!list && list.tagName === 'UL' && !task, !!c.cell); set('ol', !!list && list.tagName === 'OL', !!c.cell); set('task', task, !!c.cell);
  set('quote', !!c.quote, !!c.cell); set('pre', !!c.pre, !!c.cell); set('hr', false, !!c.cell); set('table', false, !!c.cell);
  set('rowDel', false, !c.cell || c.cell.parentElement.rowIndex === 0);
  set('undo', false, edH.pos <= 0 && !edH.timer); set('redo', false, edH.pos >= edH.list.length - 1);
  $('edTableOps').hidden = !c.cell;
  const blk = c.n.closest('h1,h2,h3,h4,h5,h6,p,li,pre,td,th'), sel = $('edBlock');
  sel.disabled = !!(c.cell || c.pre);
  sel.value = c.pre ? '' : blk && /^H[1-6]$/.test(blk.tagName) && edS.ed.contains(blk) ? blk.tagName.toLowerCase() : 'p';
}
const edStateSoon = () => { cancelAnimationFrame(edStateFrame); edStateFrame = requestAnimationFrame(edState); };
$('edbar').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); }); // keep the selection in the text
$('edbar').addEventListener('click', e => { const b = e.target.closest('button[data-cmd]'); if (b) edRun(b.dataset.cmd); });
$('edBlock').addEventListener('change', e => {
  if (!edS || !e.target.value) return;
  edFocus(); if (edH.timer) edHistPush();
  edSetBlock(e.target.value); edChanged();
});
document.addEventListener('selectionchange', () => {
  if (!edS) return;
  const r = edSel();
  if (r && edS.ed.contains(r.startContainer)){ edS.range = r.cloneRange(); edStateSoon(); }
});

// ---------- the editor's own events (wired on each Edit) ----------
function edKey(e){
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey){
    if (k === 'z' && !e.shiftKey){ e.preventDefault(); edUndo(); return; }
    if ((k === 'z' && e.shiftKey) || k === 'y'){ e.preventDefault(); edRedo(); return; }
    if (k === 'k'){ e.preventDefault(); e.stopPropagation(); edRun('link'); return; }
    if (k === 'e'){ e.preventDefault(); edRun('code'); return; }
    if (k === 'x' && e.shiftKey){ e.preventDefault(); edRun('strike'); return; }
    if (k === 'b' || k === 'i'){ e.preventDefault(); edRun(k === 'b' ? 'bold' : 'italic'); return; }
    if (k === 'u'){ e.preventDefault(); return; } // Markdown has no underline
  }
  if (mod && e.altKey && /^[0-6]$/.test(e.key)){
    e.preventDefault(); if (edCtx().cell || edCtx().pre) return;
    if (edH.timer) edHistPush(); edSetBlock(e.key === '0' ? 'p' : 'h' + e.key); edChanged(); return;
  }
  if (e.key === 'Tab' && !mod && !e.altKey){
    const c = edCtx();
    if (c.cell){ e.preventDefault(); if (edH.timer) edHistPush(); edCellMove(c.cell, e.shiftKey ? 'prev' : 'next'); edChanged(); }
    else if (c.li){ e.preventDefault(); if (edH.timer) edHistPush(); (e.shiftKey ? edOutdent : edIndent)(c.li); edChanged(); }
  }
  if (e.key === 'ArrowRight' && !mod && !e.shiftKey && !e.altKey && edLeaveCode()) e.preventDefault();
}
function edBefore(e){
  const t = e.inputType || '';
  if (t === 'historyUndo'){ e.preventDefault(); edUndo(); return; }
  if (t === 'historyRedo'){ e.preventDefault(); edRedo(); return; }
  if (t.startsWith('format') && !/^format(Bold|Italic|StrikeThrough)$/.test(t)){ e.preventDefault(); return; }
  if (t !== 'insertParagraph' && t !== 'insertLineBreak') return;
  edS.range = edSel();
  const c = edCtx();
  if (c.pre){ e.preventDefault(); if (edH.timer) edHistPush(); edPreEnter(c.pre); edChanged(); }
  else if (c.cell && t === 'insertParagraph'){ e.preventDefault(); if (edH.timer) edHistPush(); edCellMove(c.cell, 'down'); edChanged(); }
  else if (c.li && t === 'insertParagraph' && edEmptyLi(c.li)){ e.preventDefault(); if (edH.timer) edHistPush(); edLiExit(c.li); edChanged(); }
  else if (c.quote && !c.li && t === 'insertParagraph'){ // Enter on an empty last line of a quote leaves it
    const p = edHere().closest('p');
    if (p && p.parentElement === c.quote && !p.nextElementSibling && !p.textContent.trim() && !p.querySelector('img,[data-md]')){
      e.preventDefault(); if (edH.timer) edHistPush(); c.quote.after(p); edCaret(p, false); edChanged();
    }
  }
}
function edInput(e){
  if (!edS || e.isComposing) return;
  edS.touched = edS.unsaved = true;
  edS.range = edSel();
  if (e.inputType === 'insertText' && e.data === ' ' && edAutoFormat()){ edChanged(); return; }
  if (e.inputType === 'insertParagraph'){ // Enter in a task: the new item is a task too
    edDropCarried();
    const li = edHere() && edHere().closest('li'), prev = li && li.previousElementSibling;
    if (li && edS.ed.contains(li) && prev && prev.tagName === 'LI' && mdTaskBox(prev) && !mdTaskBox(li)){ edSetTask([li], true); edChanged(); return; }
  }
  edTail(); edHistLater(); edStateSoon(); edSync();
}
function edWire(ed){
  ed.addEventListener('keydown', edKey);
  ed.addEventListener('beforeinput', edBefore);
  ed.addEventListener('input', edInput);
  ed.addEventListener('paste', e => { e.preventDefault(); const cd = e.clipboardData; if (cd) edInsertData(cd.getData('text/html'), cd.getData('text/plain')); });
  ed.addEventListener('dragstart', () => { if (edS) edS.dragging = true; });
  ed.addEventListener('dragend', () => { if (edS) edS.dragging = false; });
  ed.addEventListener('drop', e => {
    if (!edS || edS.dragging || hasFiles(e)) return; // moving text inside the page: the browser does it; files: opened by the page
    e.preventDefault();
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (r && ed.contains(r.startContainer)){ const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    edInsertData(e.dataTransfer.getData('text/html'), e.dataTransfer.getData('text/plain'));
  });
  ed.addEventListener('change', e => {
    if (!e.target.matches('input[type=checkbox]')) return;
    if (edH.timer) edHistPush();
    e.target.toggleAttribute('checked', e.target.checked); edChanged();
  });
}
