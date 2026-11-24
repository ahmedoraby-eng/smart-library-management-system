import type { LoanDto } from "@slm/contracts";

const DAY_MS = 86_400_000;
const fullDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "8 Dec 2026". */
export const formatDate = (d: Date | string) => fullDay.format(typeof d === "string" ? new Date(d) : d);
export const formatTime = (d: Date | string) => time.format(typeof d === "string" ? new Date(d) : d);

/** Local calendar day as YYYY-MM-DD (the value of an <input type="date">). */
export function toDayInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole local calendar days from `from` to the day `day` (YYYY-MM-DD). */
export function daysUntil(day: string, from = new Date()): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const target = new Date(y, m - 1, d);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target.getTime() - start.getTime()) / DAY_MS);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** Whole days a loan is overdue (≥ 1 once it is past due). */
export function overdueDays(loan: Pick<LoanDto, "dueAt">, now = new Date()): number {
  return Math.max(1, Math.floor((now.getTime() - new Date(loan.dueAt).getTime()) / DAY_MS) || 1);
}
