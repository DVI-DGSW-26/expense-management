import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { expenseApi } from '../api/endpoints';
import type { Expense, ExpenseFields } from '../api/types';
import { AccountSelect, useAccounts } from '../components/accounts';
import { DownloadIcon, PlusIcon, ResetIcon, UploadIcon } from '../components/icons';
import { ImportModal } from '../components/ImportModal';
import { Attachments, FilePicker } from '../components/Attachments';
import { Amount, Field, LoadState, Modal, MoneyInput, RequiredNote, moneyText, useAction, useAsync } from '../components/ui';
import { money, parseMoney, thisYear, todayIso } from '../lib/format';
import {
  DEFAULT_SORT,
  FIRST_DIR,
  SORT_LABEL,
  loadLedger,
  rangeBounds,
  rangeLabel,
  selectableYears,
  sortRows,
  type Kind,
  type LeaseRow,
  type Range,
  type Sort,
  type SortKey,
} from '../lib/ledger';
import { LeaseModal, type LeaseTarget } from './LeasePage';

const KIND_LABEL: Record<Kind, string> = {
  '': '전체',
  MANUAL: '직접 등록',
  SUBSCRIPTION: '구독 결제',
  LEASE: '임차관리비',
};

export function ExpensesPage() {
  // 집계 화면에서 넘어오면 ?year=…&account=… 로 연간 조회
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<'month' | 'period'>('month');
  // 기본은 전체 연도·전체 월. 집계 화면에서 넘어오면 그 연도로 거른다.
  const [year, setYear] = useState<number | ''>(Number(params.get('year')) || '');
  const [month, setMonth] = useState<number | ''>('');
  const [from, setFrom] = useState(`${thisYear()}-01-01`);
  const [to, setTo] = useState(todayIso());
  const [vendorInput, setVendorInput] = useState('');
  const [vendor, setVendor] = useState('');
  const [accountId, setAccountId] = useState(params.get('account') ?? '');
  const [kind, setKind] = useState<Kind>('');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [leaseEditing, setLeaseEditing] = useState<LeaseTarget | null>(null);
  const [openLease, setOpenLease] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const run = useAction();
  const { accounts } = useAccounts();

  // 거래처 검색은 입력이 멈춘 뒤에 조회
  useEffect(() => {
    const t = setTimeout(() => setVendor(vendorInput.trim()), 300);
    return () => clearTimeout(t);
  }, [vendorInput]);

  // 처음 화면의 조건: 이번 달, 거래처·계정·구분 없음
  const filtered =
    mode !== 'month' ||
    year !== '' ||
    month !== '' ||
    !!vendorInput ||
    !!accountId ||
    kind !== '' ||
    sort.key !== DEFAULT_SORT.key ||
    sort.dir !== DEFAULT_SORT.dir;

  function resetFilters() {
    setMode('month');
    setYear('');
    setMonth('');
    setFrom(`${thisYear()}-01-01`);
    setTo(todayIso());
    setVendorInput('');
    setVendor('');
    setAccountId('');
    setKind('');
    setSort(DEFAULT_SORT);
    if (params.toString()) setParams({}, { replace: true });
  }

  const range: Range = mode === 'month' ? { mode, year: year || null, month: month || null } : { mode, from, to };
  const ledger = useAsync(
    () => loadLedger({ range, vendor, accountId: accountId ? Number(accountId) : null, kind }),
    [mode, year, month, from, to, vendor, accountId, kind],
  );
  const data = ledger.data;
  const rows = useMemo(() => (data ? sortRows(data.rows, sort) : []), [data, sort]);

  /** 같은 머리글을 다시 누르면 방향을 바꾸고, 다른 머리글은 그 칸의 기본 방향부터 */
  function toggleSort(key: SortKey) {
    setSort((cur) =>
      cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] },
    );
  }

  const years = selectableYears();

  async function exportPdf() {
    if (!data) return;
    const conditions = [
      `조회 기간 ${rangeLabel(range)}`,
      kind && `구분 ${KIND_LABEL[kind]}`,
      `정렬 ${SORT_LABEL[sort.key]} ${sort.dir === 'asc' ? '오름차순' : '내림차순'}`,
      vendor && `거래처 '${vendor}'`,
      accountId && `차변계정 ${accounts.find((a) => String(a.id) === accountId)?.name ?? ''}`,
    ]
      .filter(Boolean)
      .join(', ');
    const { from: f, to: t } = rangeBounds(range);
    setExporting(true);
    await run(async () => {
      const { downloadLedgerPdf } = await import('../lib/pdf');
      await downloadLedgerPdf({ ...data, rows }, {
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
          <button className="btn btn-soft" onClick={() => setImporting(true)}>
            <UploadIcon size={18} />
            엑셀 가져오기
          </button>
          <button className="btn btn-soft" onClick={exportPdf} disabled={!data || data.rows.length === 0 || exporting}>
            <DownloadIcon size={18} />
            {exporting ? 'PDF 만드는 중…' : 'PDF 다운로드'}
          </button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <PlusIcon size={18} />
            경비 등록
          </button>
        </div>
      </header>

      <section className="filter-card" aria-label="조회 조건">
        <div className="filter-item filter-mode">
          <span className="filter-label">조회 방식</span>
          <div className="segmented" role="group" aria-label="조회 방식">
            <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>
              연·월
            </button>
            <button type="button" aria-pressed={mode === 'period'} onClick={() => setMode('period')}>
              기간 설정
            </button>
          </div>
        </div>
        {mode === 'month' ? (
          <>
            <label className="filter-item">
              <span className="filter-label">연도</span>
              <select className="input" value={year} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}>
                <option value="">전체</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-item">
              <span className="filter-label">월</span>
              <select className="input" value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}>
                <option value="">전체</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}월
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="filter-item">
              <span className="filter-label">시작일</span>
              <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="filter-item">
              <span className="filter-label">종료일</span>
              <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
          </>
        )}
        <label className="filter-item filter-grow">
          <span className="filter-label">거래처</span>
          <input
            className="input"
            type="search"
            placeholder="일부만 입력"
            value={vendorInput}
            onChange={(e) => setVendorInput(e.target.value)}
          />
        </label>
        <label className="filter-item">
          <span className="filter-label">차변계정</span>
          <AccountSelect value={accountId} onChange={setAccountId} emptyLabel="전체" />
        </label>
        <label className="filter-item filter-kind">
          <span className="filter-label">구분</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="">전체</option>
            <option value="MANUAL">직접 등록 경비</option>
            <option value="SUBSCRIPTION">구독 결제분</option>
            <option value="LEASE">임차관리비</option>
          </select>
        </label>
        <div className="filter-item filter-reset">
          <button
            type="button"
            className="btn btn-soft btn-small"
            onClick={resetFilters}
            disabled={!filtered}
            title="이번 달로 돌아가고 거래처·차변계정·구분 조건을 모두 지웁니다."
          >
            <ResetIcon size={18} />
            초기화
          </button>
        </div>
      </section>

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
          {/* 임차관리비가 있는 기간에만 따로 보여 주고 합계에 더한다 */}
          {data.leaseTotal !== 0 && (
            <div>
              <dt>임차관리비</dt>
              <dd>
                <Amount value={data.leaseTotal} />
              </dd>
            </div>
          )}
          <div className="tally-total">
            <dt>합계{data.leaseTotal !== 0 && ' (임차관리비 포함)'}</dt>
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
          <div className="state-actions">
            {filtered && (
              <button className="btn btn-soft" onClick={resetFilters}>
                <ResetIcon size={18} />
                조건 초기화
              </button>
            )}
            <button className="btn" onClick={() => setEditing('new')}>
              경비 등록
            </button>
          </div>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="ledger-wrap">
          <table className="ledger expense-ledger">
            <thead>
              <tr>
                <th>연도</th>
                <SortTh label="일자" k="date" sort={sort} onSort={toggleSort} />
                <SortTh label="거래처" k="vendor" sort={sort} onSort={toggleSort} />
                <SortTh label="품명" k="item" sort={sort} onSort={toggleSort} />
                <SortTh label="공급가액" k="supply" sort={sort} onSort={toggleSort} right />
                <SortTh label="세액" k="tax" sort={sort} onSort={toggleSort} right />
                <SortTh label="합계" k="total" sort={sort} onSort={toggleSort} right />
                <SortTh label="차변계정" k="account" sort={sort} onSort={toggleSort} />
                <SortTh label="첨부파일" k="attach" sort={sort} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
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
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onDone={ledger.reload}
          onShowRange={(f, t) => {
            resetFilters();
            setMode('period');
            setFrom(f);
            setTo(t);
          }}
        />
      )}
      {leaseEditing && (
        <LeaseModal target={leaseEditing} onClose={() => setLeaseEditing(null)} onSaved={ledger.reload} />
      )}
    </>
  );
}

