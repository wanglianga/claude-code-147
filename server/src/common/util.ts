// 日期与金额工具
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDay(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

// 返回 [from, to) 的日期数组
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur < to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function overlapNights(checkIn: string, checkOut: string, from: string, to: string): number {
  const s = checkIn > from ? checkIn : from;
  const e = checkOut < to ? checkOut : to;
  return Math.max(0, diffDays(s, e));
}

export const todayStr = () => fmtDay(new Date());
