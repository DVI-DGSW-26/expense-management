import { useState, type FormEvent } from 'react';
import { leaseApi } from '../api/endpoints';
import type { LeaseClearField, LeaseCost, LeaseCostFields, LeaseCostPatch, LeaseFixed, LeaseMonthRow } from '../api/types';
import { Attachments, FilePicker } from '../components/Attachments';
import { UploadIcon } from '../components/icons';
import { LeaseImportModal } from '../components/LeaseImportModal';
import { Amount, Field, LoadState, Modal, MoneyInput, RequiredNote, YearStepper, moneyText, useAction, useAsync } from '../components/ui';
import { money, moneyShort, niceStep, parseMoney, thisYear } from '../lib/format';

const pad = (n: number) => String(n).padStart(2, '0');
const ymLabel = (ym: string) => `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;

export type LeaseTarget = { id: number } | { yearMonth: string };

/** 아직 입력하지 않은 값 (null) */
export function Missing() {
  return <span className="missing-value">미입력</span>;
}

const amountOrMissing = (v: number | null) => (v === null ? <Missing /> : <Amount value={v} />);

/** 월별 전기료 막대 그래프. 막대 위에 금액을 적어 한눈에 비교한다. */
function ElectricityChart({ months }: { months: LeaseMonthRow[] }) {
  const values = months.map((m) => m.electricity).filter((v): v is number => v !== null);
  const peak = Math.max(1, ...values);
  const step = niceStep(peak / 4);
  const max = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) }, (_, i) => (i + 1) * step);
  const avg = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
  const top = values.length ? months.find((m) => m.electricity === Math.max(...values)) : undefined;
  return (
    <figure className="month-chart">
      <div className="chart-head">
        <h2>월별 전기료</h2>
        {avg !== null ? (
          <p>
            월평균 <b className="num">{money(avg)}원</b>
            {top && (
              <>
                {' '}· 가장 많은 달 {Number(top.yearMonth.slice(5, 7))}월 <b className="num">{money(top.electricity)}원</b>
              </>
            )}
          </p>
        ) : (
          <p>이 해에 입력된 전기료가 없습니다.</p>
        )}
      </div>
      <div className="chart-plot compact" role="img" aria-label="월별 전기료 막대 그래프. 같은 내용이 아래 표의 전기료 칸에 있습니다.">
        <div className="chart-grid" aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>
              {moneyShort(Math.round(t))}
            </span>
          ))}
        </div>
        {months.map((m) => {
          const mm = Number(m.yearMonth.slice(5, 7));
          const v = m.electricity;
          return (
            <div className="chart-col" key={m.yearMonth} tabIndex={0} aria-label={`${mm}월 전기료 ${v === null ? '미입력' : `${money(v)}원`}`}>
              <div className="chart-stack">
                {v !== null && v > 0 && (
                  <div className="chart-seg" style={{ height: `${(v / max) * 100}%`, background: 'var(--series-lease)' }} />
                )}
                {v !== null ? (
                  <span className="chart-value">{money(v)}</span>
                ) : (
                  m.id && <span className="chart-value missing">미입력</span>
                )}
              </div>
              <span className="chart-label">{mm}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

export function LeasePage() {
  const [year, setYear] = useState(thisYear());
  const table = useAsync(() => leaseApi.period({ year }), [year]);
  const fixed = useAsync(() => leaseApi.fixed(), []);
  const [editing, setEditing] = useState<LeaseTarget | null>(null);
  const [settingFixed, setSettingFixed] = useState(false);
  const [importing, setImporting] = useState(false);
  const data = table.data;
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const f = fixed.data;
  // 이 해에 처음 등록된 달 이후 이번 달까지 비어 있으면 미등록으로 표시한다 (임대 시작 전 달은 조용히)
  const firstYm = data?.months.find((m) => m.id)?.yearMonth;
  const isMissing = (ym: string) => !!firstYm && ym > firstYm && ym <= currentYm;
  const reload = () => (table.reload(), fixed.reload());

  return (
    <>
      <header className="page-head">
        <h1>임차관리비</h1>
        <div className="head-actions">
          <button className="btn btn-soft" onClick={() => setImporting(true)}>
            <UploadIcon size={18} />
            엑셀 가져오기
          </button>
          <YearStepper year={year} onChange={setYear} />
        </div>
      </header>
      <p className="page-lede">
        임대료·관리비는 고정 금액으로 매달 자동 등록됩니다. 전기료·부가세·전력기금은 청구서를 보고 달마다 입력하세요.
      </p>

      {!fixed.loading && !fixed.error && (
        <section className="fixed-card" aria-label="매달 고정 금액">
          {f ? (
            <>
              <dl>
                <div>
                  <dt>임대료</dt>
                  <dd className="num">{money(f.rent)}원</dd>
                </div>
                <div>
                  <dt>관리비</dt>
                  <dd className="num">{money(f.maintenanceFee)}원</dd>
                </div>
              </dl>
              <p className="fixed-note">
                {f.active ? (
                  <>
                    {ymLabel(f.startMonth)}부터 매달 자동 등록 중입니다.
                    {f.nextMonth && <> 다음 등록: {ymLabel(f.nextMonth)}</>}
                  </>
                ) : (
                  '자동 등록이 꺼져 있습니다.'
                )}
              </p>
              <button className="btn btn-soft" onClick={() => setSettingFixed(true)}>
                고정 금액 변경
              </button>
            </>
          ) : (
            <>
              <p className="fixed-note">임대료·관리비를 한 번 정해 두면 매달 자동으로 등록됩니다.</p>
              <button className="btn btn-primary" onClick={() => setSettingFixed(true)}>
                고정 금액 정하기
              </button>
            </>
          )}
        </section>
      )}

      <LoadState loading={table.loading && !data} error={table.error} onRetry={table.reload} />

      {data && <ElectricityChart months={data.months} />}

      {data && (
        <div className="ledger-wrap">
          <table className="ledger lease">
            <thead>
              <tr>
                <th>귀속월</th>
                <th className="r">임대료</th>
                <th className="r">관리비</th>
                <th className="r">전기료</th>
                <th className="r">부가세</th>
                <th className="r">전력기금</th>
                <th className="r">합계</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => {
                const ym = m.yearMonth;
                const mm = Number(ym.slice(5, 7));
                const open = () => setEditing(m.id ? { id: m.id } : { yearMonth: ym });
                if (!m.id) {
                  return (
                    <tr key={ym} className={`empty-row${ym === currentYm ? ' current' : ''}${isMissing(ym) ? ' missing' : ''}`} onClick={open}>
                      <td className="nowrap">{mm}월</td>
                      <td colSpan={6}>
                        <button className="row-link quiet" onClick={open}>
                          {isMissing(ym) ? '미등록, 눌러서 등록' : '등록'}
                        </button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={ym} className={`clickable${ym === currentYm ? ' current' : ''}`} onClick={open}>
                    <td className="nowrap">
                      <button className="row-link" onClick={open}>
                        {mm}월
                      </button>
                      {m.autoCreated && <span className="tag">자동</span>}
                    </td>
                    <td className="r">
                      <Amount value={m.rent} />
                    </td>
                    <td className="r">
                      <Amount value={m.maintenanceFee} />
                    </td>
                    <td className="r">{amountOrMissing(m.electricity)}</td>
                    <td className="r">{amountOrMissing(m.vat)}</td>
                    <td className="r">{amountOrMissing(m.powerFund)}</td>
                    <td className="r">
                      <Amount value={m.total} strong />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>연간</th>
                <td className="r">
                  <Amount value={data.total.rent} />
                </td>
                <td className="r">
                  <Amount value={data.total.maintenanceFee} />
                </td>
                <td className="r">
                  <Amount value={data.total.electricity} />
                </td>
                <td className="r">
                  <Amount value={data.total.vat} />
                </td>
                <td className="r">
                  <Amount value={data.total.powerFund} />
                </td>
                <td className="r">
                  <Amount value={data.total.total} strong />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editing && <LeaseModal target={editing} defaults={f ?? undefined} onClose={() => setEditing(null)} onSaved={reload} />}
      {importing && <LeaseImportModal onClose={() => setImporting(false)} onDone={reload} />}
      {settingFixed && <FixedLeaseModal initial={f ?? null} onClose={() => setSettingFixed(false)} onSaved={reload} />}
    </>
  );
}

/** 매달 같은 임대료·관리비. 서버가 시작 월부터 매달 그달 임차관리비를 만든다. */
function FixedLeaseModal({ initial, onClose, onSaved }: { initial: LeaseFixed | null; onClose: () => void; onSaved: () => void }) {
  const now = new Date();
  const [startMonth, setStartMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [rent, setRent] = useState(moneyText(initial?.rent));
  const [fee, setFee] = useState(moneyText(initial?.maintenanceFee));
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const run = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await run(
      () => leaseApi.setFixed({ rent: parseMoney(rent) ?? 0, maintenanceFee: parseMoney(fee) ?? 0, startMonth, active }),
      '고정 금액을 저장했습니다.',
    );
    setBusy(false);
    if (ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal title={initial ? '고정 금액 변경' : '고정 금액 정하기'} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <RequiredNote className="span-2" />
        <Field label="임대료" required>
          <MoneyInput value={rent} onChange={setRent} required />
        </Field>
        <Field label="관리비" required>
          <MoneyInput value={fee} onChange={setFee} required />
        </Field>
        <Field label="적용 시작 월" className="span-2" required hint="이 달부터 이 금액으로 매달 자동 등록합니다.">
          <input className="input" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} required />
        </Field>
        <label className="check span-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          매달 자동 등록
          <span className="muted">끄면 더 이상 자동으로 만들지 않습니다.</span>
        </label>
        <div className="form-actions span-2">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function LeaseModal({
  target,
  defaults,
  onClose,
  onSaved,
}: {
  target: LeaseTarget;
  /** 새 달을 등록할 때 미리 채울 고정 임대료·관리비 */
  defaults?: { rent: number; maintenanceFee: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = 'id' in target ? target.id : null;
  const detail = useAsync(() => (id ? leaseApi.get(id) : Promise.resolve(null)), [id]);
  const run = useAction();
  const lc = detail.data?.leaseCost;
  const ym = lc?.yearMonth ?? ('yearMonth' in target ? target.yearMonth : '');
  const title = ym ? `${ymLabel(ym)} 임차관리비` : '임차관리비';

  async function remove() {
    if (!id || !confirm('이 달의 임차관리비를 삭제할까요? 첨부파일도 함께 삭제됩니다.')) return;
    if (await run(() => leaseApi.remove(id), '삭제했습니다.')) {
      onSaved();
      onClose();
    }
  }

  /** 수정: 비운 칸은 clear 로 '미입력'으로 되돌린다 */
  function toPatch(fields: LeaseCostFields, before: LeaseCost): LeaseCostPatch {
    const clear: LeaseClearField[] = [];
    const patch: LeaseCostPatch = { yearMonth: fields.yearMonth, rent: fields.rent, maintenanceFee: fields.maintenanceFee };
    const optional = [
      ['electricity', 'ELECTRICITY'],
      ['vat', 'VAT'],
      ['powerFund', 'POWER_FUND'],
    ] as const;
    for (const [key, code] of optional) {
      const v = fields[key];
      if (v !== null) patch[key] = v;
      else if (before[key] !== null) clear.push(code);
    }
    if (clear.length) patch.clear = clear;
    return patch;
  }

  return (
    <Modal title={title} onClose={onClose} wide={!!id}>
      {id && !detail.data ? (
        <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload} />
      ) : (
        <div className={id ? 'modal-split' : undefined}>
          <LeaseForm
            initial={lc}
            defaults={defaults}
            yearMonth={ym}
            onDelete={id ? remove : undefined}
            onSubmit={async (fields, files) => {
              const ok =
                id && lc
                  ? await run(() => leaseApi.update(id, toPatch(fields, lc)), '저장했습니다.')
                  : await run(() => leaseApi.create(fields, files), '등록했습니다.');
              if (ok) {
                onSaved();
                onClose();
              }
            }}
          />
          {id && detail.data && (
            <aside className="modal-side">
              <Attachments items={detail.data.attachments} onAdd={(files) => leaseApi.addFiles(id, files)} onChange={detail.reload} />
            </aside>
          )}
        </div>
      )}
    </Modal>
  );
}

function LeaseForm({
  initial,
  defaults,
  yearMonth,
  onSubmit,
  onDelete,
}: {
  initial?: LeaseCost;
  defaults?: { rent: number; maintenanceFee: number };
  yearMonth: string;
  onSubmit: (f: LeaseCostFields, files: File[]) => Promise<void>;
  onDelete?: () => void;
}) {
  const [ym, setYm] = useState(yearMonth);
  const [rent, setRent] = useState(moneyText(initial?.rent ?? defaults?.rent));
  const [fee, setFee] = useState(moneyText(initial?.maintenanceFee ?? defaults?.maintenanceFee));
  const [elec, setElec] = useState(moneyText(initial?.electricity));
  const [vat, setVat] = useState(moneyText(initial?.vat));
  const [fund, setFund] = useState(moneyText(initial?.powerFund));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  // 부가세는 공급가 계(임대료 + 관리비 + 전기료)의 10%
  const supply = (parseMoney(rent) ?? 0) + (parseMoney(fee) ?? 0) + (parseMoney(elec) ?? 0);
  const sum = supply + (parseMoney(vat) ?? 0) + (parseMoney(fund) ?? 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSubmit(
      {
        yearMonth: ym,
        rent: parseMoney(rent) ?? 0,
        maintenanceFee: parseMoney(fee) ?? 0,
        electricity: parseMoney(elec),
        vat: parseMoney(vat),
        powerFund: parseMoney(fund),
      },
      files,
    );
    setBusy(false);
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <RequiredNote className="span-2" />
      <Field label="귀속월" className="span-2" required hint={initial ? '다른 달로 옮길 수 있습니다. 이미 등록된 달과 겹치면 저장되지 않습니다.' : undefined}>
        <input className="input" type="month" value={ym} onChange={(e) => setYm(e.target.value)} required />
      </Field>
      <Field label="임대료" required hint="매달 고정 금액">
        <MoneyInput value={rent} onChange={setRent} required />
      </Field>
      <Field label="관리비" required hint="매달 고정 금액">
        <MoneyInput value={fee} onChange={setFee} required />
      </Field>
      <Field label="전기료" hint="청구서를 보고 입력. 비우면 미입력">
        <MoneyInput value={elec} onChange={setElec} placeholder="미입력" />
      </Field>
      <Field
        label="부가세"
        hint={
          <button type="button" className="link" onClick={() => setVat(money(Math.floor(supply / 10)))}>
            공급가 계의 10% ({money(Math.floor(supply / 10))}원) 넣기
          </button>
        }
      >
        <MoneyInput value={vat} onChange={setVat} placeholder="미입력" />
      </Field>
      <Field label="전력기금" hint="수도광열비로 집계됩니다">
        <MoneyInput value={fund} onChange={setFund} placeholder="미입력" />
      </Field>
      <div className="field">
        <span className="field-label">청구 합계</span>
        <span className="sum-readout num">{money(sum)}원</span>
      </div>
      {!initial && (
        <Field label="첨부파일" className="span-2">
          <FilePicker files={files} onChange={setFiles} />
        </Field>
      )}
      <div className="form-actions span-2">
        {onDelete && (
          <button type="button" className="btn btn-danger-quiet" onClick={onDelete}>
            삭제
          </button>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? '저장 중…' : initial ? '저장' : '등록'}
        </button>
      </div>
    </form>
  );
}
