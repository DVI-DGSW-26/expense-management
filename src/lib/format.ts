const won = new Intl.NumberFormat('ko-KR');

/** 1234567 → "1,234,567". null 이면 대시. */
export function money(n: number | null | undefined): string {
  return n === null || n === undefined ? '–' : won.format(n);
}

/** 큰 금액을 만원/억 단위로 짧게 (차트 눈금용) */
export function moneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${+(n / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${won.format(Math.round(n / 10_000))}만`;
  return won.format(n);
}

/** 입력란 문자열 → 정수. 비었거나 숫자가 아니면 null. */
export function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[^\d-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** "2026-10-14" → "10.14" */
export function shortDate(d: string | null | undefined): string {
  if (!d) return '–';
  const [, m, day] = d.split('-');
  return `${Number(m)}.${Number(day)}`;
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const thisYear = () => new Date().getFullYear();
