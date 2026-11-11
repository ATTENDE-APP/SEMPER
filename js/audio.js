// 朗讀錄音的保存、下載及刪除（設定 › 朗讀錄音）。
// Clips live in the service worker's cache 'audio-v1'. Each clip's last use (played, or the day it was downloaded for)
// is kept in localStorage; clips not used for 30 days are removed automatically (checked once a day).
// Download index per month on R2: index/YYYY-MM.json = { sizes: {key: bytes}, days: {date: {hour: [keys]}} }.
const BASES = { yue: 'https://audio.attende.app/yue/wl1/', cmn: 'https://audio.attende.app/cmn/m1/' };   // 粵語 WanLung; 普通話 (voice to be chosen)
export const base = (lang) => BASES[lang] || BASES.yue;
const lang = () => (store ? store.get('ttsLang', 'yue') : 'yue');
const CACHE = 'audio-v1';
const KEEP_DAYS = 30;
const DAY = 864e5;
let store = null;

const hkDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(d);   // YYYY-MM-DD
const dayNo = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
const keyOf = (url) => { const m = /\/([0-9a-f]{14})\.mp3$/.exec(url); return m ? m[1] : null; };
const hasCache = () => typeof caches !== 'undefined';
const mb = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(b > 0 ? 1 : 0, Math.round(b / 1e6)) + ' MB');

function used() { return store.get('audioUsed', {}); }
// record that clips were used; `iso` = the day they are for (a download for next week counts from that day)
export function markUsed(keys, iso) {
  if (!store) return;
  const u = used(); const n = Math.max(dayNo(hkDate()), iso ? dayNo(iso) : 0);
  for (const k of keys) if (!(u[k] >= n)) u[k] = n;
  store.set('audioUsed', u);
}

export async function cleanup(force = false) {
  if (!hasCache() || !store) return;
  const today = dayNo(hkDate());
  if (!force && store.get('audioClean', 0) === today) return;
  store.set('audioClean', today);
  try {
    const c = await caches.open(CACHE); const u = used(); let changed = false;
    for (const req of await c.keys()) {
      const k = keyOf(req.url); if (!k) continue;
      if (u[k] === undefined) { u[k] = today; changed = true; continue; }   // saved before this version: start counting now
      if (u[k] < today - KEEP_DAYS) { await c.delete(req); delete u[k]; changed = true; }
    }
    for (const k of Object.keys(u)) if (u[k] < today - KEEP_DAYS) { delete u[k]; changed = true; }
    if (changed) store.set('audioUsed', u);
  } catch (e) { /* storage not available */ }
}

async function cachedSet() {
  const s = new Set(); if (!hasCache()) return s; const b = base(lang());
  try { const c = await caches.open(CACHE); for (const r of await c.keys()) { const k = keyOf(r.url); if (k && r.url.startsWith(b)) s.add(k); } } catch (e) {}
  return s;
}
export async function usage() {
  if (!hasCache()) return { n: 0, bytes: 0 };
  let n = 0, bytes = 0;
  try {
    const c = await caches.open(CACHE);
    for (const r of await c.keys()) {
      if (!keyOf(r.url)) continue;
      n++; const res = await c.match(r);
      const len = +(res && res.headers.get('content-length')) || 0;
      bytes += len || (res ? (await res.clone().blob()).size : 0);
    }
  } catch (e) {}
  return { n, bytes };
}
export async function clearAll() {
  if (hasCache()) try { await caches.delete(CACHE); } catch (e) {}
  store.set('audioUsed', {});
}

