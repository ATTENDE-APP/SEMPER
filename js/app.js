// 獻禮 OBLATIO — 彌撒・聖事禮典・祝福禮典 (companion to 常頌 SEMPER, which keeps the Liturgy of the Hours)
import { loadCalendar, dayInfo, setCalendar, calendarList, currentCalendar } from './liturgy.js';
import { fromIso, iso, WD } from './calendar.js';
import { loadBlessings, renderIndex as blessIndex, renderChapter as blessChapter, renderRite as blessRite, chapterTarget as blessTarget, bindBlessings, setStore as blessStore } from './blessings.js';
import { initTTS, stop as stopTTS } from './tts.js';
import { loadRites, renderRites, bindRites, setStore as ritesStore } from './rites.js';
import { loadMissal, missalLoaded, massesFor, defaults as massDefaults, renderMass as massHtml, optionsPanel } from './missal.js';

const APP_VERSION = 'v31';   // keep in step with VERSION in sw.js
const $ = (s) => document.querySelector(s);
const store = { get(k, d) { try { const v = localStorage.getItem('oblatio.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('oblatio.' + k, JSON.stringify(v)); } catch {} } };

const hkToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
const BOOKS = [{ id: 'm', name: '彌撒' }, { id: 'r', name: '聖事禮典' }, { id: 'b', name: '祝福禮典' }];
const S = { date: hkToday(), book: store.get('book', 'm'), choice: {} };
blessStore(store); ritesStore(store);

function parseHash() {
  const m = location.hash.match(/^#\/(\d{4}-\d\d-\d\d)?\/?([mbr])?(?:\?c=([\w@-]*))?/);
  if (m) { if (m[1]) S.date = m[1]; if (m[2]) S.book = m[2]; if (m[3] !== undefined) S.choice[S.date] = m[3]; }
}
function setHash() {
  const c = S.choice[S.date];
  history.replaceState(null, '', `#/${S.date}/${S.book}${c ? '?c=' + c : ''}`);
}

// ---------- 繁體 / 簡體 ----------
let T2S = null;
async function loadT2S() {
  if (T2S || store.get('script', 't') !== 's') return;
  try {
    const d = await (await fetch('data/t2s.json')).json();
    const ph = Object.keys(d.p).sort((a, b) => b.length - a.length);
    T2S = { re: new RegExp((ph.length ? ph.join('|') + '|' : '') + '[\\u3400-\\u9fff]', 'g'), f: (x) => d.p[x] || d.c[x] || x };
  } catch { T2S = null; }
}
function zh(root = document.body) {
  if (!root || !T2S || store.get('script', 't') !== 's') return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('[data-script]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n = w.nextNode(); n; n = w.nextNode()) { const v = n.nodeValue.replace(T2S.re, T2S.f); if (v !== n.nodeValue) n.nodeValue = v; }
  if (root === document.body) document.title = document.title.replace(T2S.re, T2S.f);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderCelebs(info) {
  const d = fromIso(S.date);
  const tp = info.L.temporal;
  const el = $('#celebs');
  const parts = [`<div class="day">${info.L.primary.source === 'santoral' && tp.title ? tp.title : WD[d.getUTCDay()]}・主日${info.L.cycles.sunday}年・平日${info.L.cycles.weekday}年</div>`];
  const cur = S.choice[S.date] || '';
  const labOf = (c) => (c.kind === 'commemoration' ? '紀念' : c.kind === 'optional' ? '自由紀念' : ({ solemnity: '節日', feast: '慶日', memorial: '紀念' }[c.rank] || '平日'));
  const sel = info.choices.find((c) => c.id === cur) || info.choices[0];
  const selLab = labOf(sel) !== '平日' || info.choices.length > 1 ? labOf(sel) : '';
  parts.push(`<h1 class="cel">${esc(sel.title)}${selLab ? `<span class="rank">${selLab}</span>` : ''}</h1>`);
  if (info.choices.length > 1) {
    parts.push(`<div class="opts" role="radiogroup" aria-label="今日可選"><div class="opts-lab">今日可選：</div>${info.choices.map((c) =>
      `<button class="opt" role="radio" data-c="${c.id}" aria-checked="${c.id === cur}"><span class="dot" aria-hidden="true">${c.id === cur ? '◉' : '○'}</span><span>${esc(c.title)} <small>${labOf(c)}</small></span></button>`).join('')}</div>`);
  }
  el.innerHTML = parts.join('');
  el.querySelectorAll('button.opt').forEach((b) => b.onclick = () => { S.choice[S.date] = b.dataset.c; store.set('mass.' + S.date, null); render(); });
}

function render() {
  stopTTS();   // new text on screen: stop reading
  const info = dayInfo(S.date);
  if (!info.choices.some((c) => c.id === (S.choice[S.date] || ''))) S.choice[S.date] = '';
  const [y, m, d] = S.date.split('-').map(Number);
  $('#dateLabel').textContent = `${y}年${m}月${d}日`;
  $('#datePick').value = S.date;
  $('#books').innerHTML = BOOKS.map((b) => `<button role="tab" data-b="${b.id}" aria-selected="${b.id === S.book}">${b.name}</button>`).join('');
  $('#books').querySelectorAll('button').forEach((b) => b.onclick = () => { S.book = b.dataset.b; store.set('book', S.book); render(); window.scrollTo(0, 0); });
  const dated = S.book === 'm';
  $('#celebs').style.display = dated ? '' : 'none';
  $('.bar').classList.toggle('nodate', !dated);
  if (dated) renderCelebs(info);
  setHash();
  document.documentElement.style.setProperty('--toph', $('.top').offsetHeight + 'px');
  return renderBook(S.book, info);
}

async function renderBook(book, info) {
  const el = $('#office');
  if (book !== 'b' && book !== 'r') document.body.classList.remove('presider');
  if (book === 'b') {
    if (!S.bLoaded) { el.innerHTML = '<p class="loading">載入祝福禮典…</p>'; try { await loadBlessings(); S.bLoaded = true; } catch (e) { el.innerHTML = '<p class="empty">未能載入祝福禮典。</p>'; return; } if (S.book !== 'b') return; }
    // v8: index → chapter outline → one rite (bchap / brite in storage)
    let rite = store.get('brite', ''), chap = store.get('bchap', '');
    if (chap && !rite && blessTarget(chap)?.rite) rite = blessTarget(chap).rite;
    el.innerHTML = rite ? blessRite(rite) : chap ? blessChapter(chap) : blessIndex(S.bq || '');
    const open = (v) => {
      store.set('brite', v && v.rite ? v.rite : ''); store.set('bchap', v && v.chap ? v.chap : '');
      if (v && v.rite) store.set('brecent', v.rite);
      render(); window.scrollTo(0, 0);
    };
    bindBlessings(el, { open, rerender: () => render() });
    const q = el.querySelector('[data-b="search"]');
    if (q) q.oninput = () => { S.bq = q.value; const pos = q.selectionStart; render(); const q2 = $('#office [data-b="search"]'); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } };
    finish(el); return;
  }
  if (book === 'r') {
    if (!S.rLoaded) { el.innerHTML = '<p class="loading">載入聖事禮典…</p>'; try { await loadRites(); S.rLoaded = true; } catch (e) { el.innerHTML = '<p class="empty">未能載入聖事禮典。</p>'; return; } if (S.book !== 'r') return; }
    el.innerHTML = renderRites();
    bindRites(el, { rerender: () => render() });
    finish(el); return;
  }
  if (!missalLoaded()) { el.innerHTML = '<p class="loading">載入彌撒經文…</p>'; try { await loadMissal(); } catch (e) { el.innerHTML = '<p class="empty">未能載入彌撒經文。</p>'; return; } if (S.book !== 'm') return; }
  const list = massesFor(info, S.choice[S.date] || '');
  if (!list.list.length) { el.innerHTML = '<p class="empty">此日彌撒經文尚未收錄。</p>'; return; }
  const saved = store.get('mass.' + S.date, null);
  const all = [...list.list, ...list.more];
  const cur = (saved && all.find((m) => m.id === saved.mass)) || list.list[0];
  const def = massDefaults(info, cur, S.date);
  const st = saved && saved.mass === cur.id ? { ...def, ...saved } : { ...def, mass: cur.id };
  const save = () => store.set('mass.' + S.date, st);
  el.innerHTML = `${list.list.length > 1 || cur !== list.list[0] ? `<h1 class="mtitle">${esc(cur.label)}</h1>` : ''}${optionsPanel(info, list, cur, st, S.date)}<div class="mass">${massHtml(info, cur, st, S.date)}</div>`;
  el.querySelectorAll('select[data-ms]').forEach((x) => x.onchange = () => {
    const k = x.dataset.ms, v = x.value;
    if (k === 'mass') { store.set('mass.' + S.date, { mass: v }); render(); return; }
    if (k === 'gloria' || k === 'dead') st[k] = v === '1';
    else if (k === 'ep' || k === 'bless') st[k] = v;
    else if (k === 'pf') st.pf = (v === 'p' || v === 'ep2') ? v : +v;
    else st[k] = +v;
    if (k === 'ep' && v !== 'II' && st.pf === 'ep2') st.pf = massDefaults(info, cur, S.date).pf;
    save(); const y = window.scrollY; render(); window.scrollTo(0, y);
  });
  const pan = el.querySelector('details.mpanel');
  if (pan) pan.addEventListener('toggle', () => { store.set('massPanelClosed', !pan.open); });
  if (pan && store.get('massPanelClosed', false)) pan.open = false;
  el.querySelectorAll('button[data-m]').forEach((b) => b.onclick = () => {
    const [k, a, c] = b.dataset.m.split(':');
    if (k === 'reset') { store.set('mass.' + S.date, null); render(); return; }
    if (k === 'print') { window.print(); return; }
    if (k === 'rs') { st.rs = +a; st.alt = {}; }
    if (k === 'alt') { st.alt = { ...(st.alt || {}), [a]: +c }; }
    save(); const y = window.scrollY; render(); window.scrollTo(0, y);
  });
  finish(el); zh($('#celebs'));
}
// 台灣用「週」
function finish(el) {
  const cal = currentCalendar();
  if (cal === 'tw') retext($('#celebs'), /周/g, '週');
  zh(el);
}
function retext(e, re, to) {
  if (!e) return;
  const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue)) { re.lastIndex = 0; n.nodeValue = n.nodeValue.replace(re, to); }
  re.lastIndex = 0;
}

function shift(n) { const d = fromIso(S.date); S.date = iso(new Date(d.getTime() + n * 864e5)); render(); window.scrollTo(0, 0); }

function applyPrefs() {
  const root = document.documentElement;
  root.style.setProperty('--fs', store.get('fs', 19) + 'px');
  const th = store.get('theme', null); if (th) root.dataset.theme = th; else delete root.dataset.theme;
  document.body.classList.toggle('norubrics', !store.get('rubrics', true));
  $('#rubrics').checked = store.get('rubrics', true);
  $('#showWelcome').checked = !store.get('skipWelcome', false);
  document.querySelectorAll('[data-theme]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.theme === (th || '')));
  document.querySelectorAll('[data-script]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.script === store.get('script', 't')));
  const ft = store.get('font', 'ming'); if (ft === 'ming') delete root.dataset.font; else root.dataset.font = ft;
  document.querySelectorAll('[data-font]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.font === ft));
}
function renderCalendars() {
  const el = $('#calendars'); if (!el) return;
  const order = ['general', 'hk', 'mo', 'tw'];
  el.innerHTML = calendarList().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((c) => `<button class="pill" data-cal="${c.id}" aria-pressed="${c.id === currentCalendar()}">${esc(c.name)}</button>`).join('');
  el.querySelectorAll('[data-cal]').forEach((b) => b.onclick = () => { store.set('cal', b.dataset.cal); setCalendar(b.dataset.cal); renderCalendars(); render(); });
  zh(el);
}

async function main() {
  parseHash();
  applyPrefs();
  $('#prev').onclick = () => shift(-1);
  $('#next').onclick = () => shift(1);
  $('#today').onclick = () => { S.date = hkToday(); render(); };
  $('#datePick').onchange = (e) => { if (e.target.value) { S.date = e.target.value; render(); } };
  $('#menuBtn').onclick = () => { $('#settings').hidden = false; };
  $('#closeSettings').onclick = () => { $('#settings').hidden = true; };
  $('#settings').onclick = (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; };
  document.querySelectorAll('[data-fs]').forEach((b) => b.onclick = () => { store.set('fs', Math.max(14, Math.min(30, store.get('fs', 19) + Number(b.dataset.fs)))); applyPrefs(); });
  document.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { store.set('theme', b.dataset.theme); applyPrefs(); });
  document.querySelectorAll('[data-font]').forEach((b) => b.onclick = () => { store.set('font', b.dataset.font); applyPrefs(); });
  $('#showWelcome').onchange = (e) => { store.set('skipWelcome', !e.target.checked); };
  $('#rubrics').onchange = (e) => { store.set('rubrics', e.target.checked); applyPrefs(); };
  document.addEventListener('keydown', (e) => { if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return; if (S.book !== 'm') return; if (e.key === 'ArrowLeft') shift(-1); if (e.key === 'ArrowRight') shift(1); });
  window.addEventListener('hashchange', () => { parseHash(); render(); });
  document.querySelectorAll('[data-script]').forEach((b) => b.onclick = async () => {
    const was = store.get('script', 't'); store.set('script', b.dataset.script); applyPrefs();
    if (was === b.dataset.script) return;
    if (b.dataset.script === 't') { location.reload(); return; }
    await loadT2S(); zh(); });
  const W = $('#welcome');
  const closeWelcome = () => { if (!W || W.hidden) return; W.classList.add('out'); setTimeout(() => { W.hidden = true; }, 400); };
  if (store.get('skipWelcome', false)) W.hidden = true;
  $('#welcomeGo').onclick = () => { if ($('#welcomeSkip').checked) { store.set('skipWelcome', true); applyPrefs(); } closeWelcome(); };
  await Promise.all([loadCalendar(), loadT2S()]);
  setCalendar(store.get('cal', 'hk'));
  renderCalendars();
  zh();
  render();
  initTTS(store);
  if (navigator.serviceWorker && navigator.serviceWorker.register && location.protocol !== 'file:') try {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { $('#update').hidden = false; $('#updateBtn').onclick = () => w.postMessage('skip'); } }); });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) navigator.serviceWorker.getRegistration().then((r) => r && r.update()); });
  } catch (e) { /* offline caching unavailable in this browser */ }
}
main();
