// 祝福禮典 — Book of Blessings viewer for OBLATIO (v8 interface, Fr. Gervais 8 Nov 2026).
// Data: data/blessings.json (build/blessings/build_blessings.py → polish → strip_rubrics → format_refs → merge_petitions): parts → chapters → blocks.
// v8: one rite per screen (a chapter is split at its 壹/甲/… headings); a chapter outline; a sticky bar with the rite's own steps,
// the current step highlighted and a 「你在這裡」 line; an options panel (minister 司鐸/執事 or 平信徒, the 「或念」 alternatives,
// other forms of the same rite) whose choices are saved per rite; and a presider mode (no rubrics but the actions, larger type,
// screen kept awake, tap or pedal to turn the page).
let B = null;
export async function loadBlessings(base = 'data/') {
  if (!B) B = await (await fetch(base + 'blessings.json')).json();
  return B;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SPK = /^(主禮|主祭|眾答|眾念|眾|全體|領|啟|應|讀經員|執事|輔祭|司鐸|父母|答)([（(][^）)]{0,12}[)）])?(答)?[：:]/;
const OR = /^或念\s*[：:]?$/;
const ACT = /灑|按手|伸開雙手|奉香|上香|添香|授與|授予|交給|披|點燃|點燭|十字|聖水|俯首|跪|起立|遊行|揭幕|戴上|佩戴|覆蓋/;

