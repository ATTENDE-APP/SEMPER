import { displayNotice, bindWelcomeSetting, validDate, parseRoute, isCompletenessWarning, completenessWarnings } from './ui.js';
import { loadData, office, dayInfo, HOURS, dateLabel, nearestArchiveDate, invitPsalms, setCalendar, calendarList, currentCalendar, userCommons, userCollect, setUserSaints } from './office.js';
import { fromIso, iso, WD } from './calendar.js';
import { initTTS, stop as stopTTS } from './tts.js';

const APP_VERSION = '1.0 (6)';   // Match iOS marketing version and build.
const CONTENT_VERSION = 66;   // Internal data/cache revision; matches sw.js, never shown as the release name.
const $ = (s) => document.querySelector(s);
const store = { get(k, d) { try { const v = localStorage.getItem('rike.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rike.' + k, JSON.stringify(v)); } catch {} } };

const hkToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
function defaultHour() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 4) return '5'; if (h < 10) return '1'; if (h < 16) return '2'; if (h < 20) return '3'; return '5';
}
// 日間祈禱: 午前 before noon, 午時 until 3 p.m., then 午後 (Hong Kong time); a tap changes it for this session only
function defaultSub() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: 'numeric', hour12: false }).format(new Date()));
  return h < 12 ? '午前' : h < 15 ? '午時' : '午後';
}
const S = { date: hkToday(), hour: defaultHour(), choice: {}, sub: defaultSub(), inv: store.get('inv', '95'), alt: store.get('alt', {}) };

function parseHash() {
  const route = parseRoute(location.hash);
  if (route.date) S.date = route.date;
  if (route.hour) S.hour = route.hour;
  if (route.choice !== undefined) S.choice[S.date] = route.choice;
}
function setHash() {
  const c = S.choice[S.date];
  history.replaceState(null, '', `#/${S.date}/${S.hour}${c ? '?c=' + c : ''}`);
}

// ---------- 繁體 / 簡體 ----------
// The texts are stored in 繁體字; with 簡體字 selected every text node is converted after rendering
// (characters via OpenCC's table, plus the phrases where the character table alone would be wrong).
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
  if (!T2S || store.get('script', 't') !== 's') return;
  // Keep Traditional text available to device speech when the display is Simplified.
  (root.querySelectorAll ? root : document).querySelectorAll('#office section > p:not([data-tc])').forEach((p) => { p.dataset.tc = p.innerHTML; });
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('[data-script]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let n = w.nextNode(); n; n = w.nextNode()) { const v = n.nodeValue.replace(T2S.re, T2S.f); if (v !== n.nodeValue) n.nodeValue = v; }
  if (root === document.body) document.title = document.title.replace(T2S.re, T2S.f);
}

// ---------- rendering ----------
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// chanting marks are never shown; stray spaces between Chinese characters are dropped
const marks = (s) => esc(s.replace(/\s*[※*＊†]\s*/g, '').replace(/(?<=[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef])\s+(?=[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef])/g, ''));
const VERSE = new Set(['psalmody', 'gospel', 'invit', 'tedeum']);
const MARK_END = /[※*＊†]\s*$/;
function renderLine(l, ctx = {}) {
  let m;
  if (l.startsWith('§')) return `<h4 class="alt">${esc(l.slice(1))}</h4>`;
  // ℣ 領 / ℟ 答 (答 also for 眾): only the labels are red, the text is black like all other text.
  if ((m = l.match(/^(領|眾|答|啟|應)\s*[：:]\s*(.*)$/))) {
    const t = m[2].replace(/^[—─]{1,2}\s*/, '');
    if ('領啟'.includes(m[1])) return t !== m[2] ? `<p class="vr" data-part="lead">${marks(m[2])}</p>` : `<p class="vr" data-part="lead"><span class="spk">領：</span>${marks(t)}</p>`;
    return `<p class="vr" data-part="resp"><span class="spk">答：</span>${marks(t)}</p>`;
  }
  if (/^[—─]{1,2}/.test(l)) return `<p class="cont" data-part="lead">${marks(l)}</p>`;   // second half of an intercession, with its dash
  if ((m = l.match(/^((?:謝主曲|讚主曲)?對經[一二三]?)\s*[：:]\s*(.*)$/))) return `<p class="ant"><span class="antl">${m[1]}：</span>${marks(m[2])}</p>`;
  if (/^(壹|貳|叁|肆|伍)$/.test(l)) return `<p class="part">${l}</p>`;
  if (/^(夜間或清晨用|日間用|午前|午時|午後)(\s*[（(].*[)）])?$/.test(l)) return `<h4 class="alt">${esc(l)}</h4>`;
  if (/^[（(][^）)]*[)）]$/.test(l) || /^\(?(任擇其一|第[一二三]式)\)?$/.test(l)) return `<p class="rub">${esc(l)}</p>`;
  // the sentence under a psalm title (「…」(希3:13)); quoted words inside a psalm stay psalm text
  if ((/^「.*」/.test(l) && (/[（(][^（）()]*\d[^（）()]*[）)]\s*$/.test(l) || /^(聖詠|聖歌|讚主曲|西默盎|匝加利亞|聖母謝主曲)/.test(ctx.prev || ''))) || /^（[^）]*）$/.test(l)) return `<p class="epi">${esc(l)}</p>`;
  if (l.length < 40 && /^(聖詠|聖歌|讚主曲|西默盎|匝加利亞|聖母謝主曲|\(路)/.test(l)) return `<p class="ps">${esc(l)}</p>`;
  if (/^(恭讀|選讀|續讀)/.test(l) && (l.length < 60 || (ctx.k === 'r2' && l.length < 200 && !/[。！？]/.test(l)))) return `<p class="rd">${esc(l)}</p>`;
  if ((m = l.match(/^(對答詠)(?:[\s\u3000]+(.*))?$/))) return `<h2 class="sh">${m[1]}</h2>` + (m[2] ? `<p class="rd">${esc(m[2])}</p>` : '');   // label red, Bible reference black   // same header style as 開端詞、讚美詩、聖詠吟唱、誦讀一、誦讀二、讚主詩
  if (/^(領：|答：)/.test(l)) return `<p>${esc(l)}</p>`;
  let cls = '';
  if (VERSE.has(ctx.k)) cls = MARK_END.test(l) ? '' : 've';
  else if (ctx.k === 'hymn') cls = /[。；！？」]\s*$/.test(l) ? 've' : '';
  else if (l.length > 34 && !MARK_END.test(l)) cls = 'prose';
  return `<p${cls ? ` class="${cls}"` : ''}>${marks(l)}</p>`;
}
// a canticle that follows the responsory in the same section (夜禱: 西默盎聖歌) is set out verse by verse
// 禱詞 (晨禱／晚禱): the people's response is shown once, after the introduction; each petition then ends with 【答】 instead of repeating it
function compactInterc(lines) {
  const seen = new Set(), out = [];
  for (let l of lines) {
    l = l.replace(/\s*［眾］\s*$/, '【答】');   // one text writes ［眾］ after each petition instead of repeating the response
    if (/^眾\s*[：:]/.test(l)) {
      const key = l.replace(/\s+/g, '');
      if (seen.has(key)) { if (out.length && !/【答】$/.test(out[out.length - 1])) out[out.length - 1] += '【答】'; continue; }
      seen.add(key);
    }
    out.push(l);
  }
  return out;
}
function renderLines(lines, s) {
  if (s.k === 'interc') lines = compactInterc(lines);
  let ctx = { ...s, st: {} };
  return lines.map((l, i) => { if (!VERSE.has(ctx.k) && l.length < 40 && /^(西默盎|聖母謝主曲|匝加利亞)/.test(l)) ctx = { ...ctx, k: 'gospel' }; return renderLine(l, { ...ctx, prev: lines[i - 1] }); }).join('').replace(/【答】/g, '<span class="spk">【答】</span>');
}
const tabs = (attr, items, cur) => `<div class="tabs" role="group">${items.map(([v, lab]) => `<button class="pill" ${attr}="${v}" aria-pressed="${v === cur}">${esc(lab)}</button>`).join('')}</div>`;

