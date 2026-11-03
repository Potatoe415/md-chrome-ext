"use strict";
// Markdown Reader — edited page → Markdown (GitHub-flavoured). Blocks the user did not touch keep their
// source text (mdAssemble); the others are written here with Markdown syntax only.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.
//
// Markers set by edit.js on the editable page:
//   data-b="i"  top-level block i of the source        data-lock  raw HTML block, never edited
//   data-md     written back as is (wikilinks, line breaks, images not loaded)
//   data-h      HTML written in the source: stays HTML  data-src   image path as written in the source

const MD_INLINE = new Set(['A', 'ABBR', 'B', 'BDI', 'BDO', 'BR', 'CITE', 'CODE', 'DATA', 'DEL', 'DFN', 'EM', 'FONT', 'I', 'IMG', 'INPUT', 'INS', 'KBD', 'MARK', 'Q', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR']);
const MD_VOID = /^(AREA|BR|COL|HR|IMG|INPUT|WBR)$/;
const MD_OWN_ATTRS = ['contenteditable', 'data-h', 'data-b', 'data-src', 'data-lock', 'data-md', 'data-m', 'spellcheck'];
const mdIsInline = n => n.nodeType === 3 || n.nodeType === 8 || (n.nodeType === 1 && MD_INLINE.has(n.tagName));
// A line break is kept as a marker until the lines are laid out: N soft (source newline), S two spaces, B backslash
const MD_BR = '\uE000';

// ---------- text ----------
function mdText(s){
  return s.replace(/\u200b/g, '').replace(/\u00a0/g, ' ').replace(/[\t\n\r ]+/g, ' ')
    .replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\')
    .replace(/[*`~]/g, '\\$&')
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_')
    .replace(/\[(?!!\w+\])(?=[^\]]*\])/g, '\\[')
    .replace(/<(?=[A-Za-z/!?])/g, '\\<')
    .replace(/&(?=#?\w+;)/g, '\\&');
}
// what a line may not start with when it is plain text (heading, quote, list, setext underline)
function mdGuardLine(l){
  if (/^(#{1,6}(\s|$)|>|[-+*](\s|$)|=+\s*$|-+\s*$)/.test(l)) return '\\' + l;
  const n = /^(\d{1,9})([.)])(\s|$)/.exec(l);
  return n ? n[1] + '\\' + l.slice(n[1].length) : l;
}
// inline Markdown with break markers → lines (trimmed, guarded, joined by their break)
function mdLines(s){
  const parts = s.split(new RegExp(MD_BR + '([NSB])'));
  const lines = [], kinds = [];
  for (let i = 0; i < parts.length; i += 2){ lines.push(parts[i].trim()); if (i + 1 < parts.length) kinds.push(parts[i + 1]); }
  while (lines.length > 1 && !lines[0]){ lines.shift(); kinds.shift(); }
  while (lines.length > 1 && !lines[lines.length - 1]){ lines.pop(); kinds.pop(); }
  let out = '';
  lines.forEach((l, i) => {
    out += mdGuardLine(l);
    if (i < kinds.length) out += kinds[i] === 'N' && l && lines[i + 1] ? '\n' : kinds[i] === 'S' && l ? '  \n' : '\\\n';
  });
  return out;
}

// ---------- inline ----------
function mdInline(node, ctx){ let s = ''; node.childNodes.forEach(c => { s += mdInl(c, ctx); }); return s; }
function mdInl(n, ctx){
  if (n.nodeType === 3) return mdText(n.nodeValue);
  if (n.nodeType === 8) return '<!--' + n.nodeValue + '-->';
  if (n.nodeType !== 1) return '';
  const t = n.tagName;
  if (t === 'BR'){
    if (n.hasAttribute('data-h')) return '<br>';
    if (ctx.table) return '<br>';
    if (ctx.heading) return ' ';
    const raw = n.getAttribute('data-md');
    return MD_BR + (raw === '\n' ? 'N' : raw && raw[0] !== '\\' ? 'S' : 'B');
  }
  if (n.hasAttribute('data-md')) return n.getAttribute('data-md');
  if (n.hasAttribute('data-h')) return mdHtmlInline(n, ctx);
  switch (t){
    case 'STRONG': case 'B': return mdWrap('**', n, ctx, 'strong');
    case 'EM': case 'I': return mdWrap('*', n, ctx, 'em');
    case 'DEL': case 'S': case 'STRIKE': return mdWrap('~~', n, ctx, 'del');
    case 'CODE': return mdCode(n.textContent);
    case 'A': return mdLink(n, ctx);
    case 'IMG': return mdImg(n);
    case 'INPUT': return '';
    default: return mdInline(n, ctx); // span, font, u…: Markdown has no syntax for them, the text stays
  }
}
// spaces and line breaks go outside the markers: "** a**" is not bold in Markdown
function mdWrap(mark, n, ctx, key){
  if (ctx[key]) return mdInline(n, ctx);
  const inner = mdInline(n, Object.assign({}, ctx, {[key]: true}));
  const m = new RegExp('^((?:\\s|' + MD_BR + '[NSB])*)([\\s\\S]*?)((?:\\s|' + MD_BR + '[NSB])*)$').exec(inner);
  return m[2] ? m[1] + mark + m[2] + mark + m[3] : m[1] + m[3];
}
function mdCode(text){
  text = text.replace(/\u200b/g, '').replace(/\u00a0/g, ' ').replace(/\n/g, ' ');
  if (!text) return '';
  const runs = new Set((text.match(/`+/g) || []).map(r => r.length));
  let n = 1; while (runs.has(n)) n++;
  const f = '`'.repeat(n), pad = /^`|`$/.test(text) || (/^ [\s\S]* $/.test(text) && /[^ ]/.test(text)) ? ' ' : '';
  return f + pad + text + pad + f;
}
function mdDest(href){
  href = href.replace(/[<>]/g, c => encodeURIComponent(c));
  let depth = 0, balanced = true;
  for (const c of href){ if (c === '(') depth++; else if (c === ')' && --depth < 0) balanced = false; }
  return !href || /\s/.test(href) || !balanced || depth ? '<' + href + '>' : href;
}
const mdTitle = t => t ? ' "' + t.replace(/["\\]/g, '\\$&') + '"' : '';
function mdLink(a, ctx){
  const href = a.getAttribute('href') || '';
  if (ctx.link || !href) return mdInline(a, ctx);
  const text = mdInline(a, Object.assign({}, ctx, {link: true})), shown = a.textContent, title = a.getAttribute('title');
  if (!title && /^(https?:|mailto:)/i.test(href) && !/[\s<>]/.test(href)){
    if (shown === href) return '<' + href + '>';
    if (href === 'mailto:' + shown) return '<' + shown + '>';
  }
  return text.trim() ? '[' + text + '](' + mdDest(href) + mdTitle(title) + ')' : '';
}
function mdImg(img){
  const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
  const alt = (img.getAttribute('alt') || '').replace(/[[\]\\]/g, '\\$&');
  return /^blob:/i.test(src) ? alt : '![' + alt + '](' + mdDest(src) + mdTitle(img.getAttribute('title')) + ')';
}
function mdAttrs(el){
  let s = '';
  for (const a of el.attributes){
    if (MD_OWN_ATTRS.includes(a.name)) continue;
    const v = a.name === 'src' && el.hasAttribute('data-src') ? el.getAttribute('data-src') : a.value;
    s += ' ' + a.name + (v === '' ? '' : '="' + esc(v) + '"');
  }
  return s;
}
function mdHtmlInline(el, ctx){
  const tag = el.tagName.toLowerCase();
  return '<' + tag + mdAttrs(el) + '>' + (MD_VOID.test(el.tagName) ? '' : mdInline(el, ctx) + '</' + tag + '>');
}
function mdHtmlOuter(el){
  const c = el.cloneNode(true);
  [c, ...c.querySelectorAll('*')].forEach(x => {
    if (x.hasAttribute('data-src')) x.setAttribute('src', x.getAttribute('data-src'));
    MD_OWN_ATTRS.forEach(a => x.removeAttribute(a));
  });
  return c.outerHTML;
}

// ---------- blocks ----------
function mdPara(nodes, ctx){ let s = ''; nodes.forEach(n => { s += mdInl(n, ctx); }); return mdLines(s); }
const MD_LIST_GAP = '<!-- -->'; // between two lists of the same kind, which Markdown would merge
function mdBlocks(container, ctx){
  const out = []; let run = [], last = '';
  const flush = () => { if (run.length){ const s = mdPara(run, ctx); if (s){ out.push(s); last = 'P'; } run = []; } };
  container.childNodes.forEach(n => {
    if (mdIsInline(n)){ run.push(n); return; }
    flush();
    const s = mdBlock(n, ctx); if (!s) return;
    if (last === n.tagName && /^[OU]L$/.test(last)) out.push(MD_LIST_GAP);
    out.push(s); last = n.tagName;
  });
  flush();
  return out;
}
function mdBlock(el, ctx){
  if (el.nodeType !== 1) return '';
  if (el.hasAttribute('data-md')) return el.getAttribute('data-md');
  if (el.hasAttribute('data-h')) return mdHtmlOuter(el);
  const t = el.tagName;
  if (/^H[1-6]$/.test(t)){
    const s = mdInline(el, Object.assign({}, ctx, {heading: true})).replace(/\s+/g, ' ').trim().replace(/(^|\s)(#+)$/, '$1\\$2');
    return s ? '#'.repeat(+t[1]) + ' ' + s : '';
  }
  switch (t){
    case 'P': return mdPara([...el.childNodes], ctx);
    case 'UL': case 'OL': return mdList(el, ctx);
    case 'LI': { const ul = document.createElement('ul'); ul.append(el.cloneNode(true)); return mdList(ul, ctx); }
    case 'BLOCKQUOTE': { const inner = mdBlocks(el, ctx).join('\n\n'); return inner ? inner.split('\n').map(l => l ? '> ' + l : '>').join('\n') : ''; }
    case 'PRE': return mdFence(el);
    case 'HR': return '---';
    case 'TABLE': return mdTable(el, ctx);
    default: return mdBlocks(el, ctx).join('\n\n'); // div, section…: their content
  }
}
// text of a code block as shown: <br> and block children are line ends
function mdPreText(node){
  let s = '';
  node.childNodes.forEach(c => {
    if (c.nodeType === 3) s += c.nodeValue;
    else if (c.nodeName === 'BR') s += '\n';
    else if (c.nodeType === 1){
      const block = !MD_INLINE.has(c.tagName);
      if (block && s && !s.endsWith('\n')) s += '\n';
      s += mdPreText(c);
      if (block && !s.endsWith('\n')) s += '\n';
    }
  });
  return s;
}
function mdFence(pre){
  const code = pre.querySelector('code');
  const info = (code && (/(?:^|\s)language-(\S+)/.exec(code.className) || [])[1]) || '';
  const text = mdPreText(pre).replace(/\u00a0/g, ' ').replace(/\n$/, '');
  let n = 3; (text.match(/`{3,}/g) || []).forEach(r => { n = Math.max(n, r.length + 1); });
  const f = '`'.repeat(n);
  return f + info + '\n' + (text ? text + '\n' : '') + f;
}
function mdTaskBox(li){
  const first = li.firstElementChild;
  const box = first && first.matches('input[type=checkbox]') ? first : first && first.tagName === 'P' && first.firstElementChild && first.firstElementChild.matches('input[type=checkbox]') ? first.firstElementChild : null;
  return box && !(box.previousSibling && box.previousSibling.nodeValue && box.previousSibling.nodeValue.trim()) ? box : null;
}
function mdList(list, ctx){
  const ordered = list.tagName === 'OL', st = Number(list.getAttribute('start'));
  const start = ordered && list.hasAttribute('start') && Number.isInteger(st) && st >= 0 ? st : 1;
  const items = []; let loose = false;
  list.childNodes.forEach(c => {
    if (c.nodeType === 3 && !c.nodeValue.trim()) return;
    if (c.nodeName === 'UL' || c.nodeName === 'OL'){ // a list straight inside a list (browser indent) belongs to the item before
      const sub = mdList(c, ctx); if (!sub) return;
      if (items.length) items[items.length - 1].blocks.push(sub); else items.push({blocks: [sub], task: null});
      return;
    }
    if (c.nodeName !== 'LI'){ const b = mdIsInline(c) ? mdPara([c], ctx) : mdBlock(c, ctx); if (b) items.push({blocks: [b], task: null}); return; }
    const box = mdTaskBox(c), blocks = mdBlocks(c, ctx);
    if ([...c.children].some(x => x.tagName === 'P') && blocks.length) loose = true;
    if (blocks.length || box) items.push({blocks, task: box ? box.hasAttribute('checked') : null});
  });
  return items.map((it, i) => {
    const mark = ordered ? (start + i) + '.' : '-', pad = ' '.repeat(mark.length + 1);
    let body = it.blocks.join(loose ? '\n\n' : '\n');
    if (it.task != null) body = (it.task ? '[x] ' : '[ ] ') + body;
    const lines = body.split('\n');
    return mark + (lines[0] ? ' ' + lines[0] : '') + lines.slice(1).map(l => '\n' + (l ? pad + l : '')).join('');
  }).join(loose ? '\n\n' : '\n');
}
function mdCell(c, ctx){
  return mdInline(c, Object.assign({}, ctx, {table: true})).replace(/\s+/g, ' ').trim()
    .replace(/(^|[^\\])((?:\\\\)*)\|/g, '$1$2\\|');
}
function mdTable(t, ctx){
  const rows = [...t.rows].filter(r => r.cells.length);
  if (!rows.length) return '';
  const ncol = Math.max(...rows.map(r => r.cells.length));
  const line = r => '| ' + Array.from({length: ncol}, (_, i) => r.cells[i] ? mdCell(r.cells[i], ctx) : '').join(' | ') + ' |';
  const align = Array.from({length: ncol}, (_, i) => {
    const c = rows[0].cells[i] || (rows[1] && rows[1].cells[i]);
    const a = c ? (c.getAttribute('align') || c.style.textAlign || '').toLowerCase() : '';
    return a === 'left' ? ':---' : a === 'center' ? ':---:' : a === 'right' ? '---:' : '---';
  });
  return [line(rows[0]), '| ' + align.join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n');
}

// ---------- the whole document ----------
// S: {fm, lead, blocks: [{raw, gap, defs, snap}], norm, endsNl} from edBuild (edit.js). Untouched blocks
// that follow each other keep the exact text between them; link definitions always survive.
function mdAssemble(ed, S){
  const pieces = []; let run = [];
  const pushRun = () => { if (run.length){ const md = mdPara(run, {}); if (md) pieces.push({md, i: -1, host: -1, tag: 'P'}); run = []; } };
  ed.childNodes.forEach(n => {
    if (mdIsInline(n)){ run.push(n); return; }
    pushRun();
    if (n.nodeType !== 1) return;
    const i = n.hasAttribute('data-b') ? +n.getAttribute('data-b') : -1, B = S.blocks[i];
    if (B && (n.hasAttribute('data-lock') || n.outerHTML === B.snap)) pieces.push({md: B.raw, i, host: i, tag: n.tagName});
    else { const md = mdBlock(n, {}); if (md) pieces.push({md, i: -1, host: B ? i : -1, tag: n.tagName}); }
  });
  pushRun();
  const done = new Set(); let out = S.fm + S.lead;
  pieces.forEach((p, k) => {
    const next = pieces[k + 1], B = S.blocks[p.host];
    if (p.i >= 0 && (next ? next.i === p.i + 1 : p.i === S.blocks.length - 1)){ out += p.md + B.gap; done.add(p.i); return; }
    out += p.md.replace(/\s+$/, '');
    if (B && !done.has(p.host)){ done.add(p.host); if (B.defs.length) out += '\n\n' + B.defs.map(d => d.trim()).join('\n'); }
    if (next) out += p.tag === next.tag && /^[OU]L$/.test(p.tag) ? '\n\n' + MD_LIST_GAP + '\n\n' : '\n\n';
  });
  const lost = S.blocks.filter((B, i) => B.defs.length && !done.has(i)).flatMap(B => B.defs.map(d => d.trim()));
  if (lost.length) out = out.replace(/\s+$/, '') + '\n\n' + lost.join('\n');
  if (S.endsNl && !out.endsWith('\n')) out += '\n';
  return out;
}