function inl(s) {
  return esc(s).replace(/（([^（）]{1,16})）/g, (m, x) => (/^(某|\d)/.test(x) ? m : `<span class="ri">（${x}）</span>`))
    .replace(/✠/g, '<span class="ri">✠</span>').replace(/【答】/g, '<span class="ri">【答】</span>');
}
function line(b, i) {
  const t = b.t;
  if (b.k === 'sub') return `<h3 class="m-h b-sub">${esc(t)}</h3>`;
  if (b.k === 'h') return `<h3 class="m-h" data-step="${esc(t)}" id="bs${i}">${esc(t)}</h3>`;
  if (b.k === 'rub') return `<p class="rub${ACT.test(t) ? ' act' : ''}">${inl(t)}</p>`;
  if (b.k === 'opt') {
    // Bible reference like 格前12:12-14（title）: the title in smaller type
    const r = t.match(/^(.{0,3}[^\s（(：:]{1,5}\d+:[\dabc,\-– :]*[\dabc])(（[^（）]*）?)?(.*)$/s);
    if (r && r[2]) return `<p class="m-p ropt">${esc(r[1])}<span class="ref-t">${esc(r[2])}</span>${esc(r[3])}</p>`;
    return `<p class="m-p ropt">${esc(t)}</p>`;
  }
  if (b.k === 'resp') return `<p class="m-p"><span class="spk">答：</span>${inl(t.replace(/^答[：:]\s*/, ''))}</p>`;
  const m = t.match(SPK);
  if (m) return `<p class="m-p"><span class="spk">${esc(t.slice(0, m[0].length - 1))}：</span>${inl(t.slice(m[0].length))}</p>`;
  if (b.pet) return `<p class="m-p b-pet">${inl(t)}</p>`;
  if (/^[\-－—一]\s*求/.test(t)) return `<p class="m-p b-pet">${inl(t.replace(/^[\-－—一]\s*/, ''))}</p>`;
  return `<p class="m-p">${inl(t)}</p>`;
}

// ---------- chapter titles ----------
// 「第十二章新學校或大學祝福儀式」 → { n: '十二', title: '新學校或大學祝福儀式' }
const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnum(s) { let n = 0, cur = 0; for (const ch of s) { if (ch === '十') { n += (cur || 1) * 10; cur = 0; } else cur = CN[ch] || 0; } return n + cur; }
function splitTitle(t) {
  const m = t.match(/^第([一二三四五六七八九十]+)章(㈠|㈡)?\s*(.*)$/);
  return m ? { n: cnum(m[1]) + (m[2] || ''), title: m[3] } : { n: '', title: t };
}
const partTitle = (t) => t.replace(/^(第[一二三四五]部分)\s*/, '$1　');
const chapters = () => B.parts.flatMap((p) => p.chapters.map((c) => ({ p, c })));
export function findChapter(id) {
  for (const p of B.parts) for (const c of p.chapters) if (c.id === id) return { p, c };
  return null;
}

// ---------- rites: a chapter split at its section headings ----------
// rank 0 = 1、2、…（formerly 壹、貳、…; stored as b.rank）  rank 1 = 1、2、…（formerly 甲、乙、…） / ㈠  rank 2 = anything else (祝福儀式, 簡式, 第一式 …)
const rankOf = (t) => (/^[壹貳參叁肆伍陸柒捌玖拾]、/.test(t) ? 0 : /^(?:[甲乙丙芮丁戊己庚]|\d{1,2})、|^[㈠㈡㈢㈣]/.test(t) ? 1 : 2);
function build(c) {
  if (c._r) return c._r;
  const units = []; let cur = { id: c.id + 'p', title: '', rank: 9, blocks: [], pre: true };
  for (const b of c.blocks) {
    if (b.k === 'section') { units.push(cur); cur = { id: b.id, title: b.t, rank: b.rank ?? rankOf(b.t), blocks: [] }; }
    else cur.blocks.push(b);
  }
  units.push(cur);
  const isRite = (u) => u.blocks.some((b) => b.k !== 'rub');
  const stack = [], outline = [], rites = []; let note = [];
  for (const u of units) {
    if (u.pre && !u.blocks.length) continue;
    if (u.pre) { u.depth = 0; u.title = units.length > 1 ? '祝福儀式' : splitTitle(c.title).title; }
    else {
      while (stack.length && stack[stack.length - 1].rank >= u.rank) stack.pop();
      u.parent = stack[stack.length - 1] || null; u.depth = stack.length; stack.push(u);
    }
    u.c = c;
    if (isRite(u)) {
      // the rubrics before the rite's first heading or text are guidance: folded into 「說明」
      let k = 0; while (k < u.blocks.length && u.blocks[k].k === 'rub' && !OR.test(u.blocks[k].t)) k++;
      u.rite = true; u.note = [...note, ...u.blocks.slice(0, k)]; u.blocks = u.blocks.slice(k); note = []; rites.push(u);
    }
    else note.push(...u.blocks);
    outline.push(u);
  }
  if (note.length && rites.length) rites[rites.length - 1].blocks.push(...note);
  rites.forEach((r, i) => { r.k = i; r.path = []; for (let p = r.parent; p; p = p.parent) r.path.unshift(p.title); });
  return (c._r = { outline, rites });
}
const allRites = () => chapters().flatMap(({ c }) => build(c).rites);
export function findRite(id) { return allRites().find((r) => r.id === id) || null; }
/** what to show for a chapter id: its outline, or its only rite */
export function chapterTarget(cid) { const r = findChapter(cid); if (!r) return null; const { rites } = build(r.c); return rites.length === 1 ? { rite: rites[0].id } : { chap: cid }; }

// ---------- 「或念」 alternatives ----------
const spkOf = (b) => (b && b.k === 'opt' ? 'opt' : ((b && b.t) || '').match(/^([^：:]{1,4})[：:]/)?.[1] || '');
function incipit(blocks) {
  const o = blocks.find((b) => b.k === 'opt'); if (o) return o.t.replace(/（.*$/, '').replace(/^恭讀\S*　/, '');
  const b = blocks.find((x) => x.k === 'text') || blocks[0];
  const t = b.t.replace(SPK, '').replace(/[（(][^）)]*[）)]/g, '').replace(/^[：:\s]+/, '');
  return t.length > 9 ? t.slice(0, 8) + '…' : t;
}
/** blocks → list of items: {b} for a single block, {g} for a group of alternatives */
function itemize(blocks) {
  const items = []; let seg = null;
  const close = () => { if (seg) { items.push(seg); seg = null; } };
  for (const b of blocks) {
    if ((b.k === 'rub' || b.k === 'text') && OR.test(b.t)) { close(); items.push({ or: true }); continue; }
    if (b.k === 'text' && /.或念[：:]$/.test(b.t)) { (seg ||= { seg: [] }).seg.push({ ...b, t: b.t.replace(/\s*或念[：:]$/, '') }); close(); items.push({ or: true }); continue; }
    if (b.k === 'text' || b.k === 'resp' || b.k === 'opt') { (seg ||= { seg: [] }).seg.push(b); continue; }
    close(); items.push({ b });
  }
  close();
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.seg) { if (it.or) out.push({ b: { k: 'rub', t: '或念：' } }); else out.push(it); continue; }
    const prevSub = out.length && out[out.length - 1].b && out[out.length - 1].b.k === 'sub' ? out[out.length - 1].b.t : null;
    const alts = [{ blocks: it.seg, label: prevSub }];
    let j = i + 1;
    for (;;) {
      let k = j, lab = null;
      while (items[k] && items[k].b && items[k].b.k === 'sub') { lab = items[k].b.t; k++; }
      if (items[k] && items[k].or && items[k + 1] && items[k + 1].seg) { alts.push({ blocks: items[k + 1].seg, label: lab }); j = k + 2; } else break;
    }
    if (alts.length === 1) { it.seg.forEach((b) => out.push({ b })); continue; }
    if (prevSub && alts[0].label) out.pop();
    // the part of the first run that comes before the alternative (e.g. 「因父…」 before two greetings) stays common
    const sp = spkOf(alts[1].blocks[0]); let common = [];
    if (sp) {
      const a0 = alts[0].blocks; let cut = -1;
      for (let x = a0.length - 1; x > 0; x--) if (spkOf(a0[x]) === sp) { cut = x; break; }
      if (cut > 0 && !a0.slice(0, cut).some((b) => b.pet) && !(sp === 'opt' && cut === 0)) { common = a0.slice(0, cut); alts[0].blocks = a0.slice(cut); }
    }
    common.forEach((b) => out.push({ b }));
    alts.forEach((a, n) => { a.label = a.label || incipit(a.blocks) || '第' + '一二三四五六七八九'[n] + '式'; });
    out.push({ g: alts });
    i = j - 1;
  }
  return out;
}

