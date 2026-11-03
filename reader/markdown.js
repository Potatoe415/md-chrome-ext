"use strict";
// Markdown Reader — Markdown rendering: wikilinks, link resolution, sanitizing, page painting.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// ---------- Obsidian-style [[wikilinks]] and ![[embeds]] ----------
marked.use({extensions: [{
  name: 'wikilink', level: 'inline',
  start(s){ const i = s.indexOf('[['); return i < 0 ? undefined : (i > 0 && s[i - 1] === '!' ? i - 1 : i); },
  tokenizer(src){ const m = /^(!?)\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(src); if (m) return {type: 'wikilink', raw: m[0], embed: !!m[1], target: m[2].trim(), alias: (m[3] || '').trim()}; },
  renderer(t){ // data-md: the source text, which the editor writes back unchanged
    if (t.embed && IMG.test(t.target)) return `<img src="${esc(t.target)}" alt="${esc(t.alias || t.target)}" data-md="${esc(t.raw)}">`;
    const [file, anchor] = t.target.split('#');
    const href = (file ? (/\.[a-z0-9]{1,6}$/i.test(file) ? file : file + '.md') : '') + (anchor ? '#' + anchor : '');
    return `<a href="${esc(href)}" data-wiki="1" data-md="${esc(t.raw)}">${esc(t.alias || (file || anchor))}</a>`;
  }
}]});

// ---------- resolve a link / path against the files you dropped ----------
function resolveIn(map, raw, dir){
  let t = String(raw || '').trim(); try { t = decodeURIComponent(t); } catch {}
  t = t.replace(/[?#].*$/, '').replace(/\s*§.*$/, '').replace(/[.,;:]+$/, '');
  if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t)) return null;
  const tries = [t]; if (!/\.[a-z0-9]{1,6}$/i.test(t)) tries.push(t + '.md');
  for (const x of tries){
    if (dir){ const j = norm(dir + '/' + x); if (map.has(j)) return j; }
    const c = norm(x); if (map.has(c)) return c;
    const low = '/' + c.toLowerCase();
    const hits = [...map.keys()].filter(p => ('/' + p.toLowerCase()).endsWith(low));
    if (hits.length) return hits.sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0];
  }
  return null;
}

