import { useState } from 'react';
import { planImport, runImport, type ImportPlan, type ImportRow } from '../lib/expenseImport';
import { money } from '../lib/format';
import { isLeaseWorkbook } from '../lib/leaseImport';
import { readXlsx } from '../lib/xlsx';
import { useAccounts } from './accounts';
import { Amount, Modal, useToast } from './ui';

const STATUS_LABEL: Record<ImportRow['status'], string> = {
  new: '등록',
  duplicate: '건너뜀',
  error: '오류',
};

/** 엑셀의 경비 목록을 한 번에 등록한다 */
export function ImportModal({
  onClose,
  onDone,
  onShowRange,
}: {
  onClose: () => void;
  onDone: () => void;
  /** 경비 화면을 엑셀 기간으로 바꿔 보여 준다 */
  onShowRange: (from: string, to: string) => void;
}) {
  const { accounts, reload: reloadAccounts } = useAccounts();
  const toast = useToast();
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof runImport>> | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setPlan(null);
    setResult(null);
    setError('');
    setReading(true);
    try {
      const sheets = await readXlsx(file);
      try {
        setPlan(await planImport(sheets, accounts));
      } catch (e) {
        // 임차관리비 청구서 엑셀이면 어디서 가져오는지 알려 준다
        if (isLeaseWorkbook(sheets)) throw new Error("임차관리비 엑셀입니다. '임차관리비' 화면의 '엑셀 가져오기'에서 가져오세요.");
        throw e;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  async function start() {
    if (!plan) return;
    const count = plan.rows.filter((r) => r.status === 'new').length;
    setProgress({ done: 0, total: count });
    try {
      const r = await runImport(plan, accounts, (done, total) => setProgress({ done, total }));
      setResult(r);
      toast(`경비 ${r.created}건을 등록했습니다.${r.failed.length ? ` ${r.failed.length}건은 실패했습니다.` : ''}`, r.failed.length ? 'error' : 'ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
      reloadAccounts();
      onDone();
    }
  }

  const counts = plan
    ? {
        new: plan.rows.filter((r) => r.status === 'new').length,
        duplicate: plan.rows.filter((r) => r.status === 'duplicate').length,
        error: plan.rows.filter((r) => r.status === 'error').length,
      }
    : null;
  const busy = reading || progress !== null;

  const showRange = plan?.range && (
    <button
      type="button"
      className="btn btn-soft"
      onClick={() => {
        onShowRange(plan.range!.from, plan.range!.to);
        onClose();
      }}
    >
      가져온 기간 보기 ({plan.range.from.replaceAll('-', '.')} ~ {plan.range.to.replaceAll('-', '.')})
    </button>
  );

  return (
    <Modal title="엑셀로 경비 가져오기" onClose={busy ? () => {} : onClose} wide>
      <div className="stack">
        <p className="import-help">
          머리글에 <b>일자 · 거래처 · 품명 · 공급가액 · 세액 · 합계 · 차변계정</b>이 있는 엑셀(.xlsx)을 고르세요. 등록하기 전에
          미리보기로 확인할 수 있고, 이미 등록된 경비는 건너뜁니다.
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

        {plan && counts && !result && (
          <>
            <div className="import-summary">
              <span className="pill pill-new">등록 {counts.new}건</span>
              {counts.duplicate > 0 && <span className="pill">이미 있어 건너뜀 {counts.duplicate}건</span>}
              {counts.error > 0 && <span className="pill pill-error">오류 {counts.error}건</span>}
              <span className="muted">'{plan.sheetName}' 시트</span>
            </div>

            {counts.new === 0 && counts.duplicate > 0 && (
              <div className="note">
                <p>
                  이 엑셀의 경비는 모두 이미 등록되어 있습니다. 경비 화면은 처음에 이번 달만 보여 주므로, 아래 <b>가져온 기간 보기</b>를
                  누르면 등록된 내역을 바로 볼 수 있습니다.
                </p>
                <div className="note-actions">{showRange}</div>
              </div>
            )}

            {(plan.newAccounts.length > 0 || plan.matchedAccounts.length > 0) && (
              <div className="note">
                {plan.newAccounts.length > 0 && (
                  <p>
                    새로 만들 차변계정: <b>{plan.newAccounts.join(', ')}</b>
                  </p>
                )}
                {plan.matchedAccounts.map((m) => (
                  <p key={m.from}>
                    '{m.from}' → 기존 계정 '{m.to.name}'(으)로 등록
                  </p>
                ))}
              </div>
            )}

            <div className="ledger-wrap import-preview">
              <table className="ledger compact">
                <thead>
                  <tr>
                    <th>행</th>
                    <th>일자</th>
                    <th>거래처</th>
                    <th>품명</th>
                    <th className="r">공급가액</th>
                    <th className="r">세액</th>
                    <th className="r">합계</th>
                    <th>차변계정</th>
                    <th>처리</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.line} className={r.status === 'new' ? undefined : 'dim'}>
                      <td className="num muted">{r.line}</td>
                      <td className="num nowrap">{r.expenseDate || '–'}</td>
                      <td>{r.vendor}</td>
                      <td>{r.itemName}</td>
                      <td className="r">
                        <Amount value={r.supplyAmount} />
                      </td>
                      <td className="r">
                        <Amount value={r.taxAmount} />
                      </td>
                      <td className="r" title={r.totalMismatch ? '합계가 공급가액 + 세액과 다릅니다. 엑셀 값 그대로 저장합니다.' : undefined}>
                        <Amount value={r.totalAmount} strong />
                        {r.totalMismatch && <span className="mismatch"> *</span>}
                      </td>
                      <td className="nowrap">{r.accountName}</td>
                      <td className="nowrap" title={r.problem}>
                        <span className={`pill pill-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                        {r.problem && r.status !== 'new' && (
                          <div className={r.status === 'error' ? 'row-problem' : 'row-note'}>{r.problem}</div>
                        )}
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
                  {progress.done} / {progress.total}건 등록 중…
                </span>
              </div>
            )}

            <div className="form-actions">
              {!busy && counts.new > 0 && showRange}
              <button className="btn" onClick={onClose} disabled={busy}>
                {counts.new === 0 ? '닫기' : '취소'}
              </button>
              <button className="btn btn-primary" onClick={start} disabled={busy || counts.new === 0}>
                {counts.new === 0 ? '등록할 경비 없음' : `${counts.new}건 등록`}
              </button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className="import-summary">
              <span className="pill pill-new">등록 완료 {result.created}건</span>
              {result.failed.length > 0 && <span className="pill pill-error">실패 {result.failed.length}건</span>}
            </div>
            {result.failed.length > 0 && (
              <ul className="import-failed">
                {result.failed.map((f) => (
                  <li key={f.row.line}>
                    {f.row.line}행 {f.row.vendor} {f.row.itemName} ({money(f.row.totalAmount)}원): {f.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="form-actions">
              {showRange}
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
