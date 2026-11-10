// 聖事禮典 — sacramental rites for OBLATIO (data/rites.json: build/rites/build_marriage.py + build_more.py).
// v1 (9 Nov 2026): 婚姻聖事; v2: 殯葬禮, 病人傅油聖事, 修和聖事 — Hong Kong Liturgy Commission texts.
// One rite per screen: an options panel (rite, names, readings, prayers), the sticky step bar and presider mode of 祝福禮典;
// in the Masses (婚姻聖事感恩祭, 殯葬彌撒) the common parts come from the Missal's 彌撒常規 (missal.json ordo).
import { loadMissal } from './missal.js';
import { bindBlessings } from './blessings.js';

let R = null, M = null;
let store = { get: (k, d) => d, set() {} };
export function setStore(s) { store = s; }
export async function loadRites(base = 'data/') {
  if (!R) R = await (await fetch(base + 'rites.json')).json();
  if (!M) M = await loadMissal(base);
  return R;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SACRAMENTS = [{ name: '聖洗聖事' }, { name: '堅振聖事' }, { id: 'reconciliation' }, { id: 'anointing' }, { id: 'marriage' }, { id: 'funeral' }];

// ---------- names ----------
let SAC = 'marriage';
const names = () => store.get('rnames.' + SAC, null) || (SAC === 'marriage' ? store.get('rnames', null) : null) || {};
const nm = (k) => (names()[k] || '').trim();
const PH = { G: '新郎的名字', B: '新娘的名字', CH: '聖堂名稱' };
const SEXW = { BS: ['弟兄', '姊妹', '弟兄／姊妹'], MS: ['先生', '女士', '先生／女士'], H: ['他', '她', '他'], RS: ['修士', '修女', '修士／修女'], FM: ['父親', '母親', '父親／母親'],
  SON: ['兒子', '女兒', '兒子（女兒）'], BS2: ['兄弟', '姐妹', '兄弟／姐妹'] };
function sexw(k) { const s = nm('sex'); return SEXW[k][s === 'm' ? 0 : s === 'f' ? 1 : 2]; }
function token(k) {
  if (k === 'GB') { const g = nm('g'), b = nm('b'); return g || b ? `<span class="r-nm">${esc(g || '（新郎）')}、${esc(b || '（新娘）')}</span>` : '<span class="r-ph">（新郎、新娘的名字）</span>'; }
  if (k === 'N') { const v = nm('n'); return v ? `<span class="r-nm">${esc(v)}</span>` : '<span class="r-ph">（某某）</span>'; }
  if (SEXW[k]) return esc(sexw(k));
  const v = nm(k.toLowerCase()); return v ? `<span class="r-nm">${esc(v)}</span>` : `<span class="r-ph">（${PH[k]}）</span>`;
}
function inl(s) {
  return esc(s)
    .replace(/（([^（）]{1,24})）/g, (m, x) => `<span class="ri">（${x}）</span>`)
    .replace(/✠/g, '<span class="ri">✠</span>').replace(/【答句?】/g, '<span class="ri">【答】</span>')
    .replace(/\{(GB|G|B|CH|N|BS|MS|H|RS|FM|SON)\}/g, (m, k) => token(k));
}
// the Missal's own placeholders in the funeral insert of the Eucharistic Prayers
function deadFix(x) {
  if (SAC !== 'funeral') return x;
  return x.replace(/兄弟／姐妹（某）/g, '{BS2}{N}').replace(/他（她）/g, '{H}').replace(/\{BS2\}/g, sexw('BS2'));
}
const ACT = /按手|伸手|伸開雙手|戒指套|握著手|跪|起立|簽署|鼓掌|十字|灑聖水|奉香|獻花|鞠躬|覆手|傅油|撒土/;
const P = (sp, t) => `<p class="m-p">${sp ? `<span class="spk">${esc(sp)}：</span>` : ''}${inl(t)}</p>`;

// ---------- blocks ----------
let MASS = false;
const spk = (sp) => (MASS && sp === '主禮' ? '主祭' : sp);
function line(b, D) {
  if (b.k === 'sec') return `<h2 class="m-sec" data-step="${esc(b.t)}">${esc(b.t)}</h2>`;
  if (b.k === 'h') return `<h3 class="m-h">${esc(b.t)}</h3>`;
  if (b.k === 'rub') return `<p class="rub${ACT.test(b.t) ? ' act' : ''}">${inl(b.t)}</p>`;
  if (b.k === 'note') return `<details class="b-intro"><summary>說明</summary>${b.p.map((x) => `<p>${esc(x)}</p>`).join('')}</details>`;
  if (b.k === 'read') return readInline(D, b);
  return P(spk(b.sp || ''), b.t);
}
const lines = (bs, D) => bs.map((b) => line(b, D)).join('');
const OSPK = /(主祭|信友|全體|執事或主祭|執事|主教)\s*[：:]/g;
function ob(bs) {
  return bs.map((b) => {
    const x = deadFix(b.x);
    if (b.t === 'h') return `<h3 class="m-h">${esc(x)}</h3>`;
    if (b.t === 'r') return `<p class="rub">${inl(x)}</p>`;
    if (b.t === 'c') return `<p class="m-cons">${x.split('\n').map(inl).join('<br>')}</p>`;
    const parts = []; let cur = b.sp || '', last = 0;
    x.replace(OSPK, (m, w, off) => { if (off > 0) parts.push([cur, x.slice(last, off)]); cur = w; last = off + m.length; return m; });
    parts.push([cur, x.slice(last)]);
    return parts.filter(([, t]) => t.trim()).map(([w, t]) => P(w, t.trim())).join('');
  }).join('');
}

// ---------- readings ----------
function psalm(r) {
  return P('答', r.resp) + r.st.map((x) => `<p class="m-p"><span class="spk">領：</span>${inl(x)} <span class="ri">【答】</span></p>`).join('') +
    (r.dox ? P('領', '願光榮歸於父、及子、及聖神。') + P('眾', '起初如何，今日亦然，直到永遠。阿們。') : '');
}
/** a reading printed in a service: 恭讀… + text + ——上主的話 + the people's answer (as the book prints it) */
function readInline(D, b) {
  const r = D.read[b.id]; if (!r) return '';
  if (r.kind === 'ps') return `<p class="rub">${esc(r.ref)}</p>` + psalm(r);
  return `<p class="rub">${esc(r.book)}　${esc(r.ref.replace(/^[^\d]+/, ''))}</p>` + r.p.map((x, i) => P('', x + (i === r.p.length - 1 ? '　——上主的話。' : ''))).join('') +
    (b.resp ? P('眾', b.resp) : '');
}
function reading(D, id, label, sp) {
  const r = D.read[id]; if (!r) return '';
  if (r.kind === 'ps') return `<h3 class="m-h">答唱詠 <span class="tag">${esc(r.ref)}</span></h3>` + psalm(r);
  let h = `<h3 class="m-h">${esc(label)}${r.theme ? `<span class="r-theme">（${esc(r.theme)}）</span>` : ''} <span class="tag">${esc(r.ref)}</span></h3>`;
  if (r.kind === 'gos') h += P(sp, '願主與你們同在。') + P('全體', '也與你的心靈同在。') + P(sp, r.book + '。') + P('全體', '主，願祢受讚美。');
  else h += `<p class="rub">${esc(r.book)}</p>`;
  h += r.p.map((x, i) => P('', x + (i === r.p.length - 1 ? '　——上主的話。' : ''))).join('');
  return h + P('全體', r.kind === 'gos' ? '基督，我們讚美祢。' : '感謝天主。');
}
function readings(D, st) {
  const sp = MASS ? '執事或主祭' : '主禮', a = D.acc[st.acc] || Object.values(D.acc)[0];
  return reading(D, st.ot, '讀經一', sp) + reading(D, st.ps, '', sp) + (st.nt ? reading(D, st.nt, '讀經二', sp) : '') +
    `<h3 class="m-h">福音前歡呼 <span class="tag">${esc(a.ref)}</span></h3><p class="rub act">（請起立）</p>` +
    P('領', '亞肋路亞。') + P('眾', '亞肋路亞。') + P('領', a.t) + P('眾', '亞肋路亞。') + reading(D, st.gos, '福音', sp);
}

// ---------- Eucharistic Prayer: the wedding or the funeral Mass ----------
const EPN = { I: '感恩經第一式', II: '感恩經第二式', III: '感恩經第三式' };
function deadPrefaces() { return M.ordo.prefaces.map((p, i) => [p, i]).filter(([p]) => /^追思亡者/.test(p.title)); }
function prefaceOf(D, st) {
  if (D.ep === 'funeral') {
    const all = deadPrefaces(), k = Math.min(+String(st.pf || 'd0').slice(1) || 0, all.length - 1), p = all[k][0];
    return `<h3 class="m-h">${esc(p.title.replace(/（適用.*?）/, ''))}</h3>` + ob(p.body);
  }
  const pf = D.pref[st.pf] || Object.values(D.pref)[0];
  return `<h3 class="m-h">${esc(pf.label)}</h3>` + pf.p.map((x, i) => P(i ? '' : '主祭', x)).join('');
}
function eucharisticPrayer(D, st) {
  const E = M.ordo.eucharistic_prayers, dead = D.ep === 'funeral';
  let h = `<h2 class="m-sec" data-step="感恩經">${EPN[st.ep] || EPN.II}</h2>`;
  h += ob(E.II.slice(1, 5)) + prefaceOf(D, st) + ob(E.II.slice(6, 8));
  if (st.ep === 'I') {
    const SEAS = /^(耶誕節|主顯節|復活夜|耶穌升天節|五旬節主日)/; let skip = false; const out = [];
    for (const b of E.I.slice(1)) {
      if (b.t === 'h') { if (SEAS.test(b.x)) skip = true; else if (!/^(主祭一人祈求|可由)/.test(b.x)) skip = false; }
      if (skip) continue;
      if (!dead && /^（伸手）上主，我們懇求祢，惠然收納祢的僕人/.test(b.x)) { out.push({ t: 'r', x: '婚禮感恩祭專用：' }, { t: 's', sp: '主祭', x: '（伸手）' + D.ep1 + '（合掌）（因我們的主基督。阿們。）' }); continue; }
      out.push(b);
    }
    h += ob(out);
  } else if (st.ep === 'III') {
    const body = E.III.slice(1); const k = body.findIndex((b) => /求祢恩准我們已亡的弟兄姐妹，和所有在祢寵愛中/.test(b.x) && /^（伸手）求祢恩准/.test(b.x));
    if (dead) h += ob(body.filter((b, i) => !(i === k || i === k + 1) && !/追思彌撒內可用/.test(b.x)));
    else h += ob(body.filter((b) => !/追思彌撒內可用|從人世將他/.test(b.x)));
  } else {
    const body = E.II.slice(8).filter((b) => dead || !/從人世將他/.test(b.x));
    const k = body.findIndex((b) => /全體聖職人員/.test(b.x));
    h += dead ? ob(body) : ob(body.slice(0, k + 1)) + `<p class="rub">婚禮感恩祭專用：</p>` + P('', D.ep2) + ob(body.slice(k + 1));
  }
  return h;
}

// ---------- options ----------
const ALTLABEL = { collect: '集禱經', offer: '獻禮經', post: '領主後經', end: '結束', vows: '許諾', ring: '祝福戒指', nuptial: '隆重祝福', final: '禮成祝福' };
function defaults(r) {
  const o = r.opts || {}, d = {};
  for (const [k, v] of Object.entries(o)) if (Array.isArray(v)) d[k] = v[0];
  if (o.readings) Object.assign(d, o.readings);
  if (o.one) d.one = o.one;
  if (r.mass) Object.assign(d, { ep: o.ep || 'II', pf: o.pf, gloria: o.gloria });
  return d;
}
const stateOf = (r) => ({ ...defaults(r), ...(store.get('ropt.' + r.id, null) || {}) });

function slot(D, s, st) {
  const O = M.ordo;
  switch (s) {
    case 'ordo:sign': return ob(O.sign);
    case 'ordo:greet': return ob(O.greeting[0]);
    case 'ordo:gloria': return +st.gloria ? ob(O.gloria.filter((b) => !/^按禮規/.test(b.x))) : '<p class="rub">（本次不念光榮頌）</p>';
    case 'ordo:offertory': return ob(O.offertory.map((b) => (D.offInvite && /收納我和你們共同奉獻的聖祭/.test(b.x) ? { ...b, x: D.offInvite + '（合掌）' } : b)));
    case 'ordo:communion': return ob(O.communion_rite);
    case 'ordo:pater': { const b = O.communion_rite.find((x) => /^我們的天父/.test(x.x)); return P('全體', b.x + '阿們。'); }
    case 'readings': return readings(D, st);
    case 'one': { const r = D.read[st.one]; return reading(D, st.one, r && r.kind === 'gos' ? '福音' : '讀經', '主禮'); }
    case 'ep': return eucharisticPrayer(D, st);
    default: { const a = D.alt && D.alt[s]; if (!a) return ''; return lines((a[st[s]] || Object.values(a)[0]).b, D); }
  }
}

function optLabel(D, id) { const r = D.read[id]; return r ? `${r.ref}${r.theme ? '　' + r.theme : r.book ? '　' + r.book.replace(/^恭讀/, '') : ''}` : '不讀'; }
function riteSelect(D, r) {
  const opt = (x) => `<option value="${x.id}"${x.id === r.id ? ' selected' : ''}>${esc(x.title)}</option>`;
  const groups = []; for (const x of D.rites) { const g = x.group || ''; let G = groups.find((y) => y.g === g); if (!G) groups.push(G = { g, it: [] }); G.it.push(x); }
  const body = groups.length > 1 ? groups.map((G) => `<optgroup label="${esc(G.g)}">${G.it.map(opt).join('')}</optgroup>`).join('') : D.rites.map(opt).join('');
  return `<label class="mopt wide"><span>儀式</span><select data-ro="rite">${body}</select></label>`;
}
function panel(D, r, st) {
  const sel = (key, label, opts, val) => `<label class="mopt"><span>${esc(label)}</span><select data-ro="${key}">${opts.map(([v, t]) =>
    `<option value="${esc(String(v))}"${String(v) === String(val) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const o = r.opts || {}, out = [];
  const altSel = (k) => { if (Array.isArray(o[k]) && o[k].length > 1 && D.alt[k]) out.push(sel(k, ALTLABEL[k] || k, o[k].map((i) => [i, D.alt[k][i].label]), st[k])); };
  altSel('collect');
  if (o.readings) {
    out.push(sel('ot', '讀經一', D.rd.ot.map((i) => [i, optLabel(D, i)]), st.ot), sel('ps', '答唱詠', D.rd.ps.map((i) => [i, D.read[i].ref]), st.ps),
      sel('nt', '讀經二', D.rd.nt.map((i) => [i, optLabel(D, i)]), st.nt), sel('acc', '福音前歡呼', D.rd.acc.map((i) => [i, D.acc[i].ref + '　' + D.acc[i].t.slice(0, 10) + '…']), st.acc),
      sel('gos', '福音', D.rd.gos.map((i) => [i, optLabel(D, i)]), st.gos));
  }
  if (o.one) out.push(sel('one', '讀經', D.one.map((i) => [i, optLabel(D, i)]), st.one));
  altSel('vows'); altSel('ring');
  if (r.mass) {
    if (st.gloria !== undefined && D.ep !== 'funeral') out.push(sel('gloria', '光榮頌', [[1, '念'], [0, '不念']], st.gloria));
    out.push(sel('ep', '感恩經', Object.entries(EPN), st.ep));
    out.push(D.ep === 'funeral' ? sel('pf', '頌謝詞', deadPrefaces().map(([p], i) => ['d' + i, p.title.replace(/（適用.*?）/, '')]), st.pf)
      : sel('pf', '頌謝詞', Object.entries(D.pref).map(([k, v]) => [k, v.label]), st.pf));
  }
  altSel('offer'); altSel('post'); altSel('nuptial'); altSel('final'); altSel('end');
  const n = names(), f = D.fields || ['g', 'b'];
  const inp = (k, label, ph) => `<label class="r-in"><span>${label}</span><input data-rn="${k}" value="${esc(n[k] || '')}" placeholder="${ph}" autocomplete="off"></label>`;
  const sexSel = (label) => `<label class="r-in"><span>${label}</span><select data-rn="sex"><option value="">弟兄／姊妹</option><option value="m"${n.sex === 'm' ? ' selected' : ''}>男（弟兄、他）</option><option value="f"${n.sex === 'f' ? ' selected' : ''}>女（姊妹、她）</option></select></label>`;
  let fields = '';
  if (f.includes('g')) fields = inp('g', '新郎', '名字') + inp('b', '新娘', '名字') + (r.blocks.some((b) => (b.t || '').includes('{CH}')) ? inp('ch', '聖堂', '聖堂名稱') : '');
  if (f.includes('n')) fields = inp('n', SAC === 'funeral' ? '亡者' : '病人', '姓名') + sexSel('性別');
  const who = f.includes('g') ? (nm('g') && nm('b') ? `${nm('g')}、${nm('b')}` : '') : nm('n');
  const sum = [who, r.mass ? EPN[st.ep] : ''].filter(Boolean).join('・');
  return `<details class="mpanel r-opts"${store.get('rOptsClosed', false) ? '' : ' open'}><summary>選項 <small>${esc(sum)}</small></summary>
  ${D.rites.length > 1 ? riteSelect(D, r) : ''}
  ${fields ? `<div class="r-names">${fields}</div>` : ''}
  ${out.length ? `<div class="mopts">${out.join('')}</div>` : ''}
  <div class="mbtns">${out.length ? '<button class="pill" data-r="reset">恢復預設</button>' : ''}${fields ? '<button class="pill" data-r="clear">清除名字</button>' : ''}<button class="pill" data-b="print">列印</button></div></details>`;
}

// ---------- views ----------
function renderIndex() {
  return `<h1 class="mtitle">聖事禮典</h1><div class="b-grid">${SACRAMENTS.map((s) => s.id && R[s.id]
    ? `<div class="b-card"><a href="#" class="b-main" data-sac="${s.id}"><span class="b-tt">${esc(R[s.id].title)}</span>${R[s.id].rites.length > 1 ? `<span class="b-cnt">${R[s.id].rites.length} 式</span>` : ''}<span class="b-arr" aria-hidden="true">›</span></a></div>`
    : `<div class="b-card r-soon"><div class="b-main"><span class="b-tt">${esc(s.name || s.id)}</span><small>籌備中</small></div></div>`).join('')}</div>
  <div class="notes b-src"><p>經文取自香港教區禮儀委員會。在彌撒中舉行的禮儀，常用部分取自香港《彌撒經書》彌撒常規。</p></div>`;
}
function currentRite(D) { return D.rites.find((x) => x.id === store.get('rrite.' + SAC, SAC === 'marriage' ? store.get('rrite', '') : '')) || D.rites[0]; }
function renderSacrament() {
  const D = R[SAC], r = currentRite(D);
  const st = stateOf(r); MASS = !!r.mass;
  let html = r.blocks.map((b) => (b.k === 'slot' ? slot(D, b.s, st) : line(b, D))).join('');
  const hasSec = r.blocks.some((b) => b.k === 'sec');
  const steps = hasSec ? r.blocks.filter((b) => b.k === 'sec').map((b) => b.t) : [];
  if (hasSec && /data-step="辭靈禮"/.test(html) && !steps.includes('辭靈禮')) steps.push('辭靈禮');
  if (!hasSec) html = html.replace(/<h3 class="m-h">([^<]*)<\/h3>/g, (m, t) => (steps.includes(t) ? m : (steps.push(t), `<h3 class="m-h" data-step="${t}">${t}</h3>`)));
  if (r.mass && steps.includes('領主禮')) steps.splice(steps.indexOf('領主禮'), 0, '感恩經');
  return `<p class="b-crumb"><a href="#" data-b="index">‹ 聖事禮典</a>　${esc(D.title)}</p>` +
    `<h1 class="mtitle">${esc(r.title)}</h1>${r.sub ? `<p class="r-sub">${esc(r.sub)}</p>` : ''}` + panel(D, r, st) +
    `<div class="b-sticky"><div class="b-where"><span class="b-here">${esc(r.title)}</span><button class="b-pres" data-b="presider" aria-pressed="false">主禮模式</button></div>` +
    (steps.length > 1 ? `<nav class="b-steps" aria-label="禮儀步驟">${steps.map((s) => `<button data-step-go="${esc(s)}">${esc(s)}</button>`).join('')}</nav>` : '') + '</div>' +
    `<div class="mass b-rite" data-rid="r-${r.id}">${html}</div>` +
    `<div class="notes b-src"><p>${esc(r.src || '')}</p><p>${esc(D.src || '')}</p></div>`;
}
export function renderRites() {
  const v = store.get('rview', '');
  if (v && R[v]) { SAC = v; return renderSacrament(); }
  return renderIndex();
}

/** wire the view. ctx: { rerender() } */
export function bindRites(el, ctx) {
  const keep = () => { const y = window.scrollY; ctx.rerender(); window.scrollTo(0, y); };
  el.querySelectorAll('[data-sac]').forEach((a) => a.onclick = (e) => { e.preventDefault(); store.set('rview', a.dataset.sac); ctx.rerender(); window.scrollTo(0, 0); });
  const D = R[SAC]; const r = store.get('rview', '') && D ? currentRite(D) : null;
  el.querySelectorAll('select[data-ro]').forEach((s) => s.onchange = () => {
    if (s.dataset.ro === 'rite') { store.set('rrite.' + SAC, s.value); ctx.rerender(); window.scrollTo(0, 0); return; }
    const o = store.get('ropt.' + r.id, null) || {}; o[s.dataset.ro] = s.value; store.set('ropt.' + r.id, o); keep();
  });
  el.querySelectorAll('[data-rn]').forEach((i) => i.onchange = () => { const n = { ...names() }; n[i.dataset.rn] = i.value.trim(); store.set('rnames.' + SAC, n); keep(); });
  el.querySelectorAll('[data-r="reset"]').forEach((b) => b.onclick = () => { store.set('ropt.' + r.id, null); keep(); });
  el.querySelectorAll('[data-r="clear"]').forEach((b) => b.onclick = () => { store.set('rnames.' + SAC, {}); if (SAC === 'marriage') store.set('rnames', null); keep(); });
  const pan = el.querySelector('details.r-opts');
  if (pan) pan.addEventListener('toggle', () => store.set('rOptsClosed', !pan.open));
  // step bar, presider mode, print: as in 祝福禮典
  bindBlessings(el, { open: () => { store.set('rview', ''); ctx.rerender(); window.scrollTo(0, 0); }, rerender: ctx.rerender });
}
