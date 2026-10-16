import { expenseApi, leaseApi } from '../api/endpoints';
import type { Expense, ExpenseSource, LeaseMonth } from '../api/types';
import { monthOf } from '../pages/LeasePage';

/** 경비 화면의 구분 필터. LEASE 는 임차관리비만. */
export type Kind = '' | ExpenseSource | 'LEASE';

/** 조회 범위. 연·월로 고르거나 시작일~종료일 기간으로 고른다. */
export type Range =
  | { mode: 'month'; year: number; month: number | null }
  | { mode: 'period'; from: string; to: string };

export interface LedgerFilter {
  range: Range;
  vendor: string;
  accountId: number | null;
  kind: Kind;
}

export interface LeaseRow {
  id: number;
  yearMonth: string;
  /** 임대료 = 임차비 + 관리비 */
  rent: number;
  maintenanceFee: number;
  electricity: number;
  total: number;
}

export type Row = { type: 'expense'; date: string; e: Expense } | { type: 'lease'; date: string; l: LeaseRow };

export interface Ledger {
  rows: Row[];
  expenseCount: number;
  supply: number;
  tax: number;
  expenseTotal: number;
  leaseTotal: number;
  grandTotal: number;
}

/** 기간 조회는 해마다 API 를 부르므로 범위를 제한한다 */
export const MAX_PERIOD_YEARS = 5;

const pad = (n: number) => String(n).padStart(2, '0');

export function rangeBounds(r: Range): { from: string; to: string } {
  if (r.mode === 'period') return { from: r.from, to: r.to };
  if (r.month) {
    const last = new Date(r.year, r.month, 0).getDate();
    return { from: `${r.year}-${pad(r.month)}-01`, to: `${r.year}-${pad(r.month)}-${pad(last)}` };
  }
  return { from: `${r.year}-01-01`, to: `${r.year}-12-31` };
}

export function rangeLabel(r: Range): string {
  if (r.mode === 'month') return r.month ? `${r.year}년 ${r.month}월` : `${r.year}년`;
  return `${r.from.replaceAll('-', '.')} ~ ${r.to.replaceAll('-', '.')}`;
}

function toLeaseRow(m: LeaseMonth, year: number, index: number): LeaseRow | null {
  if (!m.id) return null;
  const rent = m.rent ?? 0;
  const maintenanceFee = m.maintenanceFee ?? 0;
  const electricity = m.electricity ?? 0;
  return {
    id: m.id,
    yearMonth: m.yearMonth ?? `${year}-${pad(monthOf(m, index))}`,
    rent,
    maintenanceFee,
    electricity,
    total: m.total ?? rent + maintenanceFee + electricity,
  };
}

export async function loadLedger(f: LedgerFilter): Promise<Ledger> {
  const { from, to } = rangeBounds(f.range);
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  if (to < from) throw new Error('종료일이 시작일보다 빠릅니다.');
  if (toYear - fromYear + 1 > MAX_PERIOD_YEARS) throw new Error(`기간은 최대 ${MAX_PERIOD_YEARS}년까지 조회할 수 있습니다.`);
  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i);
  const month = f.range.mode === 'month' ? f.range.month ?? undefined : undefined;

  const wantExpenses = f.kind !== 'LEASE';
  // 임차관리비는 거래처·차변계정이 없으므로 그 조건으로 거르면 뺀다
  const wantLease = (f.kind === '' || f.kind === 'LEASE') && !f.vendor && !f.accountId;

  const [expenseLists, leaseYears] = await Promise.all([
    wantExpenses
      ? Promise.all(
          years.map((year) =>
            expenseApi.list({
              year,
              month,
              vendor: f.vendor || undefined,
              debitAccountId: f.accountId ?? undefined,
              source: f.kind === 'MANUAL' || f.kind === 'SUBSCRIPTION' ? f.kind : undefined,
            }),
          ),
        )
      : Promise.resolve([]),
    wantLease ? Promise.all(years.map((year) => leaseApi.year(year))) : Promise.resolve([]),
  ]);

  const expenses = expenseLists.flatMap((l) => l.items).filter((e) => e.expenseDate >= from && e.expenseDate <= to);
  const fromYm = from.slice(0, 7);
  const toYm = to.slice(0, 7);
  const leases = leaseYears
    .flatMap((y) => y.months.map((m, i) => toLeaseRow(m, y.year, i)))
    .filter((l): l is LeaseRow => !!l && l.yearMonth >= fromYm && l.yearMonth <= toYm);

  const rows: Row[] = [
    ...expenses.map((e) => ({ type: 'expense' as const, date: e.expenseDate, e })),
    // 임차관리비는 그달의 마지막 날에 둔다 (최신순 정렬에서 그달 맨 위)
    ...leases.map((l) => ({ type: 'lease' as const, date: `${l.yearMonth}-99`, l })),
  ].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  const supply = expenses.reduce((s, e) => s + e.supplyAmount, 0);
  const tax = expenses.reduce((s, e) => s + e.taxAmount, 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.totalAmount, 0);
  const leaseTotal = leases.reduce((s, l) => s + l.total, 0);
  return {
    rows,
    expenseCount: expenses.length,
    supply,
    tax,
    expenseTotal,
    leaseTotal,
    grandTotal: expenseTotal + leaseTotal,
  };
}

// ── 정렬 ─────────────────────────────────────────────

export type SortKey = 'date' | 'vendor' | 'item' | 'supply' | 'tax' | 'total' | 'account' | 'attach';
export type SortDir = 'asc' | 'desc';
export interface Sort {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: Sort = { key: 'date', dir: 'desc' };

export const SORT_LABEL: Record<SortKey, string> = {
  date: '일자',
  vendor: '거래처',
  item: '품명',
  supply: '공급가액',
  tax: '세액',
  total: '합계',
  account: '차변계정',
  attach: '첨부파일',
};

/** 처음 누를 때의 방향: 글자는 가나다순, 날짜·금액은 큰 것부터 */
export const FIRST_DIR: Record<SortKey, SortDir> = {
  date: 'desc',
  vendor: 'asc',
  item: 'asc',
  supply: 'desc',
  tax: 'desc',
  total: 'desc',
  account: 'asc',
  attach: 'desc',
};

function sortValue(r: Row, key: SortKey): string | number | null {
  if (r.type === 'lease') {
    if (key === 'date') return r.date;
    if (key === 'item') return '임차관리비';
    if (key === 'total') return r.l.total;
    return null; // 임차관리비에는 거래처·공급가액·세액·계정·첨부 수가 없다
  }
  const e = r.e;
  switch (key) {
    case 'date':
      return r.date;
    case 'vendor':
      return e.vendor;
    case 'item':
      return e.itemName;
    case 'supply':
      return e.supplyAmount;
    case 'tax':
      return e.taxAmount;
    case 'total':
      return e.totalAmount;
    case 'account':
      return e.debitAccountName;
    case 'attach':
      return e.attachmentCount;
  }
}

/** 값이 없는 줄은 방향과 상관없이 맨 아래, 값이 같으면 최신 일자부터 */
export function sortRows(rows: Row[], sort: Sort): Row[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null && va !== vb) {
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko');
      if (cmp !== 0) return cmp * sign;
    }
    return a.date === b.date ? 0 : a.date < b.date ? 1 : -1;
  });
}