// 序經: the day's antiphon with Ps 95 (default), 100, 67 or 24 — antiphon repeated after each strophe
function renderInvit(s) {
  const P = invitPsalms();
  // the day's antiphon(s): lines before the psalm; "或" separates alternatives
  const head = []; for (const l of s.lines) { if (/^聖詠/.test(l)) break; head.push(l); }
  const ants = []; let cur = null;
  for (const l of head) {
    if (/^[（(]?或[)）]?$/.test(l)) { cur = null; continue; }
    const m = l.match(/^(?:領|眾)\s*[：:]\s*(.*)$/) || l.match(/^或[：:]\s*(?:領\s*[：:]\s*)?(.*)$/);
    if (m && m[1] && !cur) { cur = m[1]; ants.push(cur); }
  }
  if (!P || !ants.length) return null;
  const ai = Math.min(S.alt['invit-ant'] || 0, ants.length - 1), ant = ants[ai];
  const ps = P[S.inv] || P['95'];
  const lab = { 95: '聖詠95', 100: '聖詠100', 67: '聖詠67', 24: '聖詠24' };
  const out = [`領：${ant}`, `眾：${ant}`];
  const body = [`§${ps.title}`, `¤${ps.epi}`];
  for (const st of ps.strophes) body.push(...st.map((l) => '¶' + l), `對經：${ant}`);
  body.push(...ps.gloria.map((l) => '¶' + l), `對經：${ant}`);
  const h = `<h2 class="sh">${esc(s.h)}</h2>`;
  const antTabs = ants.length > 1 ? tabs('data-alt', ants.map((a, j) => [`invit-ant:${j}`, `對經${'一二三四'[j]}`]), `invit-ant:${ai}`) : '';
  return `<section class="s-invit">${h}${antTabs}${tabs('data-inv', ['95', '100', '67', '24'].map((k) => [k, lab[k]]), S.inv)}${out.map((l) => renderLine(l, s)).join('')}${body.map((l) => l.startsWith('§') ? `<p class="ps">${esc(l.slice(1))}</p>` : l.startsWith('¶') ? `<p>${marks(l.slice(1))}</p>` : l.startsWith('¤') ? `<p class="epi">${esc(l.slice(1))}</p>` : renderLine(l, s)).join('')}</section>`;
}

// 誦讀一／二: only the label is red; the source that follows (恭讀 / 選讀 …) is black, same style as the line under the header
function secHead(s) {
  const m = (s.k === 'r1' || s.k === 'r2') && s.h && s.h.match(/^(誦讀[一二])[\s\u3000]+(.+)$/);
  if (!m) return `<h2 class="sh">${esc(s.h)}</h2>`;
  return `<h2 class="sh">${m[1]}</h2>` + (/^(恭讀|選讀|續讀)/.test(m[2]) ? `<p class="rd">${esc(m[2])}</p>` : `<p class="epi">${esc(m[2])}</p>`);
}

