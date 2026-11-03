"use strict";
// Markdown Reader — editing a document on its formatted page: Edit / Done / Discard, history, saving the .md.
// Each top-level Markdown block is rendered on its own (marked lexer) and remembered with its source text,
// so blocks the user does not touch are saved exactly as they were (mdAssemble in mdout.js).
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// marked.lexer / marked.parser use only the options given: start from the defaults, which hold the wikilinks
const ED_OPTS = Object.assign({}, marked.defaults, {gfm: true, breaks: true});
// what marked writes for Markdown syntax; any other element on the page comes from HTML in the source
const ED_NATIVE = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'EM', 'STRONG', 'DEL', 'A', 'IMG', 'BR', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'INPUT']);
const edRenderer = new marked.Renderer();
edRenderer.br = t => `<br data-md="${esc(t.raw)}">`;
edRenderer.link = function(t){ return marked.Renderer.prototype.link.call(this, t).replace(/^<a /, '<a data-m="" '); };
edRenderer.image = function(t){ return marked.Renderer.prototype.image.call(this, t).replace(/^<img /, '<img data-m="" '); };
const edCan = p => !!p && docs.has(p) && !/\.txt$/i.test(p);
const edDirty = f => !!f && f.saved !== undefined && f.text !== f.saved; // changed since opened or saved
let edS = null; // the editing session: {path, ed, blocks, fm, lead, …, touched, unsaved, range}

// ---------- the editable page ----------
// runs in the inert parsed document: an image only loads once it is in this page, by then resolved
function edPrepare(root, dir){
  const doc = root.ownerDocument;
  root.querySelectorAll('*').forEach(el => {
    if (el.hasAttribute('data-md')){ if (el.tagName !== 'BR') el.contentEditable = 'false'; return; }
    if (el.closest('[data-md]')) return;
    const native = ED_NATIVE.has(el.tagName) && !(/^(A|IMG)$/.test(el.tagName) && !el.hasAttribute('data-m')) && !(el.tagName === 'INPUT' && el.type !== 'checkbox');
    el.removeAttribute('data-m');
    if (native) return;
    el.setAttribute('data-h', '');
    if (!MD_INLINE.has(el.tagName)) el.contentEditable = 'false';
  });
  root.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    img.setAttribute('data-src', src);
    if (!src || /^(https?:|data:|blob:)/i.test(src)) return;
    const p = resolveIn(imgs, src, dir);
    if (p){ img.src = imgs.get(p); return; }
    const s = doc.createElement('span'); s.className = 'imgmiss'; s.contentEditable = 'false';
    s.setAttribute('data-md', img.hasAttribute('data-md') ? img.getAttribute('data-md') : img.hasAttribute('data-h') ? mdHtmlOuter(img) : mdImg(img));
    s.textContent = '▢ ' + (img.getAttribute('alt') || src);
    img.replaceWith(s);
  });
  root.querySelectorAll('li > input[type=checkbox], li > p > input[type=checkbox]').forEach(i => i.removeAttribute('disabled'));
  root.querySelectorAll('pre').forEach(p => { p.spellcheck = false; });
}
// marked tokens → sanitized, prepared nodes of this page
function edNodes(tokens, dir){
  let html = '';
  try { html = marked.parser(tokens, Object.assign({}, ED_OPTS, {renderer: edRenderer})); } catch {}
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  sanitize(doc.body); // a Markdown file must not run code in this page
  edPrepare(doc.body, dir);
  return [...doc.body.childNodes].filter(n => n.nodeType !== 3 || n.nodeValue.trim()).map(n => document.importNode(n, true));
}
// Markdown → prepared nodes, inside a <div>
function edRender(md, dir){
  const box = document.createElement('div');
  box.append(...edNodes(marked.lexer(md, ED_OPTS), dir));
  return box;
}
function edBuild(path){
  const f = docs.get(path);
  let text = String(f.text || ''); const bom = text.startsWith('\uFEFF'); if (bom) text = text.slice(1);
  const norm = text.replace(/\r\n?/g, '\n');
  const S = {path, original: f.text, norm, bom, crlf: /\r\n/.test(text), fm: '', lead: '', blocks: [], endsNl: norm.endsWith('\n'), touched: false, unsaved: false, range: null};
  const m = norm.match(/^---\n([\s\S]*?)\n---[ \t]*(\n|$)/);
  if (m && /^[\w-]+\s*:/m.test(m[1])) S.fm = m[0];
  const ed = document.createElement('div'), dir = dirOf(path);
  marked.lexer(norm.slice(S.fm.length), ED_OPTS).forEach(t => {
    if (t.type === 'space' || t.type === 'def'){
      const B = S.blocks[S.blocks.length - 1];
      if (!B) S.lead += t.raw; else { B.gap += t.raw; if (t.type === 'def') B.defs.push(t.raw); }
      return;
    }
    const i = S.blocks.length; S.blocks.push({raw: t.raw, gap: '', defs: [], snap: ''});
    const nodes = edNodes([t], dir);
    let el;
    if (t.type !== 'html' && nodes.length === 1 && nodes[0].nodeType === 1) el = nodes[0];
    else { el = document.createElement('div'); el.className = 'ed-raw'; el.setAttribute('data-lock', ''); el.contentEditable = 'false'; el.append(...nodes); }
    el.setAttribute('data-b', i); ed.append(el);
  });
  [...ed.children].forEach(el => { S.blocks[+el.getAttribute('data-b')].snap = el.outerHTML; });
  return {S, ed};
}
function edText(S){
  let out = mdAssemble(S.ed, S);
  if (out === S.norm) return S.original;
  if (S.crlf) out = out.replace(/\n/g, '\r\n');
  return (S.bom ? '\uFEFF' : '') + out;
}
// the page always ends with a paragraph, so there is somewhere to type after a table, code or a quote
function edTail(){
  const ed = edS.ed, last = ed.lastElementChild;
  if (!last || last.tagName !== 'P'){ const p = document.createElement('p'); p.append(document.createElement('br')); ed.append(p); }
}

