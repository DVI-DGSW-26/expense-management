import { accountApi, expenseApi } from '../api/endpoints';
import type { DebitAccount, Expense } from '../api/types';
import type { Cell, Sheet } from './xlsx';

/** 엑셀 한 줄을 경비로 바꾼 결과 */
export interface ImportRow {
  line: number; // 엑셀 행 번호
  expenseDate: string;
  vendor: string;
  itemName: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  accountName: string;
  /** 등록 / 이미 있어 건너뜀 / 형식 오류 */
  status: 'new' | 'duplicate' | 'error';
  problem?: string;
  /** 합계가 공급가액 + 세액과 다르면 안내만 한다 (그대로 저장) */
  totalMismatch?: boolean;
  /** 이미 있는 같은 경비 (건너뛸 때 누가 언제 등록했는지 보여 준다) */
  existing?: { id: number; createdBy?: string; createdAt?: string; inFile?: number };
}

export interface ImportPlan {
  sheetName: string;
  rows: ImportRow[];
  /** 서비스에 없어 새로 만들 차변계정 */
  newAccounts: string[];
  /** 엑셀 계정명 → 기존 계정 (이름이 조금 달라 맞춘 경우 안내용) */
  matchedAccounts: { from: string; to: DebitAccount }[];
  /** 엑셀에 있는 경비의 첫 일자 ~ 마지막 일자 */
  range: { from: string; to: string } | null;
}

const HEADERS = {
  year: ['연도', '년도'],
  date: ['일자', '날짜', '거래일자'],
  vendor: ['거래처', '거래처명'],
  item: ['품명', '내역', '적요'],
  supply: ['공급가액'],
  tax: ['세액', '부가세'],
  total: ['합계', '합계금액', '금액'],
  account: ['차변계정', '계정', '계정과목'],
} as const;

type Col = keyof typeof HEADERS;

const clean = (c: Cell) => (c === null ? '' : String(c).replace(/\s+/g, ' ').trim());
const pad = (n: number) => String(n).padStart(2, '0');

function findHeader(rows: Cell[][]): { index: number; cols: Record<Col, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const names = rows[i].map((c) => clean(c).replace(/\s/g, ''));
    const cols = {} as Record<Col, number>;
    for (const [key, aliases] of Object.entries(HEADERS) as [Col, readonly string[]][]) {
      cols[key] = names.findIndex((n) => aliases.includes(n));
    }
    if (cols.date >= 0 && cols.vendor >= 0 && cols.supply >= 0) return { index: i, cols };
  }
  return null;
}

