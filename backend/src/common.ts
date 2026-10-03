/** 日期/金额/常量工具 */

export const CHANNELS = [
  { code: 'direct', name: '官网直订', commissionRate: 0 },
  { code: 'miniapp', name: '微信小程序', commissionRate: 0.03 },
  { code: 'ctrip', name: '携程', commissionRate: 0.12 },
  { code: 'meituan', name: '美团', commissionRate: 0.1 },
  { code: 'phone', name: '电话订房', commissionRate: 0 },
];

export const INCIDENT_TYPES: Record<string, { label: string; defaultSeverity: string }> = {
  late_checkout: { label: '延迟退房', defaultSeverity: 'mid' },
  room_fault: { label: '房间硬件故障', defaultSeverity: 'high' },
  linen_delay: { label: '布草未及时送达', defaultSeverity: 'mid' },
  extra_guest: { label: '客人临时加人', defaultSeverity: 'low' },
  pet_damage: { label: '宠物损坏家具', defaultSeverity: 'high' },
  breakfast_shortage: { label: '早餐供应不足', defaultSeverity: 'mid' },
  oversell: { label: '渠道超卖', defaultSeverity: 'high' },
  bad_review: { label: '客人差评', defaultSeverity: 'mid' },
};

export const REVIEW_CATEGORIES: Record<string, string> = {
  hardware: '硬件设施',
  service: '服务质量',
  oversell: '超卖/履约',
  food_prep: '餐食准备',
  other: '其他',
};

export const DEFAULT_POLICIES = {
  extraPersonPrice: 100, // 临时加人 100 元/人/晚
};

/** 上海时区取今天日期串 YYYY-MM-DD */
export function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function dateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** 列出 [arrival, departure) 之间的每晚日期（含入住日，不含离店日） */
export function nightsBetween(arrival: string, departure: string): string[] {
  const out: string[] = [];
  const cur = new Date(arrival + 'T00:00:00');
  const end = new Date(departure + 'T00:00:00');
  while (cur < end) {
    out.push(dateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** 早餐供应日：入住次日早晨 … 离店日早晨（共 nights 餐） */
export function breakfastDates(arrival: string, departure: string): string[] {
  const out: string[] = [];
  const cur = new Date(arrival + 'T00:00:00');
  cur.setDate(cur.getDate() + 1);
  const end = new Date(departure + 'T00:00:00');
  while (cur <= end) {
    out.push(dateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function num(v: any): number {
  return v == null ? 0 : Number(v);
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function genCode(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const s =
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
  return `${prefix}${s}${Math.floor(performanceSeq() % 900 + 100)}`;
}

let _seq = Math.floor(Math.random() * 900);
function performanceSeq() {
  _seq = (_seq + 7) % 100000;
  return _seq;
}