function renderSection(s, hour) {
  if (hour === '2' && s.sub && s.sub !== S.sub) return '';
  if (hour === '2' && s.k === 'psalmody' && s.complement?.[S.sub]) {
    s = { ...s, alts: [{ label: '本日聖詠', lines: s.lines }, { label: '補充聖詠', lines: s.complement[S.sub] }] };
  }
  if (hour === '2') {   // the source's heading for the next part (§午前, (午時)…) is left at the end of a section: drop it
    const trim = (ls) => { const o = (ls || []).slice(); while (o.length && /^§?[（(]?(午前|午時|午後)[）)]?(\s*[（(][^）)]*[）)])?$/.test(o[o.length - 1])) o.pop(); return o; };
    s = { ...s, lines: trim(s.lines), ...(s.alts ? { alts: s.alts.map((a) => ({ ...a, lines: trim(a.lines) })) } : {}) };
  }
  if (s.k === 'invit') { const r = renderInvit(s); if (r) return r; }
  if (s.alts && s.alts.length > 1) {      // alternative texts (e.g. hymns from the commission and the three volumes)
    const key = `${hour}${s.k}${hour === '2' && s.k === 'psalmody' ? '-' + S.sub : ''}`; const i = Math.min(S.alt[key] || 0, s.alts.length - 1);
    const a = s.alts[i];
    const h = `<h2 class="sh">${esc(s.h)}</h2>`;
    return `<section class="s-${s.k}">${h}${tabs('data-alt', s.alts.map((x, j) => [`${key}:${j}`, x.label]), `${key}:${i}`)}${renderLines(a.lines, s)}</section>`;
  }
  if (s.k === 'bio') return `<section class="bio"><h2 class="sh">${esc(s.h)}</h2>${s.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</section>`;
  let lines = s.lines;
  if (hour === '2' && s.k === 'hymn') { // three hymns for 午前/午時/午後 — show the selected one
    const blocks = []; let cur = null;
    for (const l of lines) { if (l.startsWith('§')) { cur = { h: l.slice(1), l: [] }; blocks.push(cur); } else if (cur) cur.l.push(l); else blocks.push(cur = { h: '', l: [l] }); }
    const pick = blocks.find((b) => b.h.startsWith(S.sub)) || blocks[0];
    lines = pick ? pick.l : lines;
  }
  const h = s.h && !/^(午前|午時|午後)/.test(s.h) ? secHead(s) : '';
  return `<section class="s-${s.k}">${h}${renderLines(lines, s)}</section>`;
}

function renderCelebs(info) {
  const d = fromIso(S.date);
  const tp = info.L.temporal;
  const el = $('#celebs');
  const parts = [`<div class="day">${info.L.primary.source === 'santoral' && tp.title ? tp.title : WD[d.getUTCDay()]}${tp.psalter ? `・聖詠集第${'一二三四'[tp.psalter - 1]}周` : ''}・主日${info.L.cycles.sunday}年・平日${info.L.cycles.weekday}年</div>`];
  // the day's celebration as a heading (rank after it); when there is a choice, the options as a short list
  const cur = S.choice[S.date] || '';
  const labOf = (c) => (c.kind === 'commemoration' ? '紀念' : c.kind === 'optional' ? '自由紀念' : ({ solemnity: '節日', feast: '慶日', memorial: '紀念' }[c.rank] || '平日'));
  const sel = info.choices.find((c) => c.id === cur) || info.choices[0];
  const selLab = labOf(sel) !== '平日' || info.choices.length > 1 ? labOf(sel) : '';
  const mine = (id) => MY.some((u) => u.id === id);
  const myTag = (id) => (mine(id) ? '<span class="mytag">我的聖人</span>' : '');
  parts.push(`<h1 class="cel">${esc(sel.title)}${selLab ? `<span class="rank">${selLab}</span>` : ''}${sel.kind === 'primary' ? myTag(info.L.primary.id) : ''}</h1>`);
  if (info.choices.length > 1) {
    parts.push(`<div class="opts" role="group" aria-label="今日可選"><div class="opts-lab">今日可選：</div>${info.choices.map((c) =>
      `<button class="opt" data-c="${c.id}" aria-pressed="${c.id === cur}"><span class="dot" aria-hidden="true">${c.id === cur ? '◉' : '○'}</span><span>${esc(c.title)} <small>${labOf(c)}</small>${myTag(c.id)}</span></button>`).join('')}</div>`);
  }
  parts.push(`<button class="addsaint" type="button">＋ 加入我的聖人…</button>`);
  el.innerHTML = parts.join('');
  el.querySelectorAll('button.opt').forEach((b) => b.onclick = () => { S.choice[S.date] = b.dataset.c; render(); });
  el.querySelector('.addsaint').onclick = (e) => openSaintEditor(null, e.currentTarget);
}

