import { useState, type FormEvent } from 'react';
import { accountApi } from '../api/endpoints';
import type { DebitAccount } from '../api/types';
import { useAccounts } from '../components/accounts';
import { useAction } from '../components/ui';

export function AccountsPage() {
  const { accounts, reload } = useAccounts();
  const run = useAction();
  const [name, setName] = useState('');
  const [order, setOrder] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await run(
      () => accountApi.create(name.trim(), order ? Number(order) : undefined),
      `'${name.trim()}' 계정을 추가했습니다.`,
    );
    if (ok) {
      setName('');
      setOrder('');
      reload();
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>차변계정</h1>
      </header>
      <p className="page-lede">
        경비와 구독을 분류하는 계정입니다. 순서 숫자가 작을수록 선택 목록 위에 보입니다. 이름을 바꾸면 기존 경비에도 바뀐 이름으로 보입니다.
      </p>

      <form className="account-add" onSubmit={add}>
        <input className="input" placeholder="새 계정 이름 (예: 소모품비)" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className="input num order-input"
          inputMode="numeric"
          placeholder="순서"
          value={order}
          onChange={(e) => setOrder(e.target.value.replace(/[^\d]/g, ''))}
          aria-label="표시 순서"
        />
        <button className="btn btn-primary">계정 추가</button>
      </form>

      {accounts.length === 0 ? (
        <div className="state">
          <p>계정이 없습니다. 경비를 등록하려면 먼저 계정을 하나 이상 추가하세요.</p>
        </div>
      ) : (
        <ul className="account-list">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} onChange={reload} run={run} />
          ))}
        </ul>
      )}
    </>
  );
}

function AccountRow({
  account,
  onChange,
  run,
}: {
  account: DebitAccount;
  onChange: () => void;
  run: ReturnType<typeof useAction>;
}) {
  const [name, setName] = useState(account.name);
  const [order, setOrder] = useState(String(account.sortOrder));
  const dirty = name.trim() !== account.name || Number(order || 0) !== account.sortOrder;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !name.trim()) return;
    const fields = {
      name: name.trim() !== account.name ? name.trim() : undefined,
      sortOrder: Number(order || 0) !== account.sortOrder ? Number(order || 0) : undefined,
    };
    if (await run(() => accountApi.update(account.id, fields), '계정을 저장했습니다.')) onChange();
  }

  async function remove() {
    if (!confirm(`'${account.name}' 계정을 삭제할까요?`)) return;
    if (await run(() => accountApi.remove(account.id), '계정을 삭제했습니다.')) onChange();
  }

  return (
    <li>
      <form className="account-row" onSubmit={save}>
        <input
          className="input num order-input"
          inputMode="numeric"
          value={order}
          onChange={(e) => setOrder(e.target.value.replace(/[^\d]/g, ''))}
          aria-label={`${account.name} 표시 순서`}
        />
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="계정 이름" />
        <button className="btn btn-small" disabled={!dirty}>
          저장
        </button>
        <button type="button" className="btn btn-small btn-danger-quiet" onClick={remove} title="사용 중인 경비나 구독이 있으면 삭제할 수 없습니다.">
          삭제
        </button>
      </form>
    </li>
  );
}