// ---------- per-rite settings ----------
let store = { get: (k, d) => d, set() {} };
export function setStore(s) { store = s; }
const who = () => store.get('bwho', 'ord');
const optsOf = (id) => store.get('bopt.' + id, null) || { alt: {} };

/** the rite as it will be said: minister filter, alternatives chosen */
function riteModel(r) {
  const w = who(), o = optsOf(r.id);
  const keep = (b) => w === 'all' || !b.who || b.who === w;
  const items = itemize(r.blocks.filter(keep));
  let step = '', gi = 0; const groups = [];
  for (const it of items) {
    if (it.b && it.b.k === 'h') step = it.b.t;
    if (it.g) { it.id = 'g' + gi++; it.step = step; it.sel = Math.min(o.alt[it.id] || 0, it.g.length - 1); groups.push(it); }
  }
  return { items, groups, all: !!o.all, hasWho: r.blocks.some((b) => b.who), o };
}

// ---------- index ----------
export function renderIndex(q = '') {
  const ql = q.trim();
  const out = [`<h1 class="mtitle">祝福禮典</h1>`,
    `<input class="b-search" type="search" placeholder="搜尋：家庭、病人、房屋、念珠…" value="${esc(q)}" data-b="search" aria-label="搜尋祝福">`];
  const last = findRite(store.get('brecent', '') || '');
  if (last && !ql) {
    const { n } = splitTitle(last.c.title);
    out.push(`<a href="#" class="b-last" data-rite="${last.id}"><small>上次打開</small><span>${n ? n + '　' : ''}${esc(last.title)}</span><span class="b-arr" aria-hidden="true">›</span></a>`);
  }
  let any = false;
  for (const p of B.parts) {
    if (!p.chapters.length) continue;
    const chs = p.chapters.map((c) => {
      const { rites } = build(c);
      const hit = ql && !c.title.includes(ql) ? rites.filter((r) => r.title.includes(ql) || r.path.some((x) => x.includes(ql))) : [];
      return { c, rites, hit, show: !ql || c.title.includes(ql) || hit.length };
    }).filter((x) => x.show);
    if (!chs.length) continue;
    any = true;
    out.push(`<h2 class="b-group">${esc(partTitle(p.title))}</h2><div class="b-grid">`);
    for (const { c, rites, hit } of chs) {
      const { n, title } = splitTitle(c.title);
      out.push(`<div class="b-card"><a href="#" class="b-main" data-chap="${c.id}"><span class="b-num">${n}</span><span class="b-tt">${esc(title)}</span>` +
        `${rites.length > 1 ? `<span class="b-cnt">${rites.length} 式</span>` : ''}<span class="b-arr" aria-hidden="true">›</span></a>` +
        (hit.length ? `<div class="b-secs">${hit.map((r) => `<a href="#" data-rite="${r.id}">${esc(r.title)}</a>`).join('')}</div>` : '') + '</div>');
    }
    out.push('</div>');
  }
  if (!any) out.push('<p class="empty">找不到相符的祝福。</p>');
  out.push(`<div class="notes b-src"><p>中國主教團禮儀委員會編譯《祝福禮典》（1984年拉丁文版）。只保留書中印出全文的讀經；其他僅列出章節的讀經選項已刪去。用語已按香港教區習慣（阿們等）。</p></div>`);
  return out.join('');
}

