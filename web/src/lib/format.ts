const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const dayMonth = { format: (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}` };
const dayMonthYear = { format: (d: Date) => formatDate(d) };

/** The one date format, `d MMM yyyy` ("8 Dec 2026"); months are always 3 letters (no "Sept"). */
export function formatDate(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}

/** "Tue, 8 Dec 2026" (weekday short, day, month short, year). */
export function formatWeekdayDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${formatDate(d)}`;
}

/** "28 Nov", with the year when it isn't the current one (use `formatDate` where a column must be uniform). */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return (d.getFullYear() === new Date().getFullYear() ? dayMonth : dayMonthYear).format(d);
}

/** Two-letter placeholder for a cover: "Clean Code" → "CC". */
export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