// ---------- history (own stack: the page is also changed outside the browser's editing commands) ----------
const edH = {list: [], pos: -1, timer: 0};
const edLen = n => n.nodeType === 3 ? n.nodeValue.length : n.childNodes.length;
function edPath(n){ const p = []; while (n && n !== edS.ed){ if (!n.parentNode) return null; p.unshift([...n.parentNode.childNodes].indexOf(n)); n = n.parentNode; } return n ? p : null; }
function edNode(p){ let n = edS.ed; for (const i of p){ n = n.childNodes[i]; if (!n) return null; } return n; }
function edSnap(){
  edS.ed.normalize();
  const s = getSelection(), r = s.rangeCount ? s.getRangeAt(0) : null;
  const a = r && edS.ed.contains(r.startContainer) && edPath(r.startContainer), b = r && edS.ed.contains(r.endContainer) && edPath(r.endContainer);
  return {html: edS.ed.innerHTML, sel: a && b ? [a, r.startOffset, b, r.endOffset] : null};
}
function edHistReset(){ clearTimeout(edH.timer); edH.timer = 0; edH.list = [edSnap()]; edH.pos = 0; }
function edHistPush(){
  clearTimeout(edH.timer); edH.timer = 0;
  if (!edS) return;
  const s = edSnap(), top = edH.list[edH.pos];
  if (top && top.html === s.html){ top.sel = s.sel; return; }
  edH.list.length = edH.pos + 1; edH.list.push(s);
  if (edH.list.length > 300) edH.list.shift();
  edH.pos = edH.list.length - 1;
}
function edHistLater(){ clearTimeout(edH.timer); edH.timer = setTimeout(() => { edHistPush(); edState(); }, 600); } // typing: one step per pause
function edRestore(s){
  edS.ed.innerHTML = s.html;
  if (s.sel){
    const a = edNode(s.sel[0]), b = edNode(s.sel[2]);
    if (a && b) try { const r = document.createRange(); r.setStart(a, Math.min(s.sel[1], edLen(a))); r.setEnd(b, Math.min(s.sel[3], edLen(b))); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch {}
  }
  edS.ed.focus({preventScroll: true});
  edS.touched = edS.unsaved = true; edState(); edSync();
}
function edUndo(){ if (!edS) return; if (edH.timer) edHistPush(); if (edH.pos > 0) edRestore(edH.list[--edH.pos]); }
function edRedo(){ if (!edS) return; if (edH.timer) edHistPush(); if (edH.pos < edH.list.length - 1) edRestore(edH.list[++edH.pos]); }
// after a change made by a command
function edChanged(){ if (!edS) return; edS.touched = edS.unsaved = true; edTail(); edHistPush(); edState(); edSync(); }

// ---------- session ----------
const edFrac = () => { const h = document.documentElement; return h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight); };
function edStart(){
  if (edS || !edCan(cur) || $('wrap').hidden) return;
  closeFind(); closeSearch();
  const frac = edFrac(), {S, ed} = edBuild(cur);
  const art = document.createElement('article'); art.id = 'doc'; art.className = 'editing';
  const fm = buildMd(cur).art.querySelector('.fm');
  if (fm) art.append(document.importNode(fm, true));
  ed.className = 'ed'; ed.id = 'ed'; ed.contentEditable = 'true'; ed.spellcheck = true;
  ed.setAttribute('role', 'textbox'); ed.setAttribute('aria-multiline', 'true'); ed.setAttribute('aria-label', msg('edArea')); ed.dataset.tAria = 'edArea';
  art.append(ed);
  const wrap = $('wrap'); wrap.className = 'wrap editing'; wrap.replaceChildren(art);
  document.body.classList.remove('has-toc'); closeToc(); if (spy){ spy.disconnect(); spy = null; }
  document.body.classList.add('editing');
  edS = S; S.ed = ed;
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch {}
  edWire(ed); edTail(); edHistReset(); edSync(); edState();
  Promise.resolve(resumeScroll(frac)).then(edCaretInView);
}
// caret at the start of the first block on screen, so typing happens where the reader was
function edCaretInView(){
  if (!edS) return;
  const top = $('edbar').getBoundingClientRect().bottom;
  const el = [...edS.ed.children].find(x => !x.hasAttribute('data-lock') && x.getBoundingClientRect().bottom > top + 4) || edS.ed.lastElementChild;
  if (el) edCaret(el, false);
  edS.ed.focus({preventScroll: true});
}
function edCaret(node, atEnd){
  if (!node) return;
  const r = document.createRange(); r.selectNodeContents(node); r.collapse(!atEnd);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
// edits → the document in memory (searched, exported, saved); true if the text changed
function edCommit(){
  const S = edS, f = S && docs.get(S.path);
  if (!f || !S.touched) return false;
  const text = edText(S);
  if (text === f.text) return false;
  if (f.saved === undefined) f.saved = f.text;
  f.text = text; f.mtime = Date.now();
  searchIndex.delete(S.path); indexing = null;
  return true;
}
function edLeave(keep){
  if (!edS) return;
  if (keep) edCommit();
  clearTimeout(edH.timer); edH.timer = 0; edH.list = []; edH.pos = -1;
  edS = null; $('edLink').hidden = true;
  document.body.classList.remove('editing');
  edSync();
}
function edDone(){
  if (!edS) return;
  const path = edS.path, frac = edFrac();
  edLeave(true); showMd(path); resumeScroll(frac);
  if (edDirty(docs.get(path))) note(msg('edKept'));
}
function edDiscard(){
  if (!edS) return;
  if (edS.unsaved && !confirm(msg('edDiscardQ'))) return;
  const path = edS.path, frac = edFrac();
  edLeave(false); showMd(path); resumeScroll(frac);
}
const edUnsaved = () => (edS && edS.unsaved) || [...docs.values()].some(edDirty);
// before other files replace the open ones
function edMayReplace(){
  if (edUnsaved() && !confirm(msg('edLoseQ'))) return false;
  edLeave(false);
  return true;
}

// ---------- saving the .md file (on this device only: a file the user picks, or a download) ----------
async function edSave(){
  if (!edCan(cur) || $('wrap').hidden) return;
  if (edS) edCommit();
  const f = docs.get(cur), name = cur.split('/').pop(), text = f.text, was = edS ? edS.unsaved : false;
  const ext = (/\.[^./]+$/.exec(name) || ['.md'])[0].toLowerCase();
  if (edS) edS.unsaved = false;
  try {
    if (typeof window.showSaveFilePicker === 'function'){
      if (!f.handle) f.handle = await window.showSaveFilePicker({suggestedName: name, types: [{description: 'Markdown', accept: {'text/markdown': [...new Set([ext, '.md'])]}}]});
      const w = await f.handle.createWritable(); await w.write(new Blob([text], {type: 'text/markdown'})); await w.close();
      note(msg('mdSaved', {s: f.handle.name}));
    } else {
      download(new Blob([text], {type: 'text/markdown;charset=utf-8'}), name);
      note(msg('mdDownloaded', {s: name}));
    }
    f.saved = text;
  } catch (e){
    if (edS && was) edS.unsaved = true;
    if (!(e && e.name === 'AbortError')){ f.handle = null; note(msg('mdSaveFailed', {s: (e && e.message) || e})); }
  }
  edSync();
}

// ---------- header buttons ----------
function edSync(){
  const f = cur ? docs.get(cur) : null, on = !!f && !$('wrap').hidden, can = on && edCan(cur);
  const unsaved = (edS && edS.unsaved) || edDirty(f);
  $('editBtn').hidden = !can || !!edS;
  $('saveBtn').hidden = !can || !(edS || unsaved);
  $('saveBtn').classList.toggle('dirty', !!unsaved);
  $('edbar').hidden = !edS;
  if (edS){ $('wordBtn').hidden = true; $('printBtn').hidden = true; }
}
$('editBtn').onclick = edStart;
$('saveBtn').onclick = edSave;
$('edDone').onclick = edDone;
$('edDiscard').onclick = edDiscard;
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's' && edCan(cur) && !$('wrap').hidden){ e.preventDefault(); edSave(); }
});
addEventListener('beforeunload', e => { if (edUnsaved()){ e.preventDefault(); e.returnValue = ''; } });