// ---------- chapter outline ----------
function outlineHtml(c, curId) {
  const { outline } = build(c);
  return `<ol class="b-tree">${outline.map((u) => u.rite
    ? `<li class="d${u.depth}${u.id === curId ? ' cur' : ''}"><a href="#" data-rite="${u.id}"><span>${esc(u.title)}</span><span class="b-arr" aria-hidden="true">›</span></a></li>`
    : `<li class="d${u.depth} grp">${esc(u.title)}</li>`).join('')}</ol>`;
}
export function renderChapter(id) {
  const r = findChapter(id); if (!r) return '<p class="empty">找不到此祝福儀式。</p>';
  const { p, c } = r; const { n, title } = splitTitle(c.title);
  const all = chapters(), k = all.findIndex((x) => x.c.id === id);
  const nav = (x, lab) => (x ? `<a href="#" data-chap="${x.c.id}">${lab}${esc(splitTitle(x.c.title).title)}</a>` : '<span></span>');
  return `<p class="b-crumb"><a href="#" data-b="index">‹ 祝福禮典</a>　${esc(partTitle(p.title))}</p>` +
    `<h1 class="mtitle">${n ? `<span class="b-num">${n}</span>` : ''}${esc(title)}</h1>` +
    `<p class="b-hint">選擇要舉行的儀式：</p>${outlineHtml(c, '')}` +
    `<div class="b-prevnext">${nav(all[k - 1], '‹ ')}${nav(all[k + 1], '› ')}</div>`;
}