// ---------- shared clean-up / enhancements ----------
function sanitize(root){
  root.querySelectorAll('script,style,link,meta,base,object,embed,title,head').forEach(x => x.remove());
  root.querySelectorAll('*').forEach(el => [...el.attributes].forEach(a => {
    if (/^on/i.test(a.name) || (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*(javascript|vbscript):/i.test(a.value))) el.removeAttribute(a.name);
  }));
}
function headingIds(root){
  const used = new Set([...root.querySelectorAll('[id]')].map(e => e.id));
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(hd => { if (hd.id) return; const s = slug(hd.textContent) || 'section'; let k = s, n = 2; while (used.has(k)) k = s + '-' + n++; used.add(k); hd.id = k; });
}
function enhance(root){
  const doc = root.ownerDocument;
  root.querySelectorAll('table').forEach(t => {
    if (t.parentElement && t.parentElement.classList.contains('tw')) return;
    const w = doc.createElement('div'); w.className = 'tw'; t.replaceWith(w); w.append(t);
    const rows = [...t.querySelectorAll('tbody tr')], n = t.querySelectorAll('thead th').length;
    for (let c = 0; c < n; c++){
      const cells = rows.map(r => r.children[c]).filter(Boolean), vals = cells.map(x => x.textContent.trim()).filter(Boolean);
      if (vals.length && vals.every(v => /^[~≈<>≥≤+\-–]?\s*[\d.,\s%€$£kKgm/×–-]+$/.test(v) && v.length <= 14)) [t.querySelectorAll('thead th')[c], ...cells].forEach(x => x && x.classList.add('num'));
    }
    t.querySelectorAll('td').forEach(td => { const v = td.textContent.trim(); if (v.length > 70) td.classList.add('long');
      if (/^\[( |x|X)\]$/.test(v)){ td.innerHTML = v === '[ ]' ? '<span class="cb"></span>' : '<span class="cb on"></span>'; td.classList.add('num'); } });
  });
  root.querySelectorAll('li input[type=checkbox]').forEach(i => { const li = i.closest('li'); li.classList.add('task'); if (i.checked) li.classList.add('done'); if (li.parentElement) li.parentElement.classList.add('tasks'); });
}
function paint({art, tocHtml, side, crumbs, meta, title, anchor}){
  const wrap = $('wrap');
  wrap.className = 'wrap' + (tocHtml && side !== false ? ' has-toc' : '');
  document.body.classList.toggle('has-toc', !!tocHtml); closeToc();
  wrap.replaceChildren();
  if (tocHtml) wrap.insertAdjacentHTML('beforeend', `<nav class="toc" id="toc">${tocHtml}</nav>`);
  wrap.append(art);
  wrap.hidden = false; $('home').hidden = true; $('printBtn').hidden = false; $('wordBtn').hidden = false;
  $('crumbs').innerHTML = crumbs.map((s, i, a) => i === a.length - 1 ? `<b>${esc(s)}</b>` : esc(s)).join('<span class="sl">/</span>');
  $('crumbs').title = crumbs.join(' / ');
  $('meta').textContent = meta;
  if (cur) $('pick').value = cur;
  document.title = title;
  const target = anchor ? (document.getElementById(anchor) || document.getElementById(slug(anchor))) : null;
  if (target) setTimeout(() => target.scrollIntoView({behavior: 'instant'}), 30);
  else scrollTo({top: 0, behavior: 'instant'});
  onScroll(); edSync();
}