const idx = new Map();
function month(m) {   // 'YYYY-MM' → index or null
  const id = lang() + m;
  if (!idx.has(id)) idx.set(id, fetch(base(lang()) + 'index/' + m + '.json', { mode: 'cors', cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => { idx.delete(id); return null; }));
  return idx.get(id);
}
// what a download would fetch: dates from today, hours chosen
export async function plan(nDays, hours) {
  const start = dayNo(hkDate()); const want = new Map(); let last = null, missing = 0;
  for (let i = 0; i < nDays; i++) {
    const iso = new Date((start + i) * DAY).toISOString().slice(0, 10);
    const ix = await month(iso.slice(0, 7));
    const d = ix && ix.days[iso];
    if (!d) { missing++; continue; }
    last = iso;
    for (const h of hours) for (const k of d[h] || []) if (!want.has(k)) want.set(k, { iso, size: ix.sizes[k] || 0 });
  }
  const have = await cachedSet();
  let need = 0, haveB = 0; const todo = [];
  for (const [k, v] of want) { if (have.has(k)) haveB += v.size; else { need += v.size; todo.push([k, v.iso]); } }
  return { todo, keys: [...want.keys()], need, have: haveB, last, missing, want, base: base(lang()) };
}
export async function download(p, onProgress, signal) {
  const c = await caches.open(CACHE); let done = 0, bytes = 0, fail = 0; const q = p.todo.slice();
  const ctrl = typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller;
  const worker = async () => {
    while (q.length && !signal.aborted) {
      const [k] = q.shift(); const url = p.base + k + '.mp3';
      try {
        if (!(await c.match(url))) {
          const r = await fetch(url, { mode: 'cors', signal });
          if (!r.ok) throw new Error(r.status);
          if (!ctrl) await c.put(url, r.clone());   // without the service worker, store it here
          bytes += (await r.blob()).size;
        }
      } catch (e) { if (signal.aborted) return; fail++; }
      done++; onProgress(done, p.todo.length, bytes);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  // count every clip of the plan as used on the day it is for
  const byDay = {}; for (const [k, v] of p.want) (byDay[v.iso] = byDay[v.iso] || []).push(k);
  for (const iso of Object.keys(byDay)) markUsed(byDay[iso], iso);
  return { done, fail, bytes };
}

// ---- 設定 › 朗讀錄音 ----
export function initAudioSettings(st, HOURS) {
  store = st;
  const $ = (s) => document.querySelector(s);
  const box = $('#audioSet'); if (!box || !hasCache() || typeof fetch === 'undefined') { if (box) box.hidden = true; return; }
  cleanup();
  const hours = HOURS.filter((h) => h.n !== '0');   // 序經 goes with the first hour of the day
  $('#aHours').innerHTML = hours.map((h) => `<label class="ahr"><input type="checkbox" value="${h.n}" checked> ${h.name}</label>`).join('');
  let range = store.get('audioRange', 7), busy = null, cur = null, seq = 0;
  const chosen = () => { const hs = [...document.querySelectorAll('#aHours input:checked')].map((x) => x.value); return hs.length ? ['0', ...hs] : []; };
  const paintRange = () => document.querySelectorAll('[data-arange]').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.arange === range));
  const showUse = async () => { $('#aUse').textContent = '已保存：計算中…'; const u = await usage(); $('#aUse').textContent = u.n ? `已保存：${u.n} 段，約 ${mb(u.bytes)}` : '已保存：沒有'; };
  const replan = async () => {
    const my = ++seq; const hs = chosen();
    $('#aGo').disabled = true;
    if (!hs.length) { $('#aPlan').textContent = '請選擇時辰。'; return; }
    $('#aPlan').textContent = '計算中…';
    $('#aLang').textContent = lang() === 'cmn' ? '普通話' : '粵語';
    cur = await plan(range, hs);
    if (my !== seq) return;
    if (!cur.keys.length) { $('#aPlan').textContent = navigator.onLine === false ? '未能連線，請稍後再試。' : '這些日子暫時未有錄音。'; return; }
    const tail = cur.missing && cur.last ? `（錄音暫時只到 ${cur.last.slice(5).replace('-', '月')}日）` : '';
    $('#aPlan').textContent = cur.todo.length ? `需下載約 ${mb(cur.need)}${cur.have ? `（另有 ${mb(cur.have)} 已保存）` : ''}。${tail}` : `已全部保存。${tail}`;
    $('#aGo').disabled = !cur.todo.length;
  };
  document.querySelectorAll('[data-arange]').forEach((b) => b.onclick = () => { range = +b.dataset.arange; store.set('audioRange', range); paintRange(); replan(); });
  $('#aHours').onchange = replan;
  $('#aGo').onclick = async () => {
    if (!cur || busy) return;
    busy = new AbortController();
    $('#aGo').hidden = true; $('#aStop').hidden = false; $('#aProg').hidden = false; $('#aProg').value = 0;
    const r = await download(cur, (d, n, b) => { $('#aProg').max = n; $('#aProg').value = d; $('#aPlan').textContent = `下載中… ${d}／${n}（${mb(b)}）`; }, busy.signal);
    const stopped = busy.signal.aborted; busy = null;
    $('#aGo').hidden = false; $('#aStop').hidden = true; $('#aProg').hidden = true;
    await replan(); showUse();
    if (stopped) $('#aPlan').textContent = '已取消。' + $('#aPlan').textContent;
    else if (r.fail) $('#aPlan').textContent = `有 ${r.fail} 段未能下載（請檢查網絡後再按下載）。`;
  };
  $('#aStop').onclick = () => { if (busy) busy.abort(); };
  let armed = 0;
  $('#aDel').onclick = async () => {
    if (Date.now() - armed > 4000) { armed = Date.now(); $('#aDel').textContent = '再按一次確定刪除'; setTimeout(() => { $('#aDel').textContent = '刪除所有錄音'; }, 4000); return; }
    armed = 0; $('#aDel').textContent = '刪除所有錄音';
    await clearAll(); showUse(); replan();
  };
  paintRange();
  // refresh when the settings sheet opens
  new MutationObserver(() => { if (!$('#settings').hidden) { showUse(); replan(); } }).observe($('#settings'), { attributes: true, attributeFilter: ['hidden'] });
}