// ---------- one rite ----------
export function renderRite(id) {
  const r = findRite(id); if (!r) return '<p class="empty">找不到此祝福儀式。</p>';
  const c = r.c, { n, title: ctitle } = splitTitle(c.title);
  const M = riteModel(r);
  const { rites } = build(c);
  const html = [];
  if (r.note && r.note.length) html.push(`<details class="b-intro"><summary>說明</summary>${r.note.map((b) => `<p>${inl(b.t)}</p>`).join('')}</details>`);
  let i = 0;
  for (const it of M.items) {
    if (it.b) { html.push(line(it.b, i++)); continue; }
    const chips = `<div class="b-alt" role="radiogroup" aria-label="選擇經文">${it.g.map((a, k) =>
      `<button role="radio" aria-checked="${k === it.sel}" data-alt="${it.id}:${k}">${esc(a.label)}</button>`).join('')}</div>`;
    if (M.all) it.g.forEach((a, k) => { html.push(`${k ? '<p class="rub">或念：</p>' : ''}<p class="b-altlab">${esc(a.label)}</p>`); a.blocks.forEach((b) => html.push(line(b, i++))); });
    else { html.push(chips); it.g[it.sel].blocks.forEach((b) => html.push(line(b, i++))); }
  }
  const steps = [...new Set(M.items.filter((x) => x.b && x.b.k === 'h').map((x) => x.b.t))];
  const flat = allRites(), k = flat.indexOf(r);
  const nav = (x, lab) => (x ? `<a href="#" data-rite="${x.id}">${lab}${esc(x.title === '祝福儀式' || x.rank === 2 && x.title.length < 5 ? splitTitle(x.c.title).title + '・' + x.title : x.title)}</a>` : '<span></span>');
  const sibs = rites.filter((x) => x !== r && x.parent === r.parent && x.path.join() === r.path.join());
  const minister = M.hasWho ? `<div class="row"><span>主禮</span><span class="pills">${[['ord', '司鐸／執事'], ['lay', '平信徒'], ['all', '兩者都顯示']].map(([v, l]) =>
    `<button class="pill" data-who="${v}" aria-pressed="${who() === v}">${l}</button>`).join('')}</span></div>` : '';
  const grows = M.groups.map((g) => `<div class="row"><span>${esc(g.step || '經文')}</span><span class="pills">${g.g.map((a, k) =>
    `<button class="pill" data-alt="${g.id}:${k}" aria-pressed="${k === g.sel}">${esc(a.label)}</button>`).join('')}</span></div>`).join('');
  const sum = [M.hasWho ? (who() === 'lay' ? '平信徒主禮' : who() === 'all' ? '兩種主禮' : '司鐸／執事主禮') : '', M.groups.length ? `${M.groups.length} 處可選經文` : ''].filter(Boolean).join('・');
  const panel = `<details class="mpanel b-opts"><summary>選項 <small>${esc(sum || '列印・其他形式')}</small></summary>${minister}${grows}` +
    (M.groups.length ? `<label class="row"><input type="checkbox" data-b="all"${M.all ? ' checked' : ''}> 顯示所有可選經文（不作選擇）</label>` : '') +
    (sibs.length ? `<div class="row"><span>其他形式</span><span class="pills">${sibs.map((x) => `<a href="#" class="pill" data-rite="${x.id}">${esc(x.title)}</a>`).join('')}</span></div>` : '') +
    `<div class="mbtns">${M.groups.length ? '<button class="pill" data-b="reset">恢復預設</button>' : ''}<button class="pill" data-b="print">列印</button></div></details>`;
  const crumbs = [ctitle, ...r.path].filter((x, i, a) => x && x !== a[i - 1]);
  return `<p class="b-crumb"><a href="#" data-b="index">‹ 祝福禮典</a>　<a href="#" data-chap="${c.id}">${n ? n + '　' : ''}${esc(crumbs.join(' › '))}</a></p>` +
    `<h1 class="mtitle">${esc(r.title)}</h1>` + panel +
    `<div class="b-sticky"><div class="b-where"><button class="b-toc" data-b="toc" aria-label="目錄">☰</button><span class="b-here">${esc(r.title)}</span>` +
    `<button class="b-pres" data-b="presider" aria-pressed="false">主禮模式</button></div>` +
    (steps.length > 1 ? `<nav class="b-steps" aria-label="禮儀步驟">${steps.map((s) => `<button data-step-go="${esc(s)}">${esc(s)}</button>`).join('')}</nav>` : '') + `</div>` +
    `<div class="mass b-rite" data-rid="${r.id}">${html.join('')}</div>` +
    `<div class="b-prevnext">${nav(flat[k - 1], '‹ ')}${nav(flat[k + 1], '› ')}</div>` +
    `<div class="sheet b-drawer" hidden><div class="sheet-in"><h2>${n ? n + '　' : ''}${esc(ctitle)}</h2>${outlineHtml(c, r.id)}<button class="pill wide" data-b="tocclose">關閉</button></div></div>`;
}

// ---------- behaviour ----------
const topH = () => (document.body.classList.contains('presider') ? 0 : (document.querySelector('.top')?.offsetHeight || 0));
/** step bar: go to the next heading of that step below the current reading position (else the first one) */
export function goStep(root, label) {
  const hs = [...root.querySelectorAll('[data-step]')].filter((h) => h.dataset.step === label);
  if (!hs.length) return;
  const bar = root.querySelector('.b-sticky'); const top = topH() + (bar?.offsetHeight || 0) + 4;
  const next = hs.find((h) => h.getBoundingClientRect().top > top + 40) || hs[0];
  window.scrollTo({ top: window.scrollY + next.getBoundingClientRect().top - top, behavior: 'smooth' });
}
let spy = null, lock = null;
function scrollSpy(root) {
  if (spy) window.removeEventListener('scroll', spy);
  const hs = [...root.querySelectorAll('.b-rite [data-step]')], btns = [...root.querySelectorAll('[data-step-go]')];
  const here = root.querySelector('.b-here'), title = root.querySelector('h1.mtitle'), bar = root.querySelector('.b-sticky');
  if (!bar) { spy = null; return; }
  const name = here ? here.textContent : '';
  let last = null;
  spy = () => {
    if (!bar.isConnected) { window.removeEventListener('scroll', spy); return; }
    const lim = topH() + bar.offsetHeight + 60;
    let cur = null; for (const h of hs) { if (h.getBoundingClientRect().top <= lim) cur = h; else break; }
    const st = cur ? cur.dataset.step : '';
    const off = title && title.getBoundingClientRect().bottom < topH();
    bar.classList.toggle('stuck', !!off);
    if (st === last) return; last = st;
    btns.forEach((b) => { const on = b.dataset.stepGo === st; b.setAttribute('aria-current', on ? 'step' : 'false'); if (on) b.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    if (here) here.innerHTML = esc(name) + (st ? `<b>・${esc(st)}</b>` : '');
  };
  window.addEventListener('scroll', spy, { passive: true }); spy();
}
async function wake(on) {
  try { if (on && navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); else if (lock) { await lock.release(); lock = null; } } catch { lock = null; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && document.body.classList.contains('presider')) wake(true); });
function page(dir) { window.scrollBy({ top: dir * (window.innerHeight - topH() - 110), behavior: 'smooth' }); }
function presider(on) {
  document.body.classList.toggle('presider', on);
  document.querySelectorAll('[data-b="presider"]').forEach((b) => { b.setAttribute('aria-pressed', on); b.textContent = on ? '✕ 結束主禮模式' : '主禮模式'; });
  wake(on);
}
document.addEventListener('keydown', (e) => {
  if (!document.body.classList.contains('presider') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); page(1); }
  if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); page(-1); }
  if (e.key === 'Escape') presider(false);
});

