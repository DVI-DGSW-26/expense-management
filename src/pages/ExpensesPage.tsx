import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { expenseApi } from '../api/endpoints';
import type { Expense, ExpenseFields } from '../api/types';
import { AccountSelect, useAccounts } from '../components/accounts';
import { Attachments, FilePicker } from '../components/Attachments';
import { Amount, Field, LoadState, Modal, MoneyInput, moneyText, useAction, useAsync } from '../components/ui';
import { money, parseMoney, thisYear, todayIso } from '../lib/format';
import { loadLedger, rangeBounds, rangeLabel, type Kind, type LeaseRow, type Range } from '../lib/ledger';
import { LeaseModal, type LeaseTarget } from './LeasePage';

const KIND_LABEL: Record<Kind, string> = {
  '': '전체',
  MANUAL: '직접 등록',
  SUBSCRIPTION: '구독 결제',
  LEASE: '임차관리비',
};

export function ExpensesPage() {
  // 집계 화면에서 넘어오면 ?year=…&account=… 로 연간 조회
  const [params] = useSearchParams();
  const now = new Date();
  const [mode, setMode] = useState<'month' | 'period'>('month');
  const [year, setYear] = useState(Number(params.get('year')) || thisYear());
  const [month, setMonth] = useState<number | ''>(params.has('year') ? '' : now.getMonth() + 1);
  const [from, setFrom] = useState(`${thisYear()}-01-01`);
  const [to, setTo] = useState(todayIso());
  const [vendorInput, setVendorInput] = useState('');
  const [vendor, setVendor] = useState('');
  const [accountId, setAccountId] = useState(params.get('account') ?? '');
  const [kind, setKind] = useState<Kind>('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [leaseEditing, setLeaseEditing] = useState<LeaseTarget | null>(null);
  const [openLease, setOpenLease] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const run = useAction();
  const { accounts } = useAccounts();

  // 거래처 검색은 입력이 멈춘 뒤에 조회
  useEffect(() => {
    const t = setTimeout(() => setVendor(vendorInput.trim()), 300);
    return () => clearTimeout(t);
  }, [vendorInput]);

  const range: Range = mode === 'month' ? { mode, year, month: month || null } : { mode, from, to };
  const ledger = useAsync(
    () => loadLedger({ range, vendor, accountId: accountId ? Number(accountId) : null, kind }),
    [mode, year, month, from, to, vendor, accountId, kind],
  );
  const data = ledger.data;

  const years = Array.from({ length: 6 }, (_, i) => thisYear() - 4 + i);

  async function exportPdf() {
    if (!data) return;
    const conditions = [
      `조회 기간 ${rangeLabel(range)}`,
      kind && `구분 ${KIND_LABEL[kind]}`,
      vendor && `거래처 '${vendor}'`,
      accountId && `차변계정 ${accounts.find((a) => String(a.id) === accountId)?.name ?? ''}`,
    ]
      .filter(Boolean)
      .join(', ');
    const { from: f, to: t } = rangeBounds(range);
    setExporting(true);
    await run(async () => {
      const { downloadLedgerPdf } = await import('../lib/pdf');
      await downloadLedgerPdf(data, {
        title: `경비 내역 (${rangeLabel(range)})`,
        conditions: `${conditions}. ${todayIso()} 출력`,
        fileName: `경비내역_${f}_${t}.pdf`,
      });
    });
    setExporting(false);
  }

  return (
    <>
      <header className="page-head">
        <h1>경비</h1>
        <div className="head-actions">
          <button className="btn" onClick={exportPdf} disabled={!data || data.rows.length === 0 || exporting}>
            {exporting ? 'PDF 만드는 중…' : 'PDF 다운로드'}
          </button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            경비 등록
          </button>
        </div>
      </header>

      <div className="filter-bar">
        <div className="segmented" role="group" aria-label="조회 방식">
          <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>
            연·월
          </button>
          <button type="button" aria-pressed={mode === 'period'} onClick={() => setMode('period')}>
            기간 설정
          </button>
        </div>
        {mode === 'month' ? (
          <>
            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="연도">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select
              className="input"
              value={month}
              onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}
              aria-label="월"
            >
              <option value="">전체 월</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}월
                </option>
              ))}
            </select>
          </>
        ) : (
          <div className="period">
            <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="시작일" />
            <span aria-hidden>~</span>
            <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="종료일" />
          </div>
        )}
      </div>
      <div className="filter-bar secondary">
        <input
          className="input"
          type="search"
          placeholder="거래처 검색"
          value={vendorInput}
          onChange={(e) => setVendorInput(e.target.value)}
        />
        <AccountSelect value={accountId} onChange={setAccountId} emptyLabel="모든 차변계정" />
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="구분">
          <option value="">경비 + 임차관리비</option>
          <option value="MANUAL">직접 등록 경비만</option>
          <option value="SUBSCRIPTION">구독 결제분만</option>
          <option value="LEASE">임차관리비만</option>
        </select>
      </div>

      {data && (
        <dl className="tally">
          <div>
            <dt>경비 건수</dt>
            <dd className="num">{money(data.expenseCount)}</dd>
          </div>
          <div>
            <dt>공급가액</dt>
            <dd>
              <Amount value={data.supply} />
            </dd>
          </div>
          <div>
            <dt>세액</dt>
            <dd>
              <Amount value={data.tax} />
            </dd>
          </div>
          <div>
            <dt>경비 합계</dt>
            <dd>
              <Amount value={data.expenseTotal} />
            </dd>
          </div>
          <div>
            <dt>임차관리비</dt>
            <dd>
              <Amount value={data.leaseTotal} />
            </dd>
          </div>
          <div className="tally-total">
            <dt>총 합계</dt>
            <dd>
              <Amount value={data.grandTotal} strong />
            </dd>
          </div>
        </dl>
      )}

      <LoadState loading={ledger.loading && !data} error={ledger.error} onRetry={ledger.reload} />

      {data && data.rows.length === 0 && (
        <div className="state">
          <p>{rangeLabel(range)}에 이 조건으로 등록된 내역이 없습니다.</p>
          <button className="btn" onClick={() => setEditing('new')}>
            경비 등록
          </button>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="ledger-wrap">
          <table className="ledger expense-ledger">
            <thead>
              <tr>
                <th>연도</th>
                <th>일자</th>
                <th>거래처</th>
                <th>품명</th>
                <th className="r">공급가액</th>
                <th className="r">세액</th>
                <th className="r">합계</th>
                <th>차변계정</th>
                <th>첨부파일</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) =>
                r.type === 'expense' ? (
                  <ExpenseRow key={`e${r.e.id}`} x={r.e} onOpen={() => setEditing(r.e.id)} />
                ) : (
                  <LeaseRows
                    key={`l${r.l.id}`}
                    l={r.l}
                    open={openLease === r.l.id}
                    onToggle={() => setOpenLease(openLease === r.l.id ? null : r.l.id)}
                    onEdit={() => setLeaseEditing({ id: r.l.id })}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <ExpenseModal id={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={ledger.reload} />
      )}
      {leaseEditing && (
        <LeaseModal target={leaseEditing} onClose={() => setLeaseEditing(null)} onSaved={ledger.reload} />
      )}
    </>
  );
}

