// 禮儀日曆 for OBLATIO: the celebration(s) of a date under the selected calendar.
// Same rules and data as 常頌 SEMPER (calendar.js + santoral.json + calendars.json), without the Hours texts.
import { liturgicalDay, fromIso } from './calendar.js';

let D = null;
export async function loadCalendar(base = 'data/') {
  if (D) return D;
  const get = (f) => fetch(base + f).then((r) => r.json());
  const [santoral, calendars] = await Promise.all([get('santoral.json'), get('calendars.json').catch(() => null)]);
  D = { santoral, calendars };
  setCalendar('hk');
  return D;
}

/** calendars: General Roman, Hong Kong, Macau, Taiwan (data/calendars.json) */
export function setCalendar(id) {
  const all = D.calendars ? D.calendars.calendars : {};
  const C = all[id] || null, hk = all.hk;
  D.calId = C ? id : 'hk';
  const build = (cal) => {
    const rm = new Set(cal.remove || []), out = {};
    for (const [md, list] of Object.entries(D.santoral)) for (const e of list) {
      if (rm.has(e.id)) continue;
      const e2 = { ...e };
      if (cal.rank && cal.rank[e.id]) e2.rank = cal.rank[e.id];
      if (cal.title && cal.title[e.id]) e2.title = cal.title[e.id];
      (out[md] ||= []).push(e2);
    }
    for (const a of cal.add || []) (out[a.md] ||= []).push({ ...a });
    return out;
  };
  const hkSant = hk ? build(hk) : D.santoral;
  D.sant = C ? build(C) : hkSant;
  D.calOpts = C ? { ...C.rules, lny: D.calendars.lunarNewYear } : { ...(hk ? hk.rules : {}), lny: D.calendars ? D.calendars.lunarNewYear : null };
}
export const calendarList = () => (D && D.calendars ? Object.entries(D.calendars.calendars).map(([id, c]) => ({ id, name: c.name })) : []);
export const currentCalendar = () => D.calId;

/** Celebration choices for the day: [{id, title, rank, kind}] — first is the default. */
export function dayInfo(dateStr) {
  const L = liturgicalDay(fromIso(dateStr), D.sant, D.calOpts);
  const p = L.primary;
  const choices = [{ id: '', title: p.title, rank: p.rank, kind: p.source === 'temporal' ? 'temporal' : 'primary' }];
  for (const o of L.options) choices.push({ id: o.id, title: o.title, rank: 'optional', common: o.common, kind: o.commemoration ? 'commemoration' : 'optional' });
  return { L, choices };
}
