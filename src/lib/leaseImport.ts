import { leaseApi } from '../api/endpoints';
import type { LeaseCostPatch, LeaseMonthRow } from '../api/types';
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
  /**
   * new: 새로 등록 / fill: 서버가 자동 등록한 달의 빈 항목 채움 /
   * duplicate: 사람이 등록한 달이라 건너뜀 / error: 형식 오류
   */
  status: 'new' | 'fill' | 'duplicate' | 'error';
  problem?: string;
  /** fill 일 때 고칠 달과 보낼 값 */
  fill?: { id: number; patch: LeaseCostPatch; changes: string[] };
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

  // 이미 있는 달: 서버가 자동 등록한 달은 엑셀 값으로 채우고, 사람이 등록한 달은 건너뛴다
  const yms = rows.map((r) => r.yearMonth).filter(Boolean).sort();
  const registered = new Map<string, LeaseMonthRow>();
  if (yms.length) {
    const last = yms[yms.length - 1];
    const lastDay = new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0).getDate();
    const period = await leaseApi.period({ from: `${yms[0]}-01`, to: `${last}-${pad(lastDay)}` });
    period.months.filter((m) => m.id).forEach((m) => registered.set(m.yearMonth, m));
  }
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.status !== 'new') continue;
    const existing = registered.get(r.yearMonth);
    if (seen.has(r.yearMonth)) {
      r.status = 'duplicate';
      r.problem = '엑셀 안에 같은 달이 또 있음';
    } else if (existing && !existing.autoCreated) {
      r.status = 'duplicate';
      r.problem = '직접 등록된 달';
    } else if (existing) {
      const fill = fillPatch(existing, r);
      if (fill.changes.length) {
        r.status = 'fill';
        r.fill = fill;
        r.problem = `자동 등록된 달: ${fill.changes.join('·')} 채움`;
      } else {
        r.status = 'duplicate';
        r.problem = '자동 등록된 달, 엑셀과 값이 같음';
      }
    }
    seen.add(r.yearMonth);
  }
  return { sheetName: sheet.name, rows };
}

/**
 * 자동 등록된 달에 보낼 값: 엑셀에 있는 전기료·VAT·전력기금과, 엑셀과 다른 임대료·관리비.
 * 서버 값과 같은 항목은 보내지 않는다.
 */
function fillPatch(m: LeaseMonthRow, r: LeaseImportRow): { id: number; patch: LeaseCostPatch; changes: string[] } {
  const patch: LeaseCostPatch = {};
  const changes: string[] = [];
  const fields = [
    ['rent', '임대료', r.rent, m.rent],
    ['maintenanceFee', '관리비', r.maintenanceFee, m.maintenanceFee],
    ['electricity', '전기료', r.electricity, m.electricity],
    ['vat', 'VAT', r.vat, m.vat],
    ['powerFund', '전력기금', r.powerFund, m.powerFund],
  ] as const;
  for (const [key, label, excel, server] of fields) {
    if (excel === null || excel === server) continue;
    patch[key] = excel;
    changes.push(label);
  }
  return { id: m.id!, patch, changes };
}

export async function runLeaseImport(
  plan: LeaseImportPlan,
  onProgress: (done: number, total: number) => void,
): Promise<{ created: number; filled: number; failed: { row: LeaseImportRow; message: string }[] }> {
  const targets = plan.rows.filter((r) => r.status === 'new' || r.status === 'fill');
  const failed: { row: LeaseImportRow; message: string }[] = [];
  let created = 0;
  let filled = 0;
  for (const [i, r] of targets.entries()) {
    try {
      if (r.status === 'fill' && r.fill) {
        await leaseApi.update(r.fill.id, r.fill.patch);
        filled++;
      } else {
        await leaseApi.create(
          { yearMonth: r.yearMonth, rent: r.rent, maintenanceFee: r.maintenanceFee, electricity: r.electricity, vat: r.vat, powerFund: r.powerFund },
          [],
        );
        created++;
      }
    } catch (e) {
      failed.push({ row: r, message: e instanceof Error ? e.message : String(e) });
    }
    onProgress(i + 1, targets.length);
  }
  return { created, filled, failed };
}