function ExpenseRow({ x, onOpen }: { x: Expense; onOpen: () => void }) {
  const [y, m, d] = x.expenseDate.split('-');
  return (
    <tr className="clickable" onClick={onOpen}>
      <td className="num nowrap muted">{y}</td>
      <td className="num nowrap">
        {Number(m)}.{Number(d)}
      </td>
      <td>
        <button className="row-link" onClick={onOpen}>
          {x.vendor}
        </button>
      </td>
      <td className="muted-cell">
        {x.itemName}
        {x.source === 'SUBSCRIPTION' && <span className="tag">구독</span>}
      </td>
      <td className="r">
        <Amount value={x.supplyAmount} />
      </td>
      <td className="r">
        <Amount value={x.taxAmount} />
      </td>
      <td className="r">
        <Amount value={x.totalAmount} strong />
      </td>
      <td className="nowrap">{x.debitAccountName}</td>
      <td className="nowrap">
        {x.attachmentCount > 0 ? (
          <span className="attach-count">{x.attachmentCount}개</span>
        ) : (
          <span className="attach-add">올리기</span>
        )}
      </td>
    </tr>
  );
}

/** 임차관리비 한 달: 묶음 한 줄, 누르면 임대료(임차비+관리비)와 전기료로 펼친다 */
function LeaseRows({ l, open, onToggle, onEdit }: { l: LeaseRow; open: boolean; onToggle: () => void; onEdit: () => void }) {
  const [y, m] = l.yearMonth.split('-');
  return (
    <Fragment>
      <tr className={`clickable lease-row${open ? ' open' : ''}`} onClick={onToggle}>
        <td className="num nowrap muted">{y}</td>
        <td className="nowrap">{Number(m)}월분</td>
        <td className="muted">–</td>
        <td>
          <button className="row-link disclosure" aria-expanded={open} onClick={(e) => (e.stopPropagation(), onToggle())}>
            임차관리비
          </button>
        </td>
        <td className="r muted">–</td>
        <td className="r muted">–</td>
        <td className="r">
          <Amount value={l.total} strong />
        </td>
        <td className="muted">–</td>
        <td className="nowrap">
          <button className="link" onClick={(e) => (e.stopPropagation(), onEdit())}>
            수정·첨부
          </button>
        </td>
      </tr>
      {open && (
        <>
          <tr className="lease-part">
            <td colSpan={3} />
            <td>
              임대료
              <span className="part-detail num">
                임차비 {money(l.rent)} + 관리비 {money(l.maintenanceFee)}
              </span>
            </td>
            <td colSpan={2} />
            <td className="r">
              <Amount value={l.rent + l.maintenanceFee} />
            </td>
            <td colSpan={2} />
          </tr>
          <tr className="lease-part">
            <td colSpan={3} />
            <td>전기료</td>
            <td colSpan={2} />
            <td className="r">
              <Amount value={l.electricity} />
            </td>
            <td colSpan={2} />
          </tr>
        </>
      )}
    </Fragment>
  );
}

