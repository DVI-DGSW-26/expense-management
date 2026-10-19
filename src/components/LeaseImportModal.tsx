import { useState } from 'react';
import { planLeaseImport, runLeaseImport, type LeaseImportPlan, type LeaseImportRow } from '../lib/leaseImport';
import { money } from '../lib/format';
import { readXlsx } from '../lib/xlsx';
import { Amount, Modal, useToast } from './ui';

const STATUS_LABEL: Record<LeaseImportRow['status'], string> = {
  new: '등록',
  duplicate: '건너뜀',
  error: '오류',
};

const orMissing = (v: number | null) => (v === null ? <span className="missing-value">미입력</span> : <Amount value={v} />);

const ymLabel = (ym: string) => (ym ? `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월` : '–');

/** 임차관리비 청구서 엑셀(날짜·청구월·임대료·관리비·전기료)을 달마다 등록한다 */
export function LeaseImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<LeaseImportPlan | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof runLeaseImport>> | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setPlan(null);
    setResult(null);
    setError('');
    setReading(true);
    try {
      setPlan(await planLeaseImport(await readXlsx(file)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  async function start() {
    if (!plan) return;
    setProgress({ done: 0, total: plan.rows.filter((r) => r.status === 'new').length });
    try {
      const r = await runLeaseImport(plan, (done, total) => setProgress({ done, total }));
      setResult(r);
      toast(`임차관리비 ${r.created}개월을 등록했습니다.${r.failed.length ? ` ${r.failed.length}건은 실패했습니다.` : ''}`, r.failed.length ? 'error' : 'ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      onDone();
    }
  }

  const count = (s: LeaseImportRow['status']) => plan?.rows.filter((r) => r.status === s).length ?? 0;
  const busy = reading || progress !== null;

  return (
    <Modal title="엑셀로 임차관리비 가져오기" onClose={busy ? () => {} : onClose} wide>
      <div className="stack">
        <p className="import-help">
          머리글에 <b>날짜 · 청구월 · 임대료 · 관리비 · 전기료 · VAT · 전력기금</b>이 있는 엑셀(.xlsx)을 고르세요. 한 줄이 한 달이며, 이미 등록된 달은
          건너뜁니다. VAT·전력기금도 함께 저장되고, 빈칸은 '미입력'으로 등록됩니다.
        </p>

        {!result && (
          <label className={`import-drop${busy ? ' disabled' : ''}`}>
            <input type="file" accept=".xlsx" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
            <span className="import-drop-title">{fileName || '엑셀 파일 고르기'}</span>
            <span className="muted">{reading ? '파일을 읽는 중…' : fileName ? '다른 파일을 고르려면 누르세요' : '.xlsx 파일'}</span>
          </label>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {plan && !result && (
          <>
            <div className="import-summary">
              <span className="pill pill-new">등록 {count('new')}개월</span>
              {count('duplicate') > 0 && <span className="pill">이미 있어 건너뜀 {count('duplicate')}개월</span>}
              {count('error') > 0 && <span className="pill pill-error">오류 {count('error')}건</span>}
              <span className="muted">'{plan.sheetName}' 시트</span>
            </div>


            <div className="ledger-wrap import-preview">
              <table className="ledger compact">
                <thead>
                  <tr>
                    <th>행</th>
                    <th>귀속월</th>
                    <th className="r">임대료</th>
                    <th className="r">관리비</th>
                    <th className="r">전기료</th>
                    <th className="r">VAT</th>
                    <th className="r">전력기금</th>
                    <th className="r">청구 합계</th>
                    <th>처리</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.line} className={r.status === 'new' ? undefined : 'dim'}>
                      <td className="num muted">{r.line}</td>
                      <td className="nowrap">{ymLabel(r.yearMonth)}</td>
                      <td className="r">
                        <Amount value={r.rent} />
                      </td>
                      <td className="r">
                        <Amount value={r.maintenanceFee} />
                      </td>
                      <td className="r">{orMissing(r.electricity)}</td>
                      <td className="r">{orMissing(r.vat)}</td>
                      <td className="r">{orMissing(r.powerFund)}</td>
                      <td className="r muted">{r.billTotal === null ? '–' : money(r.billTotal)}</td>
                      <td className="nowrap" title={r.problem}>
                        <span className={`pill pill-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                        {r.problem && <div className={r.status === 'error' ? 'row-problem' : 'row-note'}>{r.problem}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {progress && (
              <div className="progress" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
                <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
                <span>
                  {progress.done} / {progress.total}개월 등록 중…
                </span>
              </div>
            )}

            <div className="form-actions">
              <button className="btn" onClick={onClose} disabled={busy}>
                {count('new') === 0 ? '닫기' : '취소'}
              </button>
              <button className="btn btn-primary" onClick={start} disabled={busy || count('new') === 0}>
                {count('new') === 0 ? '등록할 달 없음' : `${count('new')}개월 등록`}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className="import-summary">
              <span className="pill pill-new">등록 완료 {result.created}개월</span>
              {result.failed.length > 0 && <span className="pill pill-error">실패 {result.failed.length}건</span>}
            </div>
            {result.failed.length > 0 && (
              <ul className="import-failed">
                {result.failed.map((f) => (
                  <li key={f.row.line}>
                    {f.row.line}행 {ymLabel(f.row.yearMonth)}: {f.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="form-actions">
              <button className="btn btn-primary" onClick={onClose}>
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