// ---------- Markdown ----------
function buildMd(path){
  const f = docs.get(path);
  const name = path.split('/').pop(), dir = dirOf(path);
  const isMd = MDEXT.test(path) || !/\.txt$/i.test(path);
  let body = String(f.text || '').replace(/^﻿/, ''), fm = null;
  if (isMd){
    const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
    if (m && /^[\w-]+\s*:/m.test(m[1])){
      fm = {}; let last = null;
      m[1].split(/\r?\n/).forEach(l => {
        const kv = l.match(/^([\w-]+)\s*:\s*(.*)$/);
        if (kv){ last = kv[1]; fm[last] = kv[2].trim().replace(/^[>|][+-]?$/, ''); }
        else if (last && /^\s+\S/.test(l)) fm[last] = (fm[last] + ', ' + l.trim().replace(/^-\s+/, '')).replace(/^,\s*/, '').trim();
      });
      Object.keys(fm).forEach(k => { fm[k] = fm[k].replace(/^\[|\]$/g, '').replace(/^["']|["']$/g, ''); if (!fm[k]) delete fm[k]; });
      body = body.slice(m[0].length);
    }
  }
  let inner;
  try { inner = isMd ? marked.parse(body, {gfm: true, breaks: true}) : `<pre class="plain">${esc(body)}</pre>`; }
  catch (e){ inner = `<pre class="plain">${esc(body)}</pre>`; }
  const doc = new DOMParser().parseFromString(`<article id="doc">${inner}</article>`, 'text/html');
  const art = doc.getElementById('doc');
  sanitize(art); // a Markdown file must not run code in this page
  const baseName = name.replace(/\.[^.]+$/, '');
  const title = (fm && fm.title) || (art.querySelector('h1') ? art.querySelector('h1').textContent.trim() : baseName);
  if (!art.firstElementChild || art.firstElementChild.tagName !== 'H1'){ const h1 = ui(doc.createElement('h1')); h1.textContent = (fm && fm.title) || baseName; art.prepend(h1); }
  if (fm){
    const box = ui(doc.createElement('div')); box.className = 'fm';
    Object.entries(fm).filter(([k]) => k !== 'title').forEach(([k, v]) => {
      const row = doc.createElement('div'); const kk = doc.createElement('span'); kk.className = 'k'; kk.textContent = k; row.append(kk);
      const list = /^(tags|aliases|keywords|categories)$/i.test(k);
      (list ? v.split(',').map(x => x.trim().replace(/^#/, '')).filter(Boolean) : [v]).forEach(x => { const p = doc.createElement('span'); p.className = list ? 'pill' : 'v'; p.textContent = x; row.append(p); });
      box.append(row);
    });
    if (box.children.length) art.firstElementChild.after(box);
  }
  headingIds(art);
  art.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src');
    if (/^(https?:|data:|blob:)/i.test(src)) return;
    const p = resolveIn(imgs, src, dir);
    if (p){ img.src = imgs.get(p); return; }
    const s = ui(doc.createElement('span')); s.className = 'imgmiss'; s.textContent = '▢ ' + (img.getAttribute('alt') || src) + msg('imgMissing'); img.replaceWith(s);
  });
  art.querySelectorAll('code').forEach(c => {
    if (c.closest('pre, a')) return;
    const p = resolveIn(docs, c.textContent, dir); if (!p || !/\.[a-z0-9]{1,6}$/i.test(c.textContent.trim().replace(/\s*§.*$/, ''))) return;
    const a = doc.createElement('a'); a.className = 'doc'; a.href = '#'; a.dataset.open = p; a.title = msg('openX', {s: p});
    c.replaceWith(a); a.append(c);
  });
  art.querySelectorAll('a[href]').forEach(a => {
    if (a.classList.contains('doc')) return;
    const href = a.getAttribute('href') || '';
    if (/^(https?:|mailto:|tel:)/i.test(href)){ a.target = '_blank'; a.rel = 'noopener noreferrer'; return; }
    if (href.startsWith('#')){
      let id = href.slice(1); try { id = decodeURIComponent(id); } catch {}
      if (id && !art.querySelector('[id="' + CSS.escape(id) + '"]')) a.setAttribute('href', '#' + slug(id));
      return;
    }
    const hashPart = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
    const p = resolveIn(docs, href, dir);
    if (p){ a.dataset.open = p; if (hashPart) a.dataset.anchor = hashPart; a.href = '#'; a.title = msg('openX', {s: p}); return; }
    if (/\.[a-z0-9]{1,6}($|[?#])/i.test(href) || a.dataset.wiki){ a.classList.add('missing'); a.dataset.missing = href; a.title = msg('linkNotLoaded', {s: href}); a.href = '#'; }
  });
  enhance(art);
  return {art, doc, title, name, f};
}
function showMd(path, anchor){
  const {art, doc, title, name, f} = buildMd(path); cur = path;
  const hs = [...art.querySelectorAll('h2,h3')];
  const toc = hs.length ? hs.map(x => `<a href="#${esc(x.id)}" class="${x.tagName === 'H3' ? 'l3' : 'l2'}">${esc(x.textContent.trim())}</a>`).join('') : '';
  const mins = readMins(art), when = f.mtime ? fmtDate(f.mtime) : '';
  const sub = ui(doc.createElement('p')); sub.className = 'sub'; sub.textContent = `${path}${when ? ' · ' + msg('edited', {s: when}) : ''} · ${msg('minRead', {n: mins})}`;
  art.querySelector('h1').after(sub);
  paint({art, anchor, side: hs.length >= 3, tocHtml: toc ? `<div class="h">${msg('onThisPage')}</div>${toc}` : '', crumbs: path.split('/'), meta: `${when ? msg('editedCap', {s: when}) + ' · ' : ''}${msg('minRead', {n: mins})}`, title: `${title} · ${name}`});
  const links = {}; document.querySelectorAll('#toc a[href^="#"]').forEach(a => { links[decodeURIComponent(a.getAttribute('href').slice(1))] = a; });
  setupSpy(links, null);
}
