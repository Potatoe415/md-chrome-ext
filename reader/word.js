"use strict";
// Markdown Reader — save as Word (.docx), built in the browser.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// =====================================================================
// ---------- Save as Word (.docx) — built in the browser, no library ----------
// The rendered article (what you see) is converted to WordprocessingML and zipped.
// =====================================================================
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function zipFiles(files, type){
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files){
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, name = enc.encode(f.name), crc = crc32(data);
    let comp = data, method = 0;
    if ('CompressionStream' in window && data.length > 200){
      try { comp = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); method = 8; } catch { comp = data; method = 0; }
    }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
    lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, comp);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
    ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, comp.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + comp.length;
  }
  const csize = central.reduce((s, a) => s + a.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {type});
}

const xe = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NS_ALL = `${NS_W} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
const EMU_MAX_W = 5760720, EMU_MAX_H = 8500000; // A4 text area (2.5 cm margins)
const D_BLOCKS = new Set(['p','div','section','article','header','footer','main','figure','aside','blockquote','pre','ul','ol','li','dl','dt','dd','table','h1','h2','h3','h4','h5','h6','hr','details','summary','figcaption','caption','address','center']);
const D_SKIP = '.sub,.mtoc,.kicker,.chapnav,.imgmiss,.fm,nav,script,style,button,template,noscript';

async function imgData(src){
  if (!src) return null;
  try {
    const im = new Image(); im.src = src; await im.decode();
    let w = im.naturalWidth || 600, h = im.naturalHeight || 800;
    const k = Math.min(1, 2200 / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const jpg = w * h > 250000, g = c.getContext('2d');
    if (jpg){ g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise((res, rej) => { try { c.toBlob(b => b ? res(b) : rej(new Error('no blob')), jpg ? 'image/jpeg' : 'image/png', 0.9); } catch (e){ rej(e); } });
    return {bytes: new Uint8Array(await blob.arrayBuffer()), ext: jpg ? 'jpeg' : 'png', w, h};
  } catch { return null; } // offline web image, or blocked by the browser: the alt text is kept instead
}

function newDocx(){
  const body = [], rels = [], media = [], nums = [], prepared = new Map();
  let rid = 10, pic = 0;
  const X = {};
  X.link = url => { const id = 'rId' + (++rid); rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xe(url)}" TargetMode="External"/>`); return id; };
  X.media = d => { const id = 'rId' + (++rid), name = `image${media.length + 1}.${d.ext}`; media.push({name, bytes: d.bytes}); rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`); return id; };
  X.drawing = (p, maxW = EMU_MAX_W, maxH = EMU_MAX_H) => {
    let cx = p.w * 9525, cy = p.h * 9525; const k = Math.min(1, maxW / cx, maxH / cy); cx = Math.round(cx * k); cy = Math.round(cy * k); const n = ++pic;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}" descr="${xe(p.alt || '')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${p.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  };
  X.orderedNum = (level, start) => { const id = nums.length + 2; nums.push(`<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`); return id; };

  const run = (t, f) => {
    const rpr = (f.code ? '<w:rStyle w:val="CodeChar"/>' : f.link ? '<w:rStyle w:val="Hyperlink"/>' : '') + (f.b ? '<w:b/>' : '') + (f.i ? '<w:i/>' : '') + (f.s ? '<w:strike/>' : '') + (f.u ? '<w:u w:val="single"/>' : '') + (f.sup ? '<w:vertAlign w:val="superscript"/>' : f.sub ? '<w:vertAlign w:val="subscript"/>' : '');
    const inner = String(t).split('\n').map(line => line.split('\t').map(x => x ? `<w:t xml:space="preserve">${xe(x)}</w:t>` : '').join('<w:tab/>')).join('<w:br/>');
    const r = `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}${inner}</w:r>`;
    return f.link ? `<w:hyperlink r:id="${f.link}">${r}</w:hyperlink>` : r;
  };
  function para(ctx){
    const P = {runs: [], sp: true};
    P.text = (t, f) => { t = t.replace(/\s+/g, ' '); if (P.sp) t = t.replace(/^ /, ''); if (!t) return; P.sp = t.endsWith(' '); P.runs.push(run(t, f)); };
    P.raw = x => { P.runs.push(x); P.sp = false; };
    P.xml = () => {
      if (!P.runs.length) return '';
      let num = '', ind = '';
      if (ctx.li){ if (!ctx.li.used){ ctx.li.used = true; num = `<w:numPr><w:ilvl w:val="${ctx.li.level}"/><w:numId w:val="${ctx.li.numId}"/></w:numPr>`; } else ind = `<w:ind w:left="${720 * (ctx.li.level + 1)}"/>`; }
      const style = ctx.style || (ctx.li ? 'ListParagraph' : '');
      return `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${num}${ind}${ctx.align ? `<w:jc w:val="${ctx.align}"/>` : ''}</w:pPr>${P.runs.join('')}</w:p>`;
    };
    return P;
  }
  function inline(el, ctx, f, P){
    const tag = el.localName;
    if (el.matches && el.matches(D_SKIP)) return;
    if (tag === 'br'){ P().raw('<w:r><w:br/></w:r>'); return; }
    if (tag === 'img' || tag === 'svg'){
      const p = prepared.get(el);
      if (p) P().raw(X.drawing(p)); else { const alt = tag === 'img' ? el.getAttribute('alt') : ''; if (alt) P().text(`[image: ${alt}]`, {i: true}); }
      return;
    }
    if (tag === 'input'){ if ((el.getAttribute('type') || '').toLowerCase() === 'checkbox') P().text(el.checked || el.hasAttribute('checked') ? '☒ ' : '☐ ', {}); return; }
    if (el.classList && el.classList.contains('cb')){ P().text(el.classList.contains('on') ? '☒' : '☐', {}); return; }
    const g = Object.assign({}, f);
    if (/^(strong|b)$/.test(tag)) g.b = true;
    if (/^(em|i|cite|dfn|var)$/.test(tag)) g.i = true;
    if (/^(u|ins)$/.test(tag)) g.u = true;
    if (/^(s|del|strike)$/.test(tag)) g.s = true;
    if (/^(code|kbd|samp|tt)$/.test(tag)) g.code = true;
    if (tag === 'sup') g.sup = true;
    if (tag === 'sub') g.sub = true;
    if (tag === 'a'){ const h = el.getAttribute('href') || ''; if (/^(https?:|mailto:)/i.test(h) && !f.link) g.link = X.link(h); }
    for (const c of el.childNodes){
      if (c.nodeType === 3) P().text(c.nodeValue, g);
      else if (c.nodeType === 1) inline(c, ctx, g, P);
    }
  }
  function blocks(node, ctx, out){
    let cur = null;
    const P = () => cur || (cur = para(ctx));
    const flush = () => { if (cur){ const x = cur.xml(); if (x) out.push(x); cur = null; } };
    for (const c of node.childNodes){
      if (c.nodeType === 3){ if (cur || c.nodeValue.trim()) P().text(c.nodeValue, ctx.fmt || {}); continue; }
      if (c.nodeType !== 1 || c.matches(D_SKIP)) continue;
      if (D_BLOCKS.has(c.localName)){ flush(); block(c, ctx, out); }
      else inline(c, ctx, ctx.fmt || {}, P);
    }
    flush();
  }
  function block(el, ctx, out){
    const tag = el.localName, sub = o => Object.assign({}, ctx, o);
    if (/^h[1-6]$/.test(tag)) return blocks(el, sub({style: 'Heading' + tag[1], li: null}), out);
    if (tag === 'blockquote') return blocks(el, sub({style: 'Quote'}), out);
    if (tag === 'figcaption' || tag === 'caption') return blocks(el, sub({style: 'Caption'}), out);
    if (tag === 'dt') return blocks(el, sub({fmt: Object.assign({}, ctx.fmt, {b: true})}), out);
    if (tag === 'pre'){ const t = el.textContent.replace(/\n$/, ''); if (t) out.push(`<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr>${run(t, {})}</w:p>`); return; }
    if (tag === 'hr') return out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D3CCB9"/></w:pBdr></w:pPr></w:p>');
    if (tag === 'table') return table(el, ctx, out);
    if (tag === 'ul' || tag === 'ol') return list(el, ctx, out);
    return blocks(el, ctx, out); // p, div, section, li outside a list…
  }
  function list(el, ctx, out){
    const level = Math.min(8, ctx.li ? ctx.li.level + 1 : (ctx.lvl != null ? ctx.lvl + 1 : 0));
    const numId = el.localName === 'ol' ? X.orderedNum(level, parseInt(el.getAttribute('start'), 10) || 1) : 1;
    for (const c of el.children){
      // task items (with a checkbox) get ☐/☒ instead of a bullet
      if (c.localName === 'li') blocks(c, Object.assign({}, ctx, {li: {numId, level, used: !!c.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]')}, lvl: level}), out);
      else if (c.localName === 'ul' || c.localName === 'ol') list(c, Object.assign({}, ctx, {li: null, lvl: level}), out);
    }
  }
  function table(t, ctx, out){
    const rows = [...t.rows]; if (!rows.length) return;
    let cols = 0; rows.forEach(r => { let n = 0; [...r.cells].forEach(c => n += c.colSpan || 1); cols = Math.max(cols, n); });
    const cw = Math.floor(9000 / cols);
    const trs = rows.map(r => {
      const head = (r.parentElement && r.parentElement.localName === 'thead') || [...r.cells].every(c => c.localName === 'th');
      let used = 0;
      const tcs = [...r.cells].map(c => {
        const span = c.colSpan || 1; used += span;
        const inner = []; blocks(c, {style: 'TableText', fmt: head || c.localName === 'th' ? {b: true} : {}, align: c.classList.contains('num') ? 'right' : null}, inner);
        if (!inner.length || /<\/w:tbl>$/.test(inner[inner.length - 1])) inner.push('<w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr></w:p>');
        return `<w:tc><w:tcPr><w:tcW w:w="${cw * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEADF"/>' : ''}</w:tcPr>${inner.join('')}</w:tc>`;
      });
      for (; used < cols; used++) tcs.push(`<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr></w:p></w:tc>`);
      return `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${tcs.join('')}</w:tr>`;
    });
    out.push(`<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${cw}"/>`.repeat(cols)}</w:tblGrid>${trs.join('')}</w:tbl>`);
    out.push('<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>');
  }

  X.addArticle = async art => {
    for (const el of art.querySelectorAll('img, svg')){
      if (el.closest(D_SKIP) || prepared.has(el)) continue;
      let src = null, alt = '';
      if (el.localName === 'img'){ src = el.currentSrc || el.getAttribute('src'); alt = el.getAttribute('alt') || ''; }
      else {
        const im = el.querySelector('image');
        if (im) src = im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        else src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(el));
      }
      const d = await imgData(src);
      if (d) prepared.set(el, {rId: X.media(d), w: d.w, h: d.h, alt});
    }
    blocks(art, {fmt: {}}, body);
  };
  X.finish = async (title, author) => {
    const lvls = (fmt) => Array.from({length: 9}, (_, i) => {
      const bullet = fmt === 'bullet', f = bullet ? 'bullet' : 'decimal';
      return `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${f}"/><w:lvlText w:val="${bullet ? ['•', '◦', '▪'][i % 3] : '%' + (i + 1) + '.'}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr>${bullet ? '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>' : ''}</w:lvl>`;
    }).join('');
    const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${NS_W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvls('bullet')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvls('decimal')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${nums.join('')}</w:numbering>`;
    const H = (n, sz, color, before) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS_W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="1B1A17"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="240" w:after="120"/><w:jc w:val="center"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="4F4C44"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