function ExpenseModal({ id, onClose, onSaved }: { id: number | null; onClose: () => void; onSaved: () => void }) {
  const detail = useAsync(() => (id ? expenseApi.get(id) : Promise.resolve(null)), [id]);
  const run = useAction();
  const e = detail.data?.expense;

  async function remove() {
    if (!id || !confirm('이 경비를 삭제할까요? 첨부파일도 함께 삭제됩니다.')) return;
    if (await run(() => expenseApi.remove(id), '경비를 삭제했습니다.')) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal title={id ? '경비 수정' : '경비 등록'} onClose={onClose} wide={!!id}>
      {id && !detail.data ? (
        <LoadState loading={detail.loading} error={detail.error} onRetry={detail.reload} />
      ) : (
        <div className={id ? 'modal-split' : undefined}>
          <ExpenseForm
            initial={e}
            onSubmit={async (fields, files) => {
              const ok = id
                ? await run(() => expenseApi.update(id, fields), '경비를 저장했습니다.')
                : await run(() => expenseApi.create(fields, files), '경비를 등록했습니다.');
              if (ok) {
                onSaved();
                onClose();
              }
            }}
            footer={
              id && (
                <button type="button" className="btn btn-danger-quiet" onClick={remove}>
                  삭제
                </button>
              )
            }
          />
          {id && detail.data && (
            <aside className="modal-side">
              {e?.source === 'SUBSCRIPTION' && (
                <p className="note">
                  구독 결제분으로 자동 생성된 경비입니다. 여기서 고쳐도 구독 설정은 바뀌지 않습니다.{' '}
                  <Link to="/subscriptions" onClick={onClose}>
                    구독 보기
                  </Link>
                </p>
              )}
              <Attachments
                items={detail.data.attachments}
                onAdd={(files) => expenseApi.addFiles(id, files)}
                onChange={() => {
                  detail.reload();
                  onSaved();
                }}
              />
              {e?.createdBy && (
                <p className="audit">
                  {e.createdBy} 등록
                  {e.updatedBy && e.updatedAt !== e.createdAt ? `, ${e.updatedBy} 수정` : ''}
                </p>
              )}
            </aside>
          )}
        </div>
      )}
    </Modal>
  );
}

