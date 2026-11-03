"use strict";
// Markdown Reader — reading preferences: theme, text size, width, font.
// Classic script: shares one global scope with the other js/reader/*.js files, loaded in order by
// md-reader.html (see js/reader/AGENTS.md). Top-level code may only use what earlier files declare.

// ---------- reading preferences: theme, text size, width, font (remembered in localStorage) ----------
// The <head> script applies them before first paint; this keeps the controls in sync and saves changes.
const THEMES = ['auto', 'light', 'dark'], LABEL = {auto: 'auto', light: 'light', dark: 'dark'}; // dictionary keys
const SIZES = [0.85, 0.92, 1, 1.08, 1.16, 1.25, 1.35, 1.5];
const PREFS_KEY = 'mdr-prefs';
const prefs = Object.assign({theme: 'auto', size: 1, width: 'normal', font: 'sans'}, (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } })());
if (!THEMES.includes(prefs.theme)) prefs.theme = 'auto';
if (!SIZES.includes(+prefs.size)) prefs.size = 1;
if (!['narrow', 'normal', 'wide'].includes(prefs.width)) prefs.width = 'normal';
if (prefs.font !== 'serif') prefs.font = 'sans';
let theme = prefs.theme;
function applyPrefs(){
  const r = document.documentElement;
  if (prefs.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', prefs.theme);
  r.style.setProperty('--rs', prefs.size);
  if (prefs.width === 'normal') delete r.dataset.rw; else r.dataset.rw = prefs.width;
  if (prefs.font === 'serif') r.dataset.rf = 'serif'; else delete r.dataset.rf;
  theme = prefs.theme;
  $('themeBtn').textContent = msg(LABEL[theme]);
  $('tyVal').textContent = Math.round(prefs.size * 100) + '%';
  $('tySm').disabled = prefs.size <= SIZES[0]; $('tyLg').disabled = prefs.size >= SIZES[SIZES.length - 1];
  [['tyW', prefs.width], ['tyF', prefs.font], ['tyT', prefs.theme]].forEach(([id, v]) => $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)));
}
function setPref(k, v){
  prefs[k] = v; applyPrefs();
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}
const cycleTheme = () => setPref('theme', THEMES[(THEMES.indexOf(theme) + 1) % 3]);
$('themeBtn').onclick = cycleTheme;
const stepSize = d => { const i = SIZES.indexOf(+prefs.size) + d; if (i >= 0 && i < SIZES.length) setPref('size', SIZES[i]); };
$('tySm').onclick = () => stepSize(-1); $('tyLg').onclick = () => stepSize(1);
[['tyW', 'width'], ['tyF', 'font'], ['tyT', 'theme']].forEach(([id, k]) => { $(id).onclick = e => { const b = e.target.closest('button[data-v]'); if (b) setPref(k, b.dataset.v); }; });
function openTypo(anchor){
  const m = $('typoMenu'), r = anchor.getBoundingClientRect();
  m.style.top = (r.bottom + 8) + 'px'; m.style.right = Math.max(8, innerWidth - r.right) + 'px';
  m.hidden = false;
}
$('typoBtn').onclick = e => { e.stopPropagation(); if ($('typoMenu').hidden) openTypo($('typoBtn')); else $('typoMenu').hidden = true; };
document.addEventListener('click', e => { if (!e.target.closest('#typoMenu, #typoBtn, #mmTypo')) $('typoMenu').hidden = true; });
applyPrefs();
