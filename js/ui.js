// Shared validation and display policy; no prayer text transformations here.
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0100-01-01' || value > '9998-12-31') return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseRoute(hash) {
  const m = /^#\/(\d{4}-\d{2}-\d{2})?(?:\/([0-5]))?(?:\?c=([\w@]*))?$/.exec(hash);
  if (!m || (m[1] && !validDate(m[1]))) return {};
  return { date: m[1], hour: m[2], choice: m[3] };
}
export const isCompletenessWarning = (text) => /尚未|尚無|尚待|暫取|暫用|待《|可能與|本年為/.test(text);

export function completenessWarnings(office) {
  const notices = [...office.notes, ...office.sections.flatMap((s) => [s.tag, ...(s.alts || []).map((a) => a.tag), ...(s.lines || []).filter((line) => /^（本.*尚未收錄）$/.test(line))])];
  return [...new Set(notices.filter((n) => n && isCompletenessWarning(n)))];
}