let dataReady = false;
function render() {
  if (!dataReady) return;
  stopTTS();   // new text on screen: stop reading
  const info = dayInfo(S.date);
  if (!info.choices.some((c) => c.id === (S.choice[S.date] || ''))) S.choice[S.date] = '';
  const [y, m, d] = S.date.split('-').map(Number);
  $('#dateLabel').textContent = `${y}年${m}月${d}日`;
  $('#datePick').value = S.date;
  renderCelebs(info);
  $('#hours').innerHTML = HOURS.map((h) => `<button aria-pressed="${h.n === S.hour}" data-h="${h.n}">${h.short}</button>`).join('');
  $('#hours').querySelectorAll('button').forEach((b) => b.onclick = () => { S.hour = b.dataset.h; render(); window.scrollTo(0, 0); });
  const r = office(S.date, S.hour, S.choice[S.date] || '');
  // the date and the day's celebration are already shown above; the heading names the hour only
  // (on the eve of a solemnity or Sunday it also names the celebration whose First Vespers/Compline this is)
  const hourName = HOURS.find((h) => h.n === S.hour).name;
  const fv = /第一(晚禱|夜禱)/.test(r.title);
  const head = fv ? r.title.replace(/^[^　\s]*月[^　\s]*日[　\s]*/, '').replace(/（聖詠集[^）]*）/g, '').trim() : hourName;
  let html = fv ? `<h1>${esc(head)}</h1>` : '';   // the hour itself is already the selected tab
  const warnings = [...new Set(completenessWarnings(r).map(displayNotice).filter(Boolean))];
  if (warnings.length) html += `<div class="completeness" role="note" aria-label="經文完整性提示">${warnings.map((n) => `<p>${esc(n)}</p>`).join('')}</div>`;
  const notes = r.notes.filter((n) => !isCompletenessWarning(n)).map(displayNotice).filter(Boolean);
  if (notes.length) html += `<div class="notes">${notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>`;
  // the invitatory opens the day's prayer (GILH 35); wording of the rubric after 《每日頌禱》:「如念序經，則省去此開端詞」
  if (S.hour === '4' || S.hour === '1') html += `<p class="rub firsthour">如本時辰是一日的第一個祈禱，先念<a href="#" data-goto="0">序經</a>；如念序經，則省去此開端詞。</p>`;
  if (S.hour === '2') html += `<div class="subsel">${['午前', '午時', '午後'].map((x) => `<button class="pill" data-sub="${x}" aria-pressed="${x === S.sub}">${x}</button>`).join('')}</div>`;
  html += r.sections.length ? r.sections.map((s) => renderSection(s, S.hour)).join('') : `<p class="empty">此日日課尚未收錄。</p>`;
  $('#office').innerHTML = html;
  $('#office').setAttribute('aria-busy', 'false');
  $('#office').querySelectorAll('[data-goto]').forEach((a) => a.onclick = (e) => { e.preventDefault(); S.hour = a.dataset.goto; render(); window.scrollTo(0, 0); });
  $('#office').querySelectorAll('[data-sub]').forEach((b) => b.onclick = () => { S.sub = b.dataset.sub; render(); });
  $('#office').querySelectorAll('[data-inv]').forEach((b) => b.onclick = () => { S.inv = b.dataset.inv; store.set('inv', S.inv); render(); });
  $('#office').querySelectorAll('[data-alt]').forEach((b) => b.onclick = () => { const [k, i] = b.dataset.alt.split(':'); S.alt[k] = +i; store.set('alt', S.alt); render(); });
  setHash();
  const cal = currentCalendar();
  if (cal === 'tw') retext('#office h1, #celebs', /周/g, '週');            // 台灣用「週」
  // 亞孟／阿們：by default 港澳 亞孟, elsewhere 阿們; the reader can choose either in 設定 (Fr. Gervais, 11 Nov 2026)
  const amen = store.get('amen', 'auto');
  if (amen === '阿們' || (amen === 'auto' && cal !== 'hk' && cal !== 'mo')) retext('#office', /亞孟/g, '阿們');
  zh($('header') || document.body); zh($('#office')); zh($('#celebs') || document.body);
}

function retext(sel, re, to) {
  for (const e of document.querySelectorAll(sel)) {
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue)) { re.lastIndex = 0; n.nodeValue = n.nodeValue.replace(re, to); }
    re.lastIndex = 0;
  }
}

function shift(n) { const d = fromIso(S.date); const next = iso(new Date(d.getTime() + n * 864e5)); if (!validDate(next)) return; S.date = next; render(); window.scrollTo(0, 0); }

