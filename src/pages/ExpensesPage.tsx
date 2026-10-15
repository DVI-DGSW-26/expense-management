import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { expenseApi } from '../api/endpoints';
import type { Expense, ExpenseFields, ExpenseQuery, ExpenseSource } from '../api/types';
import { AccountSelect } from '../components/accounts';
import { Attachments, FilePicker } from '../components/Attachments';
import {
  Amount,
  Field,
  LoadState,
  Modal,
  MoneyInput,
  YearStepper,
  moneyText,
  useAction,
  useAsync,
} from '../components/ui';
import { money, parseMoney, shortDate, thisYear, todayIso } from '../lib/format';

export function ExpensesPage() {
  // 집계 화면에서 넘어오면 ?year=…&account=… 로 연간 조회
  const [params] = useSearchParams();
  const [year, setYear] = useState(Number(params.get('year')) || thisYear());
  const [month, setMonth] = useState<number | ''>(params.has('year') ? '' : new Date().getMonth() + 1);
  const [vendorInput, setVendorInput] = useState('');
  const [vendor, setVendor] = useState('');
  const [accountId, setAccountId] = useState(params.get('account') ?? '');
  const [source, setSource] = useState<ExpenseSource | ''>('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  // 거래처 검색은 입력이 멈춘 뒤에 조회
  useEffect(() => {
    const t = setTimeout(() => setVendor(vendorInput.trim()), 300);
    return () => clearTimeout(t);
  }, [vendorInput]);

  const query: ExpenseQuery = {
    year,
    month: month || undefined,
    vendor: vendor || undefined,
    debitAccountId: accountId ? Number(accountId) : undefined,
    source: source || undefined,
  };
  const list = useAsync(() => expenseApi.list(query), [year, month, vendor, accountId, source]);
  const data = list.data;

  return (
    <>
      <header className="page-head">
        <h1>경비</h1>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          경비 등록
        </button>
      </header>

      <div className="filters">
        <YearStepper year={year} onChange={setYear} />
        <select className="input" value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}>
          <option value="">연간 전체</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}월
            </option>
          ))}
        </select>
        <input
          className="input"
          type="search"
          placeholder="거래처 검색"
          value={vendorInput}
          onChange={(e) => setVendorInput(e.target.value)}
        />
        <AccountSelect value={accountId} onChange={setAccountId} emptyLabel="모든 계정" />
        <select className="input" value={source} onChange={(e) => setSource(e.target.value as ExpenseSource | '')}>
          <option value="">직접 등록 + 구독</option>
          <option value="MANUAL">직접 등록만</option>
          <option value="SUBSCRIPTION">구독 결제분만</option>
        </select>
      </div>

      {data && (
        <dl className="tally">
          <div>
            <dt>건수</dt>
            <dd className="num">{money(data.count)}</dd>
          </div>
          <div>
            <dt>공급가액</dt>
            <dd>
              <Amount value={data.supplyTotal} />
            </dd>
          </div>
          <div>
            <dt>세액</dt>
            <dd>
              <Amount value={data.taxTotal} />
            </dd>
          </div>
          <div className="tally-total">
            <dt>합계</dt>
            <dd>
              <Amount value={data.totalAmount} strong />
            </dd>
          </div>
        </dl>
      )}

      <LoadState loading={list.loading && !data} error={list.error} onRetry={list.reload} />

      {data && data.items.length === 0 && (
        <div className="state">
          <p>이 조건에 맞는 경비가 없습니다.</p>
          <button className="btn" onClick={() => setEditing('new')}>
            경비 등록
          </button>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="ledger-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>일자</th>
                <th>거래처</th>
                <th>품명</th>
                <th>계정</th>
                <th className="r">공급가액</th>
                <th className="r">세액</th>
                <th className="r">합계</th>
                <th aria-label="첨부" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((x) => (
                <ExpenseRow key={x.id} x={x} onOpen={() => setEditing(x.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== null && (
        <ExpenseModal
          id={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={list.reload}
        />
      )}
    </>
  );
}

function ExpenseRow({ x, onOpen }: { x: Expense; onOpen: () => void }) {
  return (
    <tr className="clickable" onClick={onOpen}>
      <td className="num nowrap">{shortDate(x.expenseDate)}</td>
      <td>
        <button className="row-link" onClick={onOpen}>
          {x.vendor}
        </button>
        {x.source === 'SUBSCRIPTION' && <span className="tag">구독</span>}
      </td>
      <td className="muted-cell">{x.itemName}</td>
      <td className="nowrap">{x.debitAccountName}</td>
      <td className="r">
        <Amount value={x.supplyAmount} />
      </td>
      <td className="r">
        <Amount value={x.taxAmount} />
      </td>
      <td className="r">
        <Amount value={x.totalAmount} strong />
      </td>
      <td className="r muted nowrap">{x.attachmentCount > 0 ? `📎 ${x.attachmentCount}` : ''}</td>
    </tr>
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
        <AccountSelect value={accountId} onChange={setAccountId} required emptyLabel="계정 선택" />
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
