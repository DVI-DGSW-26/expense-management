import { leaseApi } from '../api/endpoints';
import type { LeaseMonth, LeaseYear } from '../api/types';

/**
 * 임대료·관리비는 매달 같으므로 한 번 정해 두면 매달 자동으로 등록한다.
 * API 에 '고정 금액' 설정이 따로 없어서, 등록된 마지막 달의 임대료·관리비를 고정 금액으로 보고
 * 그다음 달부터 이번 달까지 빈 달을 그 금액으로 채운다. 전기료는 0(미입력)으로 두고 직접 입력한다.
 * 고정 금액을 0원으로 바꾸면 더 이상 채우지 않는다.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const ymOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function nextYm(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/** 자동 채우기에서 살펴볼 지난 연도 수 */
const LOOKBACK_YEARS = 4;

export interface FixedLease {
  rent: number;
  maintenanceFee: number;
  /** 이 금액이 처음 쓰인 달 */
  since: string;
  /** 이 금액이 적힌 마지막 달 */
  lastYm: string;
}

interface Registered {
  id: number;
  ym: string;
  rent: number;
  maintenanceFee: number;
}

function registered(years: LeaseYear[]): Registered[] {
  return years
    .flatMap((y) =>
      y.months.map((m: LeaseMonth, i) => {
        if (!m.id) return null;
        const mm = m.month || (m.yearMonth ? Number(m.yearMonth.slice(5, 7)) : i + 1);
        return { id: m.id, ym: m.yearMonth ?? `${y.year}-${pad(mm)}`, rent: m.rent ?? 0, maintenanceFee: m.maintenanceFee ?? 0 };
      }),
    )
    .filter((r): r is Registered => !!r)
    .sort((a, b) => (a.ym < b.ym ? -1 : 1));
}

async function loadYears(fromYear: number, toYear: number) {
  return Promise.all(Array.from({ length: toYear - fromYear + 1 }, (_, i) => leaseApi.year(fromYear + i)));
}

/** 이번 달까지 등록된 마지막 달 기준의 고정 금액. 등록된 달이 없으면 null. */
export async function fixedLease(): Promise<FixedLease | null> {
  const now = new Date();
  const currentYm = ymOf(now);
  const rows = registered(await loadYears(now.getFullYear() - LOOKBACK_YEARS, now.getFullYear() + 1));
  const past = rows.filter((r) => r.ym <= currentYm);
  const last = past[past.length - 1] ?? rows[0];
  if (!last) return null;
  // 같은 금액이 이어진 첫 달을 찾는다
  let since = last.ym;
  for (let i = past.indexOf(last) - 1; i >= 0; i--) {
    if (past[i].rent !== last.rent || past[i].maintenanceFee !== last.maintenanceFee) break;
    since = past[i].ym;
  }
  return { rent: last.rent, maintenanceFee: last.maintenanceFee, since, lastYm: last.ym };
}

/** 마지막 등록 달 다음부터 이번 달까지 고정 금액으로 등록한다. 만든 달 수를 돌려준다. */
async function fill(): Promise<number> {
  const now = new Date();
  const currentYm = ymOf(now);
  // 미리 등록해 둔 다음 달 이후는 기준에서 뺀다
  const rows = registered(await loadYears(now.getFullYear() - LOOKBACK_YEARS, now.getFullYear())).filter((r) => r.ym <= currentYm);
  const last = rows[rows.length - 1];
  if (!last || last.ym >= currentYm || (last.rent === 0 && last.maintenanceFee === 0)) return 0;
  let created = 0;
  for (let ym = nextYm(last.ym); ym <= currentYm; ym = nextYm(ym)) {
    try {
      await leaseApi.create({ yearMonth: ym, rent: last.rent, maintenanceFee: last.maintenanceFee, electricity: 0 }, []);
      created++;
    } catch {
      // 다른 사람이 먼저 등록했거나(409) 권한이 없으면 넘어간다
    }
  }
  return created;
}

let filling: Promise<number> | null = null;

/** 접속 중 한 번만 빈 달을 채운다. 실패해도 조회는 계속한다. */
export function fillLeaseMonths(): Promise<number> {
  filling ??= fill().catch(() => 0);
  return filling;
}

/**
 * 고정 금액을 정한다. fromYm 부터 이미 등록된 달은 임대료·관리비를 고치고(전기료는 그대로),
 * 이번 달까지 빈 달은 새로 등록한다.
 */
export async function setFixedLease(fromYm: string, rent: number, maintenanceFee: number): Promise<{ updated: number; created: number }> {
  const now = new Date();
  const currentYm = ymOf(now);
  const fromYear = Number(fromYm.slice(0, 4));
  const rows = registered(await loadYears(fromYear, Math.max(fromYear, now.getFullYear() + 1)));
  const byYm = new Map(rows.map((r) => [r.ym, r]));
  let updated = 0;
  let created = 0;
  for (const r of rows) {
    if (r.ym < fromYm || (r.rent === rent && r.maintenanceFee === maintenanceFee)) continue;
    await leaseApi.update(r.id, { rent, maintenanceFee });
    updated++;
  }
  const until = fromYm > currentYm ? fromYm : currentYm;
  for (let ym = fromYm; ym <= until; ym = nextYm(ym)) {
    if (byYm.has(ym)) continue;
    await leaseApi.create({ yearMonth: ym, rent, maintenanceFee, electricity: 0 }, []);
    created++;
  }
  filling = null;
  return { updated, created };
}
