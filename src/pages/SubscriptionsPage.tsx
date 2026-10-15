import { useState, type FormEvent } from 'react';
import { subscriptionApi } from '../api/endpoints';
import type { Cycle, Subscription, SubscriptionFields, SubscriptionPatch } from '../api/types';
import { AccountSelect } from '../components/accounts';
import { Amount, Field, LoadState, Modal, MoneyInput, moneyText, useAction, useAsync } from '../components/ui';
import { money, parseMoney, todayIso } from '../lib/format';

const CYCLES: { value: Cycle; label: string }[] = [
  { value: 'MONTHLY', label: '매월' },
  { value: 'QUARTERLY', label: '분기마다' },
  { value: 'SEMI_ANNUAL', label: '반년마다' },
  { value: 'YEARLY', label: '매년' },
];

function statusOf(s: Subscription) {
  if (!s.active) return { label: '일시중지', cls: 'paused' };
  if (s.endDate && !s.nextChargeDate) return { label: '해지됨', cls: 'ended' };
  if (s.endDate) return { label: `${s.endDate} 해지 예정`, cls: 'ending' };
  return { label: '결제 중', cls: 'active' };
}

export function SubscriptionsPage() {
  const list = useAsync(() => subscriptionApi.list(), []);
  const run = useAction();
  const [editing, setEditing] = useState<Subscription | 'new' | null>(null);
  const [history, setHistory] = useState<Subscription | null>(null);
  const [running, setRunning] = useState(false);

  async function runCharges() {
    setRunning(true);
    try {
      const r = await subscriptionApi.run();
      list.reload();
      return r;
    } finally {
      setRunning(false);
    }
  }

  async function toggle(s: Subscription) {
    const next = !s.active;
    if (await run(() => subscriptionApi.update(s.id, { active: next }), next ? `'${s.name}' 결제를 재개했습니다.` : `'${s.name}' 결제를 일시중지했습니다.`))
      list.reload();
  }

  async function remove(s: Subscription) {
    if (!confirm(`'${s.name}' 구독을 삭제할까요?\n이미 생성된 경비는 그대로 남고 구독 연결만 끊깁니다.`)) return;
    if (await run(() => subscriptionApi.remove(s.id), '구독을 삭제했습니다.')) list.reload();
  }

  const subs = list.data ?? [];
  const monthly = subs
    .filter((s) => s.active && s.nextChargeDate)
    .reduce((sum, s) => sum + s.totalAmount / ({ MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6, YEARLY: 12 }[s.cycle] ?? 1), 0);

  return (
    <>
      <header className="page-head">
        <h1>구독</h1>
        <div className="head-actions">
          <RunButton running={running} onRun={runCharges} />
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            구독 등록
          </button>
        </div>
      </header>
      <p className="page-lede">
        결제일이 되면 매일 자동으로 경비가 만들어집니다.
        {subs.length > 0 && (
          <>
            {' '}지금 결제 중인 구독은 한 달 평균 <strong className="num">{money(Math.round(monthly))}원</strong>입니다.
          </>
        )}
      </p>

      <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />

      {list.data && subs.length === 0 && (
        <div className="state">
          <p>등록된 구독이 없습니다. 매달 나가는 소프트웨어·서비스 요금을 등록해 두면 경비가 자동으로 쌓입니다.</p>
          <button className="btn" onClick={() => setEditing('new')}>
            구독 등록
          </button>
        </div>
      )}

      {subs.length > 0 && (
        <div className="ledger-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>구독</th>
                <th>주기</th>
                <th>계정</th>
                <th className="r">회당 합계</th>
                <th>다음 결제</th>
                <th>상태</th>
                <th aria-label="작업" />
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => {
                const st = statusOf(s);
                return (
                  <tr key={s.id} className={s.active ? undefined : 'dim'}>
                    <td>
                      <button className="row-link" onClick={() => setEditing(s)}>
                        {s.name}
                      </button>
                      <div className="sub-line">
                        {s.vendor}, {s.itemName}
                      </div>
                    </td>
                    <td className="nowrap">{s.cycleLabel}</td>
                    <td className="nowrap">{s.debitAccountName}</td>
                    <td className="r">
                      <Amount value={s.totalAmount} strong />
                    </td>
                    <td className="num nowrap">{s.nextChargeDate ?? '–'}</td>
                    <td className="nowrap">
                      <span className={`status status-${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="r nowrap">
                      <div className="row-actions">
                      <button className="btn btn-small" onClick={() => setHistory(s)}>
                        결제 내역
                      </button>
                      <button className="btn btn-small" onClick={() => toggle(s)}>
                        {s.active ? '일시중지' : '재개'}
                      </button>
                      <button className="btn btn-small btn-danger-quiet" onClick={() => remove(s)}>
                        삭제
                      </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SubscriptionModal
          sub={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={list.reload}
        />
      )}
      {history && <ChargesModal sub={history} onClose={() => setHistory(null)} />}
    </>
  );
}

function RunButton({ running, onRun }: { running: boolean; onRun: () => Promise<{ subscriptionCount: number; createdCount: number }> }) {
  const run = useAction();
  const [result, setResult] = useState('');
  return (
    <button
      className="btn"
      disabled={running}
      title="매일 돌아가는 결제분 생성을 지금 실행합니다. 여러 번 눌러도 중복되지 않습니다."
      onClick={() =>
        run(async () => {
          const r = await onRun();
          setResult(`구독 ${r.subscriptionCount}건 확인, 경비 ${r.createdCount}건 생성`);
          setTimeout(() => setResult(''), 4000);
        })
      }
    >
      {running ? '실행 중…' : result || '결제분 지금 생성'}
    </button>
  );
}

function SubscriptionModal({ sub, onClose, onSaved }: { sub: Subscription | null; onClose: () => void; onSaved: () => void }) {
  const run = useAction();
  const [name, setName] = useState(sub?.name ?? '');
  const [vendor, setVendor] = useState(sub?.vendor ?? '');
  const [itemName, setItemName] = useState(sub?.itemName ?? '');
  const [supply, setSupply] = useState(moneyText(sub?.supplyAmount));
  const [tax, setTax] = useState(moneyText(sub?.taxAmount));
  const [total, setTotal] = useState(
    sub && sub.totalAmount !== sub.supplyAmount + sub.taxAmount ? moneyText(sub.totalAmount) : '',
  );
  const [accountId, setAccountId] = useState(sub ? String(sub.debitAccountId) : '');
  const [cycle, setCycle] = useState<Cycle>(sub?.cycle ?? 'MONTHLY');
  const [startDate, setStartDate] = useState(sub?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(sub?.endDate ?? '');
  const [busy, setBusy] = useState(false);

  const supplyN = parseMoney(supply);
  const taxN = parseMoney(tax) ?? 0;
  const autoTotal = supplyN !== null ? supplyN + taxN : null;
  const isPast = !sub && startDate < todayIso();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (supplyN === null || !accountId) return;
    const fields: SubscriptionFields = {
      name: name.trim(),
      vendor: vendor.trim(),
      itemName: itemName.trim(),
      supplyAmount: supplyN,
      taxAmount: taxN,
      totalAmount: parseMoney(total) ?? autoTotal ?? undefined,
      debitAccountId: Number(accountId),
      cycle,
      startDate,
      endDate: endDate || undefined,
    };
    setBusy(true);
    let ok: boolean;
    if (sub) {
      const patch: SubscriptionPatch = { ...fields };
      if (!endDate && sub.endDate) patch.removeEndDate = true;
      ok = await run(() => subscriptionApi.update(sub.id, patch), '구독을 저장했습니다. 다음 결제분부터 반영됩니다.');
    } else {
      ok = await run(() => subscriptionApi.create(fields), '구독을 등록했습니다.');
    }
    setBusy(false);
    if (ok) {
      onSaved();
      onClose();
    }
  }

  return (
    <Modal title={sub ? '구독 수정' : '구독 등록'} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="구독 이름" className="span-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: ChatGPT Team, Microsoft 365" required />
        </Field>
        <Field label="거래처" hint="생성되는 경비에 들어갑니다.">
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} required />
        </Field>
        <Field label="차변계정">
          <AccountSelect value={accountId} onChange={setAccountId} required emptyLabel="계정 선택" allowCreate />
        </Field>
        <Field label="품명" className="span-2">
          <input className="input" value={itemName} onChange={(e) => setItemName(e.target.value)} required />
        </Field>
        <Field label="회당 공급가액">
          <MoneyInput value={supply} onChange={setSupply} required />
        </Field>
        <Field label="회당 세액">
          <MoneyInput value={tax} onChange={setTax} placeholder="0" />
        </Field>
        <Field label="회당 합계" className="span-2" hint="비워 두면 공급가액 + 세액">
          <MoneyInput value={total} onChange={setTotal} placeholder={autoTotal !== null ? money(autoTotal) : ''} />
        </Field>
        <Field label="결제 주기">
          <select className="input" value={cycle} onChange={(e) => setCycle(e.target.value as Cycle)}>
            {CYCLES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="첫 결제일" hint="이후 결제일은 이 날짜를 기준으로 계산합니다.">
          <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="해지일" className="span-2" hint="이 날짜까지만 결제분을 만듭니다. 비워 두면 계속 결제합니다.">
          <div className="inline">
            <input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            {endDate && (
              <button type="button" className="btn btn-small" onClick={() => setEndDate('')}>
                해지일 지우기
              </button>
            )}
          </div>
        </Field>
        {isPast && (
          <p className="note span-2">첫 결제일이 지난 날짜라서, 등록하면 오늘까지의 결제분이 경비로 한꺼번에 만들어집니다.</p>
        )}
        {sub && (
          <p className="note span-2">금액·거래처·품명·계정 변경은 다음 결제분부터 반영됩니다. 이미 생성된 경비는 그대로입니다.</p>
        )}
        <div className="form-actions span-2">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? '저장 중…' : sub ? '저장' : '등록'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ChargesModal({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const charges = useAsync(() => subscriptionApi.charges(sub.id), [sub.id]);
  return (
    <Modal title={`${sub.name} 결제 내역`} onClose={onClose}>
      <LoadState loading={charges.loading} error={charges.error} onRetry={charges.reload} />
      {charges.data && charges.data.length === 0 && <p className="muted">아직 생성된 결제분이 없습니다.</p>}
      {charges.data && charges.data.length > 0 && (
        <table className="ledger compact">
          <thead>
            <tr>
              <th>결제일</th>
              <th className="r">공급가액</th>
              <th className="r">세액</th>
              <th className="r">합계</th>
            </tr>
          </thead>
          <tbody>
            {charges.data.map((c) => (
              <tr key={c.chargeDate} className={c.expenseId ? undefined : 'dim'}>
                <td className="num">{c.chargeDate}</td>
                {c.expenseId ? (
                  <>
                    <td className="r">
                      <Amount value={c.supplyAmount} />
                    </td>
                    <td className="r">
                      <Amount value={c.taxAmount} />
                    </td>
                    <td className="r">
                      <Amount value={c.totalAmount} strong />
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="r muted">
                    경비 삭제됨
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
