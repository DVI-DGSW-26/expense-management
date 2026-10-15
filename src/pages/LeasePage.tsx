import { useState, type FormEvent } from 'react';
import { leaseApi } from '../api/endpoints';
import type { LeaseCost, LeaseMonth } from '../api/types';
import { Attachments, FilePicker } from '../components/Attachments';
import { Amount, Field, LoadState, Modal, MoneyInput, YearStepper, moneyText, useAction, useAsync } from '../components/ui';
import { money, parseMoney, thisYear } from '../lib/format';

const pad = (n: number) => String(n).padStart(2, '0');

/** 응답의 월 행에서 월 번호를 얻는다 (month 또는 yearMonth, 없으면 순서) */
function monthOf(m: LeaseMonth, index: number) {
  if (m.month) return m.month;
  if (m.yearMonth) return Number(m.yearMonth.slice(5, 7));
  return index + 1;
}

type Editing = { id: number } | { yearMonth: string };

export function LeasePage() {
  const [year, setYear] = useState(thisYear());
  const table = useAsync(() => leaseApi.year(year), [year]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const data = table.data;
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  return (
    <>
      <header className="page-head">
        <h1>임차관리비</h1>
        <YearStepper year={year} onChange={setYear} />
      </header>
      <p className="page-lede">임차비, 관리비, 전기세를 달마다 한 줄로 기록합니다. 빈 달을 눌러 등록하세요.</p>

      <LoadState loading={table.loading && !data} error={table.error} onRetry={table.reload} />

      {data && (
        <div className="ledger-wrap">
          <table className="ledger lease">
            <thead>
              <tr>
                <th>귀속월</th>
                <th className="r">임차비</th>
                <th className="r">관리비</th>
                <th className="r">전기세</th>
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
                      <Amount value={m.electricity} />
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

      {editing && <LeaseModal target={editing} onClose={() => setEditing(null)} onSaved={table.reload} />}
    </>
  );
}

function LeaseModal({ target, onClose, onSaved }: { target: Editing; onClose: () => void; onSaved: () => void }) {
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
  yearMonth,
  onSubmit,
  onDelete,
}: {
  initial?: LeaseCost;
  yearMonth: string;
  onSubmit: (f: { yearMonth: string; rent: number; maintenanceFee: number; electricity: number }, files: File[]) => Promise<void>;
  onDelete?: () => void;
}) {
  const [ym, setYm] = useState(yearMonth);
  const [rent, setRent] = useState(moneyText(initial?.rent));
  const [fee, setFee] = useState(moneyText(initial?.maintenanceFee));
  const [elec, setElec] = useState(moneyText(initial?.electricity));
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
      <Field label="귀속월" className="span-2" hint={initial ? '다른 달로 옮길 수 있습니다. 이미 등록된 달과 겹치면 저장되지 않습니다.' : undefined}>
        <input className="input" type="month" value={ym} onChange={(e) => setYm(e.target.value)} required />
      </Field>
      <Field label="임차비">
        <MoneyInput value={rent} onChange={setRent} required />
      </Field>
      <Field label="관리비">
        <MoneyInput value={fee} onChange={setFee} required />
      </Field>
      <Field label="전기세">
        <MoneyInput value={elec} onChange={setElec} required />
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
