import { leaseApi } from '../api/endpoints';
import { parseAmount, parseDate } from './expenseImport';
import type { Cell, Sheet } from './xlsx';

/** 임차관리비 엑셀 한 줄 */
export interface LeaseImportRow {
  line: number;
  yearMonth: string;
  rent: number;
  maintenanceFee: number;
  /** 빈칸이면 null (미입력) */
  electricity: number | null;
  vat: number | null;
  powerFund: number | null;
  /** 엑셀의 청구 합계 (미리보기에서 비교용) */
  billTotal: number | null;
  status: 'new' | 'duplicate' | 'error';
  problem?: string;
}

export interface LeaseImportPlan {
  sheetName: string;
  rows: LeaseImportRow[];
}

const HEADERS = {
  date: ['날짜', '일자', '청구일'],
  month: ['청구월', '귀속월', '월'],
  rent: ['임대료', '임차료', '임차비'],
  fee: ['관리비'],
  elec: ['전기료', '전기세', '전기요금'],
  vat: ['VAT', '부가세', '세액'],
  fund: ['전력기금'],
  total: ['합계'],
} as const;

type Col = keyof typeof HEADERS;

const clean = (c: Cell) => (c === null ? '' : String(c).replace(/\s/g, ''));
const pad = (n: number) => String(n).padStart(2, '0');

function findHeader(rows: Cell[][]): { index: number; cols: Record<Col, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const names = (rows[i] ?? []).map((c) => clean(c).toUpperCase());
    const cols = {} as Record<Col, number>;
    for (const [key, aliases] of Object.entries(HEADERS) as [Col, readonly string[]][]) {
      cols[key] = names.findIndex((n) => aliases.includes(n));
    }
    if (cols.rent >= 0 && cols.fee >= 0 && (cols.date >= 0 || cols.month >= 0)) return { index: i, cols };
  }
  return null;
}

/** 이 파일에 임차관리비 시트(임대료·관리비 머리글)가 있는지 */
export const isLeaseWorkbook = (sheets: Sheet[]) => sheets.some((s) => findHeader(s.rows));

/** 날짜 칸(청구일)의 연도와 청구월 칸("4월")으로 귀속월을 만든다 */
function yearMonthOf(dateCell: Cell, monthCell: Cell): string | null {
  const date = parseDate(dateCell, null);
  const m = clean(monthCell).match(/^(\d{1,2})월?$/);
  if (date && m) return `${date.slice(0, 4)}-${pad(+m[1])}`;
  if (date) return date.slice(0, 7);
  return null;
}

export async function planLeaseImport(sheets: Sheet[]): Promise<LeaseImportPlan> {
  const sheet = sheets.find((s) => findHeader(s.rows));
  if (!sheet) throw new Error("'임대료', '관리비' 머리글이 있는 시트를 찾지 못했습니다.");
  const { index, cols } = findHeader(sheet.rows)!;
  const at = (r: Cell[], k: Col) => (cols[k] >= 0 ? r[cols[k]] ?? null : null);

  const rows: LeaseImportRow[] = [];
  for (let i = index + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i];
    if (!r) continue;
    const rent = parseAmount(at(r, 'rent'));
    const fee = parseAmount(at(r, 'fee'));
    // 금액이 없는 줄(빈 양식 줄, 합계 줄)은 건너뛴다
    if (rent === null && fee === null) continue;
    const yearMonth = yearMonthOf(at(r, 'date'), at(r, 'month'));
    rows.push({
      line: i + 1,
      yearMonth: yearMonth ?? '',
      rent: rent ?? 0,
      maintenanceFee: fee ?? 0,
      electricity: parseAmount(at(r, 'elec')),
      vat: parseAmount(at(r, 'vat')),
      powerFund: parseAmount(at(r, 'fund')),
      billTotal: parseAmount(at(r, 'total')),
      status: yearMonth ? 'new' : 'error',
      problem: yearMonth ? undefined : `날짜 '${clean(at(r, 'date'))}' / 청구월 '${clean(at(r, 'month'))}'로 귀속월을 알 수 없음`,
    });
  }
  if (rows.length === 0) throw new Error(`'${sheet.name}' 시트에 가져올 임차관리비가 없습니다.`);

  // 이미 등록된 달은 건너뛴다 (API 가 같은 달을 409 로 막는다)
  const yms = rows.map((r) => r.yearMonth).filter(Boolean).sort();
  const registered = new Set<string>();
  if (yms.length) {
    const last = yms[yms.length - 1];
    const lastDay = new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0).getDate();
    const period = await leaseApi.period({ from: `${yms[0]}-01`, to: `${last}-${pad(lastDay)}` });
    period.months.filter((m) => m.id).forEach((m) => registered.add(m.yearMonth));
  }
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.status !== 'new') continue;
    if (registered.has(r.yearMonth)) {
      r.status = 'duplicate';
      r.problem = '이미 등록된 달';
    } else if (seen.has(r.yearMonth)) {
      r.status = 'duplicate';
      r.problem = '엑셀 안에 같은 달이 또 있음';
    }
    seen.add(r.yearMonth);
  }
  return { sheetName: sheet.name, rows };
}

export async function runLeaseImport(
  plan: LeaseImportPlan,
  onProgress: (done: number, total: number) => void,
): Promise<{ created: number; failed: { row: LeaseImportRow; message: string }[] }> {
  const targets = plan.rows.filter((r) => r.status === 'new');
  const failed: { row: LeaseImportRow; message: string }[] = [];
  let created = 0;
  for (const [i, r] of targets.entries()) {
    try {
      await leaseApi.create(
        { yearMonth: r.yearMonth, rent: r.rent, maintenanceFee: r.maintenanceFee, electricity: r.electricity, vat: r.vat, powerFund: r.powerFund },
        [],
      );
      created++;
    } catch (e) {
      failed.push({ row: r, message: e instanceof Error ? e.message : String(e) });
    }
    onProgress(i + 1, targets.length);
  }
  return { created, failed };
}