/** wire a rendered blessings view. ctx: { open(view), rerender() } */
export function bindBlessings(el, ctx) {
  const rite = el.querySelector('.b-rite')?.dataset.rid || '';
  el.querySelectorAll('[data-chap]').forEach((a) => a.onclick = (e) => { e.preventDefault(); ctx.open(chapterTarget(a.dataset.chap)); });
  el.querySelectorAll('[data-rite]').forEach((a) => a.onclick = (e) => { e.preventDefault(); ctx.open({ rite: a.dataset.rite }); });
  el.querySelectorAll('[data-step-go]').forEach((x) => x.onclick = () => goStep(el, x.dataset.stepGo));
  el.querySelectorAll('[data-b="index"]').forEach((x) => x.onclick = (e) => { e.preventDefault(); ctx.open(null); });
  el.querySelectorAll('[data-b="print"]').forEach((x) => x.onclick = () => window.print());
  const keep = () => { const y = window.scrollY; ctx.rerender(); window.scrollTo(0, y); };
  el.querySelectorAll('[data-alt]').forEach((x) => x.onclick = () => {
    const [g, k] = x.dataset.alt.split(':'); const o = optsOf(rite); o.alt = { ...o.alt, [g]: +k }; store.set('bopt.' + rite, o);
    const pos = x.getBoundingClientRect().top; ctx.rerender();
    const y = document.querySelector(`#office .b-rite [data-alt="${g}:${k}"]`); if (y && x.closest('.b-rite')) window.scrollBy(0, y.getBoundingClientRect().top - pos);
  });
  el.querySelectorAll('[data-who]').forEach((x) => x.onclick = () => { store.set('bwho', x.dataset.who); keep(); });
  const all = el.querySelector('[data-b="all"]'); if (all) all.onchange = () => { const o = optsOf(rite); o.all = all.checked; store.set('bopt.' + rite, o); keep(); };
  const rs = el.querySelector('[data-b="reset"]'); if (rs) rs.onclick = () => { store.set('bopt.' + rite, null); keep(); };
  const pan = el.querySelector('details.b-opts');
  if (pan) { pan.open = !!store.get('bOptsOpen', false); pan.addEventListener('toggle', () => store.set('bOptsOpen', pan.open)); }
  const dr = el.querySelector('.b-drawer');
  if (dr) {
    el.querySelectorAll('[data-b="toc"]').forEach((x) => x.onclick = () => { dr.hidden = false; dr.querySelector('.cur')?.scrollIntoView({ block: 'center' }); });
    el.querySelectorAll('[data-b="tocclose"]').forEach((x) => x.onclick = () => { dr.hidden = true; });
    dr.onclick = (e) => { if (e.target === dr) dr.hidden = true; };
  }
  el.querySelectorAll('[data-b="presider"]').forEach((x) => x.onclick = () => presider(!document.body.classList.contains('presider')));
  const body = el.querySelector('.b-rite');
  if (body) body.onclick = (e) => {
    if (!document.body.classList.contains('presider') || e.target.closest('button, a, summary, input')) return;
    const x = e.clientX / window.innerWidth; if (x > 0.6) page(1); else if (x < 0.4) page(-1);
  };
  if (!body && document.body.classList.contains('presider')) presider(false);
  else presider(document.body.classList.contains('presider'));
  scrollSpy(el);
}