function applyPrefs() {
  const root = document.documentElement;
  root.style.setProperty('--fs', store.get('fs', 19) + 'px');
  const th = store.get('theme', null); if (th) root.dataset.theme = th; else delete root.dataset.theme;
  document.querySelectorAll('[data-amen]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.amen === store.get('amen', 'auto')));
  if ($('#showWelcome')) $('#showWelcome').setAttribute('aria-checked', String(!store.get('skipWelcome', false)));
  document.querySelectorAll('button[data-theme]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.theme === (th || '')));
  document.querySelectorAll('[data-script]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.script === store.get('script', 't')));
  const ft = store.get('font', 'ming'); if (ft === 'ming') delete root.dataset.font; else root.dataset.font = ft;
  document.querySelectorAll('[data-font]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.font === ft));
}
function renderCalendars() {
  const order = ['general', 'hk', 'mo', 'tw'];
  const calendars = calendarList().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const id of ['calendars', 'welcomeCalendars']) {
    const el = $('#' + id); if (!el) continue;
    el.innerHTML = calendars.map((c) => `<button class="pill" data-cal="${c.id}" aria-pressed="${c.id === currentCalendar()}">${esc(c.name)}</button>`).join('');
    el.querySelectorAll('[data-cal]').forEach((b) => b.onclick = () => { store.set('cal', b.dataset.cal); setCalendar(b.dataset.cal); renderCalendars(); render(); $('#' + id).querySelector(`[data-cal="${b.dataset.cal}"]`)?.focus(); });
    zh(el);
  }
}

// ---------- sheets (settings, month calendar, saint editor): focus kept inside, Esc or a tap outside closes ----------
const sheetOpener = new Map();
function openSheet(el, focusEl, opener = document.activeElement) {
  sheetOpener.set(el, opener);
  el.hidden = false; document.body.classList.add('settings-open');
  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    el.addEventListener('click', (e) => { if (e.target === el) closeSheet(el); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(el); return; }
      if (e.key !== 'Tab') return;
      const f = [...el.querySelectorAll('button, input, select, textarea, a[href]')].filter((x) => !x.disabled && x.getClientRects().length);
      const first = f[0], last = f.at(-1);
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement) || document.activeElement.tabIndex < 0)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  (focusEl || el).focus();
}
function closeSheet(el, refocus = true) {
  el.hidden = true;
  if (!document.querySelector('.sheet:not([hidden])')) document.body.classList.remove('settings-open');
  const o = sheetOpener.get(el); sheetOpener.delete(el);
  if (refocus && o && o.isConnected) o.focus();
}

// ---------- liturgical colour of a day (month calendar) ----------
// w white, r red, g green, v violet, p rose
function colourOf(info, choiceId) {
  const L = info.L, T = L.temporal;
  const sel = info.choices.find((c) => c.id === choiceId && c.kind === 'optional');
  const p = sel || L.primary;
  if (p.source === 'temporal' || p.source === 'movable') {
    if (['palm', 'goodfriday', 'pentecost'].includes(T.key)) return 'r';
    if (T.key === 'adv3-0' || T.key === 'lent4-0') return 'p';
    if (p.source === 'movable' || T.rank || T.key === 'holy-4') return 'w';
    if (T.season === 'adv' || T.season === 'lent' || T.season === 'tri') return 'v';
    return T.season === 'ot' ? 'g' : 'w';
  }
  if (p.rank === 'allsouls') return 'v';
  const cs = Array.isArray(p.common) ? p.common.join() : (p.common || '');
  if (/殉道/.test(cs)) return 'r';
  if (/殉道|十字聖架|聖神/.test(p.title) || (/宗徒|聖史/.test(p.title) && !/若望宗徒|若望聖史|宗座|歸化|聖母/.test(p.title))) return 'r';
  return 'w';
}

// ---------- month calendar ----------
let mCur = [2026, 1];
function openMonth(opener) {
  const [y, m] = S.date.split('-').map(Number); mCur = [y, m];
  renderMonth(); openSheet($('#month'), $('#monthGrid').querySelector('.sel') || $('#monthTitle'), opener);
}
function renderMonth() {
  const [y, m] = mCur;
  $('#monthTitle').textContent = `${y}年${m}月`;
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = hkToday();
  let html = '日一二三四五六'.split('').map((x, i) => `<div class="mh${i ? '' : ' sun'}" aria-hidden="true">${x}</div>`).join('');
  for (let i = 0; i < startDow; i++) html += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const date = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!validDate(date)) { html += '<div></div>'; continue; }
    const info = dayInfo(date), cur = S.choice[date] || '';
    const sel = info.choices.find((c) => c.id === cur) || info.choices[0];
    const opt = info.choices.length > 1;
    const dow = (startDow + d - 1) % 7;
    html += `<button data-d="${date}" class="${date === S.date ? 'sel' : ''}${date === today ? ' today' : ''}${dow === 0 ? ' sun' : ''}" style="--c:var(--lc-${colourOf(info, cur)})" aria-label="${m}月${d}日 ${esc(sel.title)}${opt ? '（可選自由紀念）' : ''}"${date === S.date ? ' aria-current="date"' : ''}><span class="dn">${d}</span><span class="bar"></span>${opt ? '<span class="dot"></span>' : '<span class="nodot"></span>'}</button>`;
  }
  $('#monthGrid').innerHTML = html;
  $('#datePick').value = S.date;
  $('#monthGrid').querySelectorAll('button[data-d]').forEach((b) => b.onclick = () => { goDate(b.dataset.d); });
  zh($('#month'));
}
function goDate(date, hour) {
  if (!validDate(date)) return;
  S.date = date; if (hour) S.hour = hour;
  closeSheet($('#month'), false); render(); window.scrollTo(0, 0); $('#dateBtn').focus();
}
function initMonth() {
  const step = (n) => { let [y, m] = mCur; m += n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } if (y < 100 || y > 9998) return; mCur = [y, m]; renderMonth(); };
  $('#mPrev').onclick = () => step(-1);
  $('#mNext').onclick = () => step(1);
  $('#mToday').onclick = () => { S.sub = defaultSub(); goDate(hkToday(), defaultHour()); };
  $('#mClose').onclick = () => closeSheet($('#month'));
  $('#datePick').onchange = (e) => { if (validDate(e.target.value)) goDate(e.target.value); };
  let x0 = null;   // swipe left/right to change month
  $('#monthGrid').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  $('#monthGrid').addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1); });
}

