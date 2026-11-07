// 祝福禮典 — Book of Blessings viewer for 常頌 SEMPER.
// Data: data/blessings.json (build/blessings/build_blessings.py): parts → chapters → blocks.
// Only the readings printed in the book are kept (citation-only options removed, Fr. Gervais 8 Nov 2026).
let B = null;
export async function loadBlessings(base = 'data/') {
  if (!B) B = await (await fetch(base + 'blessings.json')).json();
  return B;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SPK = /^(主禮|主祭|眾答|眾|全體|領|啟|應|讀經員|執事|輔祭|司鐸|父母|答)([（(][^）)]{0,12}[)）])?(答)?[：:]/;
function inl(s) {
  return esc(s).replace(/（([^（）]{1,16})）/g, (m, x) => (/^(某|\d)/.test(x) ? m : `<span class="ri">（${x}）</span>`))
    .replace(/✠/g, '<span class="ri">✠</span>').replace(/【答】/g, '<span class="ri">【答】</span>');
}
function line(b) {
  const t = b.t;
  if (b.k === 'section') return `<h2 class="m-sec" id="${b.id}">${esc(t)}</h2>`;
  if (b.k === 'sub') return `<h3 class="m-h b-sub" id="${b.id}">${esc(t)}</h3>`;
  if (b.k === 'h') return `<h3 class="m-h">${esc(t)}</h3>`;
  if (b.k === 'rub') return `<p class="rub">${inl(t)}</p>`;
  if (b.k === 'opt') return `<p class="m-p ropt">${esc(t)}</p>`;
  if (b.k === 'resp') return `<p class="m-p"><span class="spk">答：</span>${inl(t.replace(/^答[：:]\s*/, ''))}</p>`;
  const m = t.match(SPK);
  if (m) return `<p class="m-p"><span class="spk">${esc(t.slice(0, m[0].length - 1))}：</span>${inl(t.slice(m[0].length))}</p>`;
  if (/^[\-－—一]\s*求/.test(t)) return `<p class="m-p b-pet">—${inl(t.replace(/^[\-－—一]\s*/, ''))}</p>`;
  return `<p class="m-p">${inl(t)}</p>`;
}
export function renderIndex(q = '') {
  const out = [`<h1 class="mtitle">祝福禮典</h1>`,
    `<input class="b-search" type="search" placeholder="搜尋祝福，例如：病人、房屋、念珠" value="${esc(q)}" data-b="search">`,
    `<div class="notes"><p>中國主教團禮儀委員會編譯《祝福禮典》（1984年拉丁文版）。只保留書中印出全文的讀經；其他僅列出章節的讀經選項已刪去。用語已按香港教區習慣（亞孟等）。</p></div>`];
  const ql = q.trim();
  for (const p of B.parts) {
    const chs = p.chapters.filter((c) => !ql || c.title.includes(ql) || c.sections.some((s) => s.title.includes(ql)));
    if (!chs.length) continue;
    out.push(`<h2 class="m-sec">${esc(p.title)}</h2><ul class="b-list">`);
    for (const c of chs) {
      const secs = c.sections.filter((s) => s.level === 1 && /、/.test(s.title));
      out.push(`<li><a href="#" data-chap="${c.id}">${esc(c.title)}</a>${secs.length ? `<div class="b-secs">${secs.map((s) => `<a href="#" data-chap="${c.id}" data-sec="${s.id}">${esc(s.title)}</a>`).join('')}</div>` : ''}</li>`);
    }
    out.push('</ul>');
  }
  return out.join('');
}
export function findChapter(id) {
  for (const p of B.parts) for (const c of p.chapters) if (c.id === id) return { p, c };
  return null;
}
export function renderChapter(id) {
  const r = findChapter(id); if (!r) return '<p class="empty">找不到此祝福儀式。</p>';
  const { c } = r;
  const secs = c.sections.filter((s) => s.level === 1);
  return `<p><a href="#" data-b="index" class="b-back">‹ 祝福禮典目錄</a></p><h1 class="mtitle">${esc(c.title)}</h1>` +
    (secs.length > 1 ? `<div class="tabs b-jump">${secs.map((s) => `<button class="pill" data-jump="${s.id}">${esc(s.title)}</button>`).join('')}</div>` : '') +
    `<div class="mass">${c.blocks.map(line).join('')}</div>` +
    `<div class="mbtns"><button class="pill" data-b="print">列印</button><button class="pill" data-b="index">回到目錄</button></div>`;
}