/** 엑셀 날짜 칸 → "YYYY-MM-DD". 일련번호, "07-07"(연도 칸과 합침), "7/31/26", "2026.07.07" 을 읽는다. */
function parseDate(cell: Cell, yearCell: Cell): string | null {
  if (typeof cell === 'number') {
    // 엑셀 일련번호: 1899-12-30 기준 일수
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(cell) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = clean(cell);
  const year = Number(clean(yearCell)) || null;
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/); // 미국식 월/일/년
  if (m) return `${m[3].length === 2 ? 2000 + +m[3] : m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
  m = s.match(/^(\d{1,2})[-./](\d{1,2})$/);
  if (m && year) return `${year}-${pad(+m[1])}-${pad(+m[2])}`;
  return null;
}

function parseAmount(cell: Cell): number | null {
  if (typeof cell === 'number') return Math.round(cell);
  const s = clean(cell).replace(/[,원\s]/g, '');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s));
}

/** "(판)소모품비" 와 "소모품비" 를 같은 계정으로 본다 */
const normalizeAccount = (s: string) => s.replace(/^\((판|제|영)\)/, '').replace(/\s/g, '');

const dupKey = (date: string, vendor: string, item: string, total: number) => `${date}|${vendor}|${item}|${total}`;

/** 시트를 읽어 등록 계획을 만든다. 서비스의 기존 경비와 비교해 중복을 표시한다. */
export async function planImport(sheets: Sheet[], accounts: DebitAccount[]): Promise<ImportPlan> {
  const sheet = sheets.find((s) => s.name.includes('경비')) ?? sheets.find((s) => findHeader(s.rows)) ?? sheets[0];
  if (!sheet) throw new Error('엑셀에 시트가 없습니다.');
  const header = findHeader(sheet.rows);
  if (!header) throw new Error(`'${sheet.name}' 시트에서 '일자', '거래처', '공급가액' 머리글을 찾지 못했습니다.`);
  const { index, cols } = header;
  const at = (r: Cell[], k: Col) => (cols[k] >= 0 ? r[cols[k]] ?? null : null);

  const rows: ImportRow[] = [];
  for (let i = index + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i];
    if (!r || r.every((c) => clean(c) === '')) continue;
    const vendor = clean(at(r, 'vendor'));
    const itemName = clean(at(r, 'item'));
    const date = parseDate(at(r, 'date'), at(r, 'year'));
    const supply = parseAmount(at(r, 'supply'));
    const tax = parseAmount(at(r, 'tax')) ?? 0;
    const total = parseAmount(at(r, 'total')) ?? (supply !== null ? supply + tax : null);
    const accountName = clean(at(r, 'account'));
    // 합계 줄 같은 요약 행은 건너뛴다
    if (!vendor && !itemName) continue;

    const problems = [
      !date && `일자 '${clean(at(r, 'date'))}'를 날짜로 읽지 못함`,
      !vendor && '거래처 없음',
      !itemName && '품명 없음',
      supply === null && '공급가액 없음',
      !accountName && '차변계정 없음',
    ].filter(Boolean);

    rows.push({
      line: i + 1,
      expenseDate: date ?? '',
      vendor,
      itemName,
      supplyAmount: supply ?? 0,
      taxAmount: tax,
      totalAmount: total ?? 0,
      accountName,
      status: problems.length ? 'error' : 'new',
      problem: problems.join(', ') || undefined,
      totalMismatch: supply !== null && total !== null && total !== supply + tax,
    });
  }
  if (rows.length === 0) throw new Error(`'${sheet.name}' 시트에 가져올 경비가 없습니다.`);

  // 이미 등록된 경비와 비교 (해당 연도들만 조회)
  const years = [...new Set(rows.filter((r) => r.status === 'new').map((r) => Number(r.expenseDate.slice(0, 4))))];
  const existing: Expense[] = (await Promise.all(years.map((year) => expenseApi.list({ year })))).flatMap((l) => l.items);
  const seen = new Map<string, ImportRow['existing']>(
    existing.map((e) => [dupKey(e.expenseDate, e.vendor, e.itemName, e.totalAmount), { id: e.id, createdBy: e.createdBy, createdAt: e.createdAt }]),
  );
  for (const r of rows) {
    if (r.status !== 'new') continue;
    const key = dupKey(r.expenseDate, r.vendor, r.itemName, r.totalAmount);
    const found = seen.get(key);
    if (found) {
      r.status = 'duplicate';
      r.existing = found;
      r.problem = found.inFile
        ? `엑셀 ${found.inFile}행과 같은 내용`
        : `이미 등록됨${found.createdBy ? ` (${found.createdBy}${found.createdAt ? `, ${found.createdAt.slice(0, 10)}` : ''})` : ''}`;
      continue;
    }
    seen.set(key, { id: 0, inFile: r.line }); // 엑셀 안에서 같은 줄이 두 번 있어도 한 번만
  }

  // 계정: 이름이 같으면 그대로, "(판)" 같은 접두어만 다르면 기존 계정에 맞추고, 없으면 새로 만든다
  const newAccounts: string[] = [];
  const matchedAccounts: { from: string; to: DebitAccount }[] = [];
  for (const name of [...new Set(rows.filter((r) => r.status === 'new').map((r) => r.accountName))]) {
    if (accounts.some((a) => a.name === name)) continue;
    const similar = accounts.find((a) => normalizeAccount(a.name) === normalizeAccount(name));
    if (similar) matchedAccounts.push({ from: name, to: similar });
    else newAccounts.push(name);
  }

  const dates = rows.map((r) => r.expenseDate).filter(Boolean).sort();
  const range = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;

  return { sheetName: sheet.name, rows, newAccounts, matchedAccounts, range };
}

/** 계획대로 계정을 만들고 경비를 한 건씩 등록한다. 진행 상황을 onProgress 로 알린다. */
export async function runImport(
  plan: ImportPlan,
  accounts: DebitAccount[],
  onProgress: (done: number, total: number) => void,
): Promise<{ created: number; failed: { row: ImportRow; message: string }[] }> {
  const ids = new Map<string, number>(accounts.map((a) => [a.name, a.id]));
  for (const m of plan.matchedAccounts) ids.set(m.from, m.to.id);
  let order = Math.max(0, ...accounts.map((a) => a.sortOrder));
  for (const name of plan.newAccounts) {
    order += 10;
    const created = await accountApi.create(name, order);
    ids.set(name, created.id);
  }

  const targets = plan.rows.filter((r) => r.status === 'new');
  const failed: { row: ImportRow; message: string }[] = [];
  let created = 0;
  for (const [i, r] of targets.entries()) {
    try {
      await expenseApi.create(
        {
          expenseDate: r.expenseDate,
          vendor: r.vendor,
          itemName: r.itemName,
          supplyAmount: r.supplyAmount,
          taxAmount: r.taxAmount,
          totalAmount: r.totalAmount,
          debitAccountId: ids.get(r.accountName)!,
        },
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