/** 누르면 정렬되는 머리글. 화면 낭독기에는 aria-sort 로 현재 방향을 알린다. */
function SortTh({
  label,
  k,
  sort,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th className={right ? 'r' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`sort-btn${active ? ` active ${sort.dir}` : ''}`}
        onClick={() => onSort(k)}
        title={`${label} 기준으로 정렬`}
      >
        {label}
        <span className="sort-arrow" aria-hidden />
      </button>
    </th>
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

/** 임차관리비 한 달: "임차관리비 n원" 한 줄, 누르면 임대료·관리비·전기료로 펼친다 */
function LeaseRows({ l, open, onToggle, onEdit }: { l: LeaseRow; open: boolean; onToggle: () => void; onEdit: () => void }) {
  const [y, m] = l.yearMonth.split('-');
  // 임대료·관리비는 자동 등록되고 전기료는 직접 입력한다 (0원 = 아직 입력 안 함)
  const noElectricity = l.electricity === 0;
  const parts = [
    { label: '임대료', value: l.rent, note: '매달 고정' },
    { label: '관리비', value: l.maintenanceFee, note: '매달 고정' },
  ];
  return (
    <Fragment>
      <tr className={`clickable lease-row${open ? ' open' : ''}`} onClick={onToggle}>
        <td className="num nowrap muted">{y}</td>
        <td className="nowrap">{Number(m)}월분</td>
        <td className="muted">–</td>
        <td>
          <button className="row-link disclosure" aria-expanded={open} onClick={(e) => (e.stopPropagation(), onToggle())}>
            임차관리비 <span className="num">{money(l.total)}원</span>
          </button>
          {noElectricity && <span className="tag tag-warn">전기료 미입력</span>}
        </td>
        <td className="r muted">–</td>
        <td className="r muted">–</td>
        <td className="r">
          <Amount value={l.total} strong />
        </td>
        <td className="muted">–</td>
        <td className="nowrap">
          <button className="link" onClick={(e) => (e.stopPropagation(), onEdit())}>
            {noElectricity ? '전기료 입력' : '수정·첨부'}
          </button>
        </td>
      </tr>
      {open && (
        <>
          {parts.map((p) => (
            <tr key={p.label} className="lease-part">
              <td colSpan={3} />
              <td>
                {p.label}
                <span className="part-detail">{p.note}</span>
              </td>
              <td colSpan={2} />
              <td className="r">
                <Amount value={p.value} />
              </td>
              <td colSpan={2} />
            </tr>
          ))}
          <tr className="lease-part">
            <td colSpan={3} />
            <td>
              전기료
              <span className="part-detail">직접 입력</span>
            </td>
            <td colSpan={2} />
            <td className="r">
              {noElectricity ? (
                <button className="link" onClick={onEdit}>
                  입력하기
                </button>
              ) : (
                <Amount value={l.electricity} />
              )}
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
      <RequiredNote className="span-2" />
      <Field label="일자" required>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      <Field label="차변계정" required>
        <AccountSelect value={accountId} onChange={setAccountId} required emptyLabel="계정 선택" allowCreate />
      </Field>
      <Field label="거래처" className="span-2" required>
        <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} required />
      </Field>
      <Field label="품명" className="span-2" required>
        <input className="input" value={itemName} onChange={(e) => setItemName(e.target.value)} required />
      </Field>
      <Field label="공급가액" required hint="반품·취소는 음수(-)로 입력">
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