${H(1, 36, '1E5A48', 360)}${H(2, 30, '1E5A48', 320)}${H(3, 26, '1B1A17', 260)}${H(4, 23, '4F4C44', 220)}${H(5, 22, '4F4C44', 200)}${H(6, 22, '86826F', 200)}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="1E5A48"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F6F2E9"/><w:ind w:left="284" w:right="284"/></w:pPr><w:rPr><w:color w:val="4F4C44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="E0DACB"/><w:left w:val="single" w:sz="4" w:space="4" w:color="E0DACB"/><w:bottom w:val="single" w:sz="4" w:space="4" w:color="E0DACB"/><w:right w:val="single" w:sz="4" w:space="4" w:color="E0DACB"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F6F2E9"/><w:spacing w:after="200" w:line="240" w:lineRule="auto"/><w:ind w:left="113" w:right="113"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:color w:val="86826F"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="40" w:after="40" w:line="252" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="1E5A48"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:basedOn w:val="DefaultParagraphFont"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:color w:val="4F4C44"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:shd w:val="clear" w:color="auto" w:fill="EFEADF"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="Grid"><w:name w:val="Reader Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D3CCB9"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D3CCB9"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D3CCB9"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D3CCB9"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D3CCB9"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D3CCB9"/></w:tblBorders><w:tblCellMar><w:top w:w="57" w:type="dxa"/><w:left w:w="113" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/><w:right w:w="113" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS_ALL}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const files = [
      {name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`},
      {name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`},
      {name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(title)}</dc:title>${author ? `<dc:creator>${xe(author)}</dc:creator>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`},
      {name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Markdown Reader</Application></Properties>`},
      {name: 'word/document.xml', data: docXml},
      {name: 'word/styles.xml', data: styles},
      {name: 'word/numbering.xml', data: numbering},
      {name: 'word/settings.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${NS_W}><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`},
      {name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${rels.join('')}</Relationships>`},
      ...media.map(m => ({name: 'word/media/' + m.name, data: m.bytes}))
    ];
    return zipFiles(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  };
  return X;
}

const safeName = s => String(s).replace(/\s*:\s+/g, ' - ').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document';
function download(blob, name){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}
let exporting = false;
async function saveDocx(){
  if (exporting || !cur) return; exporting = true;
  try {
    const X = newDocx();
    note(msg('wordPreparing'));
    await X.addArticle($('doc'));
    const title = document.title.replace(/ · [^·]*$/, '');
    download(await X.finish(title, ''), safeName(cur.split('/').pop().replace(/\.[^.]+$/, '')) + '.docx');
    note(msg('wordSaved'));
  } catch (e){ console.error(e); note(msg('wordFailed', {s: e.message || e})); }
  finally { exporting = false; }
}
$('wordBtn').onclick = () => saveDocx();
document.addEventListener('click', e => { if (!e.target.closest('#moreMenu, #moreBtn')) $('moreMenu').hidden = true; });
