import { useState, type FormEvent } from 'react';
import { leaseApi } from '../api/endpoints';
import type { LeaseCost, LeaseMonth } from '../api/types';
import { Attachments, FilePicker } from '../components/Attachments';
import { Amount, Field, LoadState, Modal, MoneyInput, RequiredNote, YearStepper, moneyText, useAction, useAsync } from '../components/ui';
import { money, parseMoney, thisYear } from '../lib/format';
import { fillLeaseMonths, fixedLease, setFixedLease, type FixedLease } from '../lib/leaseAuto';

const pad = (n: number) => String(n).padStart(2, '0');

/** 응답의 월 행에서 월 번호를 얻는다 (month 또는 yearMonth, 없으면 순서) */
export function monthOf(m: LeaseMonth, index: number) {
  if (m.month) return m.month;
  if (m.yearMonth) return Number(m.yearMonth.slice(5, 7));
  return index + 1;
}

export type LeaseTarget = { id: number } | { yearMonth: string };

export function LeasePage() {
  const [year, setYear] = useState(thisYear());
  // 고정 금액으로 빈 달을 먼저 채운 뒤 조회한다
  const table = useAsync(() => fillLeaseMonths().then(() => leaseApi.year(year)), [year]);
  const fixed = useAsync(() => fixedLease(), []);
  const [editing, setEditing] = useState<LeaseTarget | null>(null);
  const [settingFixed, setSettingFixed] = useState(false);
  const data = table.data;
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const f = fixed.data;

  return (
    <>
      <header className="page-head">
        <h1>임차관리비</h1>
        <YearStepper year={year} onChange={setYear} />
      </header>
      <p className="page-lede">임대료·관리비는 매달 같은 금액으로 자동 등록됩니다. 전기료만 달마다 입력하세요.</p>

      {!fixed.loading && (
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
                {f.rent === 0 && f.maintenanceFee === 0
                  ? '고정 금액이 0원이라 자동 등록을 멈췄습니다.'
                  : `${ymLabel(f.since)}부터 매달 자동 등록 중입니다.`}
              </p>
              <button className="btn btn-soft" onClick={() => setSettingFixed(true)}>
                고정 금액 변경
              </button>
            </>
          ) : (
            <>
              <p className="fixed-note">
                임대료·관리비를 한 번 정해 두면 매달 자동으로 등록됩니다.
              </p>
              <button className="btn btn-primary" onClick={() => setSettingFixed(true)}>
                고정 금액 정하기
              </button>
            </>
          )}
        </section>
      )}

      <LoadState loading={table.loading && !data} error={table.error} onRetry={table.reload} />

      {data && (
        <div className="ledger-wrap">
          <table className="ledger lease">
            <thead>
              <tr>
                <th>귀속월</th>
                <th className="r">임대료</th>
                <th className="r">관리비</th>
                <th className="r">전기료</th>
                <th className="r">합계</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m, i) => {
                const mm = monthOf(m, i);
                const ym = `${data.year}-${pad(mm)}`;
                const open = () => setEditing(m.id ? { id: m.id } : { yearMonth: ym });
                if (!m.id) {
                  return (
                    <tr key={mm} className={`empty-row${ym === currentYm ? ' current' : ''}${ym <= currentYm ? ' missing' : ''}`} onClick={open}>
                      <td className="nowrap">{mm}월</td>
                      <td colSpan={4}>
                        <button className="row-link quiet" onClick={open}>
                          {ym <= currentYm ? '미등록, 눌러서 등록' : '등록'}
                        </button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={mm} className={`clickable${ym === currentYm ? ' current' : ''}`} onClick={open}>
                    <td className="nowrap">
                      <button className="row-link" onClick={open}>
                        {mm}월
                      </button>
                    </td>
                    <td className="r">
                      <Amount value={m.rent} />
                    </td>
                    <td className="r">
                      <Amount value={m.maintenanceFee} />
                    </td>
                    <td className="r">
                      {m.electricity ? <Amount value={m.electricity} /> : <span className="missing-value">미입력</span>}
                    </td>
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
                  <Amount value={data.yearTotal.rent} />
                </td>
                <td className="r">
                  <Amount value={data.yearTotal.maintenanceFee} />
                </td>
                <td className="r">
                  <Amount value={data.yearTotal.electricity} />
                </td>
                <td className="r">
                  <Amount value={data.yearTotal.total} strong />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editing && (
        <LeaseModal
          target={editing}
          defaults={f ?? undefined}
          onClose={() => setEditing(null)}
          onSaved={() => (table.reload(), fixed.reload())}
        />
      )}
      {settingFixed && (
        <FixedLeaseModal
          initial={f}
          onClose={() => setSettingFixed(false)}
          onSaved={() => (table.reload(), fixed.reload())}
        />
      )}
    </>
  );
}

const ymLabel = (ym: string) => `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;

/** 매달 같은 임대료·관리비를 정한다. 적용 시작 월부터 등록된 달을 고치고, 이번 달까지 빈 달을 등록한다. */
function FixedLeaseModal({ initial, onClose, onSaved }: { initial: FixedLease | null; onClose: () => void; onSaved: () => void }) {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [rent, setRent] = useState(moneyText(initial?.rent));
  const [fee, setFee] = useState(moneyText(initial?.maintenanceFee));
  const [busy, setBusy] = useState(false);
  const run = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await run(() => setFixedLease(from, parseMoney(rent) ?? 0, parseMoney(fee) ?? 0), '고정 금액을 저장했습니다.');
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
        <Field
          label="적용 시작 월"
          className="span-2"
          required
          hint="이 달부터 등록된 달의 임대료·관리비를 바꾸고, 이번 달까지 빈 달은 새로 등록합니다. 전기료는 그대로 둡니다."
        >
          <input className="input" type="month" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <p className="note span-2">0원으로 정하면 다음 달부터 자동 등록을 멈춥니다.</p>
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
  const title = ym ? `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월 임차관리비` : '임차관리비';

  async function remove() {
    if (!id || !confirm('이 달의 임차관리비를 삭제할까요? 첨부파일도 함께 삭제됩니다.')) return;
    if (await run(() => leaseApi.remove(id), '삭제했습니다.')) {
      onSaved();
      onClose();
    }
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
              const ok = id
                ? await run(() => leaseApi.update(id, fields), '저장했습니다.')
                : await run(() => leaseApi.create(fields, files), '등록했습니다.');
              if (ok) {
                onSaved();
                onClose();
              }
            }}
          />
          {id && detail.data && (
            <aside className="modal-side">
              <Attachments
                items={detail.data.attachments}
                onAdd={(files) => leaseApi.addFiles(id, files)}
                onChange={detail.reload}
              />
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
  onSubmit: (f: { yearMonth: string; rent: number; maintenanceFee: number; electricity: number }, files: File[]) => Promise<void>;
  onDelete?: () => void;
}) {
  const [ym, setYm] = useState(yearMonth);
  const [rent, setRent] = useState(moneyText(initial?.rent ?? defaults?.rent));
  const [fee, setFee] = useState(moneyText(initial?.maintenanceFee ?? defaults?.maintenanceFee));
  // 자동 등록된 달은 전기료가 0원(미입력)이므로 빈칸으로 둔다
  const [elec, setElec] = useState(initial?.electricity ? moneyText(initial.electricity) : '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const sum = (parseMoney(rent) ?? 0) + (parseMoney(fee) ?? 0) + (parseMoney(elec) ?? 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSubmit(
      { yearMonth: ym, rent: parseMoney(rent) ?? 0, maintenanceFee: parseMoney(fee) ?? 0, electricity: parseMoney(elec) ?? 0 },
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
      <Field label="전기료" required hint="달마다 직접 입력">
        <MoneyInput value={elec} onChange={setElec} placeholder="이번 달 전기료" required />
      </Field>
      <div className="field">
        <span className="field-label">합계</span>
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