function ExpenseForm({
  initial,
  onSubmit,
  footer,
}: {
  initial?: Expense;
  onSubmit: (fields: ExpenseFields, files: File[]) => Promise<void>;
  footer?: ReactNode;
}) {
  const [date, setDate] = useState(initial?.expenseDate ?? todayIso());
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [itemName, setItemName] = useState(initial?.itemName ?? '');
  const [supply, setSupply] = useState(moneyText(initial?.supplyAmount));
  const [tax, setTax] = useState(moneyText(initial?.taxAmount));
  const [total, setTotal] = useState(
    initial && initial.totalAmount !== initial.supplyAmount + initial.taxAmount ? moneyText(initial.totalAmount) : '',
  );
  const [accountId, setAccountId] = useState(initial ? String(initial.debitAccountId) : '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const supplyN = parseMoney(supply);
  const taxN = parseMoney(tax);
  const autoTotal = supplyN !== null ? supplyN + (taxN ?? 0) : null;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (supplyN === null || !accountId) return;
    setBusy(true);
    await onSubmit(
      {
        expenseDate: date,
        vendor: vendor.trim(),
        itemName: itemName.trim(),
        supplyAmount: supplyN,
        taxAmount: taxN ?? 0,
        // 비워 두면 공급가액 + 세액
        totalAmount: parseMoney(total) ?? autoTotal ?? undefined,
        debitAccountId: Number(accountId),
      },
      files,
    );
    setBusy(false);
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <Field label="일자">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      <Field label="차변계정">
        <AccountSelect value={accountId} onChange={setAccountId} required emptyLabel="계정 선택" allowCreate />
      </Field>
      <Field label="거래처" className="span-2">
        <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} required />
      </Field>
      <Field label="품명" className="span-2">
        <input className="input" value={itemName} onChange={(e) => setItemName(e.target.value)} required />
      </Field>
      <Field label="공급가액" hint="반품·취소는 음수(-)로 입력">
        <MoneyInput value={supply} onChange={setSupply} required allowNegative />
      </Field>
      <Field label="세액" hint="면세면 0">
        <MoneyInput
          value={tax}
          onChange={setTax}
          allowNegative
          placeholder="0"
        />
      </Field>
      <Field label="합계" className="span-2" hint="비워 두면 공급가액 + 세액으로 저장합니다.">
        <MoneyInput value={total} onChange={setTotal} allowNegative placeholder={autoTotal !== null ? money(autoTotal) : ''} />
      </Field>
      {supplyN !== null && !tax && (
        <p className="span-2 field-hint">
          세액 10%를 넣으려면{' '}
          <button type="button" className="link" onClick={() => setTax(money(Math.round(supplyN / 10)))}>
            {money(Math.round(supplyN / 10))}원 입력
          </button>
        </p>
      )}
      {!initial && (
        <Field label="첨부파일" className="span-2">
          <FilePicker files={files} onChange={setFiles} />
        </Field>
      )}
      <div className="form-actions span-2">
        {footer}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? '저장 중…' : initial ? '저장' : '등록'}
        </button>
      </div>
    </form>
  );
}
