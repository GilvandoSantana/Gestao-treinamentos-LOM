/** Compare civil dates without UTC parsing or daylight-saving offsets. */
export function daysUntilDate(value: string, now = new Date(), timeZone?: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const target = new Date(0);
  target.setUTCFullYear(year, month - 1, day);
  target.setUTCHours(0, 0, 0, 0);
  if (target.getUTCFullYear() !== year || target.getUTCMonth() !== month - 1 || target.getUTCDate() !== day) return null;
  let today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
    today = Date.UTC(part('year'), part('month') - 1, part('day'));
  }
  return (target.getTime() - today) / 86400000;
}
