"use strict";
// Markdown Reader — shared helpers and the reader state (open files, current file / position).
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TEXT = /\.(md|markdown|mdown|mkd|mdx|txt)$/i, MDEXT = /\.(md|markdown|mdown|mkd|mdx)$/i;
const IMG = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i, EPUB = /\.epub$/i;
const SKIP_DIR = /^(\.git|\.obsidian|\.trash|node_modules|\.venv|__pycache__)$/;
const docs = new Map(), imgs = new Map();
let cur = null, curState = null, spy = null;

// link: {href, label} — the toast then stays longer and can be clicked
function note(m, link){
  const n = $('note'); n.textContent = m;
  if (link){ const a = document.createElement('a'); a.href = link.href; a.textContent = link.label; n.append(' ', a); }
  n.classList.toggle('lk', !!link); n.classList.add('on');
  clearTimeout(note.t); note.t = setTimeout(() => n.classList.remove('on', 'lk'), link ? 9000 : 3400);
}
function slug(s){ return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
function norm(p){ const out = []; String(p).replace(/\\/g, '/').split('/').forEach(s => { if (!s || s === '.') return; if (s === '..') out.pop(); else out.push(s); }); return out.join('/'); }
const depth = p => p.split('/').length;
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const fmtDate = t => new Date(t).toLocaleString(lang, {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'});
const readMins = el => Math.max(1, Math.round(((el.textContent.match(/\S+/g) || []).length) / 230));
const ui = el => { el.setAttribute('data-ui', ''); return el; }; // page furniture: not searched, not highlighted