// ---------- 我的聖人 (the reader's own saints; stored on the device under rike.mysaints) ----------
let MY = [];
const RANKS = { optional: '自由紀念', memorial: '紀念', feast: '慶日' };
function loadMySaints() { const a = store.get('mysaints', []); return Array.isArray(a) ? a.filter((u) => u && u.id && u.name && /^\d\d-\d\d$/.test(u.md)) : []; }
function saveMySaints() { store.set('mysaints', MY); setUserSaints(MY); render(); renderMySaints(); }
const mdLabel = (md) => { const [m, d] = md.split('-').map(Number); return `${m}月${d}日`; };
const commonLabel = (id) => (userCommons().find((c) => c.id === id) || {}).label || '';
function renderMySaints() {
  const el = $('#mySaintsList'); if (!el) return;
  const list = MY.slice().sort((a, b) => a.md.localeCompare(b.md) || a.name.localeCompare(b.name));
  el.innerHTML = list.length ? `<ul class="mslist">${list.map((u) => `<li><button class="msitem" data-id="${esc(u.id)}"><span class="msn">${esc(u.name)}</span><span class="msd">${mdLabel(u.md)}・${RANKS[u.rank] || ''}・${esc(commonLabel(u.common))}通用</span><span class="msedit" aria-hidden="true">編輯 ›</span></button></li>`).join('')}</ul>`
    : '<p class="about msnone">尚未加入聖人。可在每日標題下按「＋ 加入我的聖人…」，或按下面的「＋ 加入聖人」。需要的資料：名稱、日期、通用部分、等級，以及禱詞中的名字。</p>';
  el.querySelectorAll('.msitem').forEach((b) => b.onclick = () => openSaintEditor(MY.find((u) => u.id === b.dataset.id), b));
  zh(el);
}
// 「聖博德主教」→「博德」: the name as it goes into 「聖{N}…」
const oNameFrom = (n) => (n || '').replace(/[（(].*$/, '').replace(/^(聖女|聖婦|聖|真福)/, '').replace(/(及同伴|主教|教宗|司鐸|神父|院長|執事|會士|貞女|殉道|聖師|童貞)+$/, '').trim();
let ED = null;   // saint being edited: { u (existing or null), rank, collect, oAuto, opener }
function fillDays() {
  const m = +$('#sMonth').value, cur = +$('#sDay').value || 1, n = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  $('#sDay').innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i + 1}">${i + 1}日</option>`).join('');
  $('#sDay').value = String(Math.min(cur, n));
}
function renderCollects() {
  const c = userCommons().find((x) => x.id === $('#sCommon').value);
  const name = $('#sOName').value.trim() || '○○';
  const opts = (c ? c.collects : []).map((t, i) => [String(i), t.replace(/\{N\}/g, name)]);
  const cur = ED.collect;
  $('#sCollects').innerHTML = opts.map(([v, t]) => `<button class="col" role="radio" data-col="${v}" aria-checked="${cur === v}"><span class="radio" aria-hidden="true"></span><span>${esc(t)}</span></button>`).join('')
    + `<button class="col" role="radio" data-col="own" aria-checked="${cur === 'own'}"><span class="radio" aria-hidden="true"></span><span>自行輸入禱詞</span></button>`
    + `<textarea id="sCustom" rows="4" aria-label="自行輸入的結束禱詞" placeholder="例如聖人專用的集禱經"${cur === 'own' ? '' : ' hidden'}></textarea>`;
  $('#sCustom').value = ED.custom || '';
  $('#sCustom').oninput = (e) => { ED.custom = e.target.value; };
  $('#sCollects').querySelectorAll('[data-col]').forEach((b) => b.onclick = () => { ED.collect = b.dataset.col; renderCollects(); if (ED.collect === 'own') $('#sCustom').focus(); });
  zh($('#sCollects'));
}
function openSaintEditor(u, opener) {
  const fromSettings = !$('#settings').hidden;
  if (fromSettings) closeSheet($('#settings'), false);
  fillCommons();
  const md = u ? u.md : S.date.slice(5);
  ED = { u: u || null, rank: u ? u.rank : 'optional', collect: u ? (u.custom ? 'own' : String(u.collect || 0)) : '0', custom: u ? (u.custom || '') : '', oAuto: !u, opener, fromSettings };
  $('#saintEdTitle').textContent = u ? '編輯聖人' : '加入聖人';
  $('#sName').value = u ? u.name : '';
  $('#sMonth').value = String(+md.slice(0, 2)); $('#sDay').value = String(+md.slice(3)); fillDays(); $('#sDay').value = String(+md.slice(3));
  $('#sCommon').value = u ? u.common : 'saint';
  $('#sOName').value = u ? (u.oName || '') : '';
  $('#sDelete').hidden = !u; $('#sMsg').hidden = true;
  paintRank(); renderCollects(); zh($('#saintEd'));
  openSheet($('#saintEd'), $('#saintEdTitle'), opener);
}
function paintRank() { $('#sRank').querySelectorAll('[data-rank]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.rank === ED.rank)); }
function closeSaintEditor() {
  closeSheet($('#saintEd'), !ED.fromSettings);
  if (ED.fromSettings) { renderMySaints(); openSheet($('#settings'), $('#settingsTitle'), sheetOpener.get($('#settings')) || $('#menuBtn')); }
}
// the Commons come with the data: filled the first time the editor opens
function fillCommons() {
  if ($('#sCommon').options.length) return;
  const groups = [];
  for (const c of userCommons()) { let g = groups.find((x) => x.g === c.group); if (!g) groups.push(g = { g: c.group, items: [] }); g.items.push(c); }
  $('#sCommon').innerHTML = groups.map((g) => g.items.length > 1 || g.items[0].label !== g.g
    ? `<optgroup label="${esc(g.g)}通用">${g.items.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</optgroup>`
    : `<option value="${g.items[0].id}">${esc(g.items[0].label)}</option>`).join('');
  zh($('#sCommon'));
}
function initSaintEditor() {
  $('#sMonth').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}月</option>`).join('');
  $('#sMonth').onchange = fillDays;
  $('#sCommon').onchange = () => { if (ED.collect !== 'own') ED.collect = '0'; renderCollects(); };
  $('#sName').oninput = () => { if (ED.oAuto) { $('#sOName').value = oNameFrom($('#sName').value); renderCollects(); } };
  $('#sOName').oninput = () => { ED.oAuto = false; renderCollects(); };
  $('#sRank').querySelectorAll('[data-rank]').forEach((b) => b.onclick = () => { ED.rank = b.dataset.rank; paintRank(); });
  $('#sCancel').onclick = closeSaintEditor;
  $('#sDelete').onclick = () => {
    if (!ED.u) return;
    if (!$('#sDelete').dataset.confirm) { $('#sDelete').dataset.confirm = '1'; $('#sDelete').textContent = '確定刪除？'; setTimeout(() => { delete $('#sDelete').dataset.confirm; $('#sDelete').textContent = '刪除'; zh($('#sDelete')); }, 4000); zh($('#sDelete')); return; }
    delete $('#sDelete').dataset.confirm; $('#sDelete').textContent = '刪除';
    MY = MY.filter((x) => x.id !== ED.u.id); saveMySaints(); closeSaintEditor();
  };
  $('#sSave').onclick = () => {
    const name = $('#sName').value.trim();
    const msg = (t) => { $('#sMsg').textContent = t; $('#sMsg').hidden = false; zh($('#sMsg')); };
    if (!name) { msg('請輸入聖人的名稱。'); $('#sName').focus(); return; }
    if (ED.collect === 'own' && !(ED.custom || '').trim()) { msg('請輸入結束禱詞，或選擇通用部分的禱詞。'); $('#sCustom').focus(); return; }
    const md = `${String($('#sMonth').value).padStart(2, '0')}-${String($('#sDay').value).padStart(2, '0')}`;
    const u = { id: ED.u ? ED.u.id : 'u' + Date.now().toString(36), name, md, common: $('#sCommon').value, rank: ED.rank,
      oName: $('#sOName').value.trim() || oNameFrom(name), ...(ED.collect === 'own' ? { custom: ED.custom.trim() } : { collect: +ED.collect }) };
    MY = [...MY.filter((x) => x.id !== u.id), u];
    saveMySaints(); closeSaintEditor();
  };
  // 匯出／匯入: a small JSON file, to move the list to another phone or share it (e.g. the saints of a religious family)
  const note = (t) => { $('#msMsg').textContent = t; zh($('#msMsg')); };
  $('#msExport').onclick = async () => {
    if (!MY.length) { note('尚未加入聖人，沒有可匯出的內容。'); return; }
    const text = JSON.stringify({ app: 'SEMPER 常頌', kind: 'mysaints', v: 1, saints: MY }, null, 1);
    const fname = '常頌-我的聖人.json';
    try {
      const file = new File([text], fname, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '常頌：我的聖人' }); note('已匯出。'); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch {}
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = fname; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); } catch {}
    note(copied ? '已下載檔案，並已複製到剪貼簿：可在另一部裝置的「匯入」貼上。' : '已下載檔案。');
  };
  $('#msImport').onclick = () => { $('#msPaste').hidden = !$('#msPaste').hidden; if (!$('#msPaste').hidden) $('#msText').focus(); };
  $('#msFileBtn').onclick = () => $('#msFile').click();
  const importText = (text) => {
    let data; try { data = JSON.parse(text); } catch { note('未能讀取：內容不是由「匯出」產生的。'); return; }
    const list = Array.isArray(data) ? data : data && Array.isArray(data.saints) ? data.saints : null;
    if (!list) { note('未能讀取：內容不是由「匯出」產生的。'); return; }
    const ids = new Set(userCommons().map((c) => c.id));
    let n = 0, skip = 0;
    for (const x of list) {
      if (!x || typeof x.name !== 'string' || !/^\d\d-\d\d$/.test(x.md || '') || !RANKS[x.rank] || (!ids.has(x.common) && !x.custom)) { skip++; continue; }
      if (MY.some((u) => u.name === x.name && u.md === x.md)) { skip++; continue; }
      const u = { id: MY.some((v) => v.id === x.id) || !/^u[\w]+$/.test(x.id || '') ? 'u' + (Date.now() + n).toString(36) : x.id, name: x.name.slice(0, 80), md: x.md,
        common: ids.has(x.common) ? x.common : 'saint', rank: x.rank, oName: String(x.oName || oNameFrom(x.name)).slice(0, 40),
        ...(x.custom ? { custom: String(x.custom).slice(0, 2000) } : { collect: Math.max(0, +x.collect || 0) }) };
      MY.push(u); n++;
    }
    if (n) saveMySaints();
    note(`已匯入 ${n} 位聖人${skip ? `（${skip} 項已存在或未能讀取，已略過）` : ''}。`);
    if (n) { $('#msPaste').hidden = true; $('#msText').value = ''; }
  };
  $('#msPasteGo').onclick = () => importText($('#msText').value);
  $('#msFile').onchange = async (e) => { const f = e.target.files && e.target.files[0]; if (f) importText(await f.text()); e.target.value = ''; };
  $('#msAdd').onclick = (e) => openSaintEditor(null, e.currentTarget);
}

async function main() {
  parseHash();
  applyPrefs();
  // Retire only the old recording-download preferences; preserve reading preferences.
  try { for (const key of ['audioUsed', 'audioClean', 'audioRange']) localStorage.removeItem('rike.' + key); } catch {}
  $('#prev').onclick = () => shift(-1);
  $('#next').onclick = () => shift(1);
  $('#dateBtn').onclick = (e) => openMonth(e.currentTarget);
  initMonth();
  initSaintEditor();
  const closeSettings = () => closeSheet($('#settings'));
  $('#menuBtn').onclick = (e) => { renderMySaints(); openSheet($('#settings'), $('#settingsTitle'), e.currentTarget); };
  $('#closeSettings').onclick = closeSettings;
  document.querySelectorAll('[data-fs]').forEach((b) => b.onclick = () => { store.set('fs', Math.max(14, Math.min(30, store.get('fs', 19) + Number(b.dataset.fs)))); applyPrefs(); });
  document.querySelectorAll('button[data-theme]').forEach((b) => b.onclick = () => { store.set('theme', b.dataset.theme || null); applyPrefs(); });   // 自動 = follow the device
  document.querySelectorAll('[data-font]').forEach((b) => b.onclick = () => { store.set('font', b.dataset.font); applyPrefs(); });
  bindWelcomeSetting($('#showWelcome'), store);
  document.querySelectorAll('[data-amen]').forEach((b) => b.onclick = () => { store.set('amen', b.dataset.amen); applyPrefs(); render(); });
  document.addEventListener('keydown', (e) => { if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.target.closest('input, select, textarea, button, a, [contenteditable], [role=dialog]') || document.querySelector('.sheet:not([hidden])') || !$('#welcome').hidden || document.querySelector('.tts-sheet:not([hidden])')) return; if (e.key === 'ArrowLeft') shift(-1); if (e.key === 'ArrowRight') shift(1); });
  window.addEventListener('hashchange', () => { parseHash(); render(); });
  document.querySelectorAll('[data-script]').forEach((b) => b.onclick = async () => {
    const was = store.get('script', 't'); store.set('script', b.dataset.script); applyPrefs();
    if (was === b.dataset.script) return;
    if (b.dataset.script === 't') { try { if (!$('#welcome').hidden) sessionStorage.setItem('rike.reopenWelcome', 'true'); } catch {} location.reload(); return; }   // back to 繁體: reload the original text
    await loadT2S(); zh(); });
  initTTS(store);
  // Keep the existing skipWelcome preference; Settings can reopen the screen immediately.
  const W = $('#welcome');
  let welcomeTimer;
  const welcomeBackground = (open) => {
    document.body.classList.toggle('welcome-open', open);
    for (const el of document.body.children) if (el !== W && el.tagName !== 'SCRIPT') el.inert = open;
  };
  const openWelcome = () => {
    clearTimeout(welcomeTimer); document.documentElement.classList.remove('nowelcome');
    W.hidden = false; W.classList.remove('out');
    $('#welcomeSkip').checked = store.get('skipWelcome', false);
    welcomeBackground(true); $('#welcomeTitle').focus();
  };
  const closeWelcome = () => {
    store.set('welcomed', true); W.classList.add('out');
    welcomeTimer = setTimeout(() => { W.hidden = true; welcomeBackground(false); $('#dateBtn').focus(); }, 400);
  };
  let reopen = false;
  try { reopen = sessionStorage.getItem('rike.reopenWelcome') === 'true'; sessionStorage.removeItem('rike.reopenWelcome'); } catch {}
  if (store.get('skipWelcome', false) && !reopen) W.hidden = true;
  else openWelcome();
  $('#welcomeGo').onclick = () => { store.set('skipWelcome', $('#welcomeSkip').checked); applyPrefs(); closeWelcome(); };
  $('#openWelcome').onclick = () => { closeSettings(); stopTTS(); openWelcome(); };
  W.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const controls = [...W.querySelectorAll('button, input')].filter((el) => !el.disabled);
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === $('#welcomeTitle'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  await Promise.all([loadData(), loadT2S()]);
  setCalendar(store.get('cal', 'hk'));
  MY = loadMySaints(); setUserSaints(MY);
  dataReady = true;
  renderCalendars();
  zh();
  const { first, last } = nearestArchiveDate();
  render();
  $('#buildInfo').textContent = `${APP_VERSION} · 存檔：${first} — ${last}`;
  const status = (message) => { $('#offlineStatus').textContent = message; zh($('#offlineStatus')); };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    let applying = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (applying) location.reload();
      else status('經文已可離線使用；離線朗讀需在裝置下載所需語音。');
    });
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const offerUpdate = () => {
        if (!reg.waiting || !navigator.serviceWorker.controller) return;
        $('#update').hidden = false;
        $('#updateBtn').onclick = () => { applying = true; stopTTS(); reg.waiting?.postMessage('skip'); };
      };
      offerUpdate();
      const watch = (worker) => worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') { offerUpdate(); if (!navigator.serviceWorker.controller) status('經文已下載，正在準備離線使用…'); }
        if (worker.state === 'redundant') status('未能完成離線準備，請連線後重試。');
      });
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      status(navigator.serviceWorker.controller ? '經文已可離線使用；離線朗讀需在裝置下載所需語音。' : '正在準備離線經文，請保持連線…');
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    } catch { status('未能啟用離線儲存，目前可在線閱讀。'); }
  } else status('此瀏覽器未能啟用離線儲存，目前可在線閱讀。');
}
main().catch(() => {
  $('#office').setAttribute('aria-busy', 'false');
  $('#office').innerHTML = '<div class="load-error" role="alert"><p>未能載入日課。請檢查網絡後重試。</p><button class="pill" id="retryLoad">重新載入</button></div>';
  $('#retryLoad').onclick = () => location.reload();
  zh($('#office'));
});
