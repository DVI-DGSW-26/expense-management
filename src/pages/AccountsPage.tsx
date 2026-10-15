import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { accountApi } from '../api/endpoints';
import type { DebitAccount } from '../api/types';
import { useAccounts } from '../components/accounts';
import { useAction } from '../components/ui';

/** 순서는 10 간격으로 저장한다 (위에서부터 10, 20, 30…) */
const STEP = 10;

export function AccountsPage() {
  const { accounts, reload } = useAccounts();
  const run = useAction();
  const [name, setName] = useState('');
  const [order, setOrder] = useState<DebitAccount[]>(accounts);
  const [dragId, setDragId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const orderRef = useRef(order);
  orderRef.current = order;

  // 끌고 있지 않을 때만 서버 목록을 따른다
  useEffect(() => {
    if (dragId === null) setOrder(accounts);
  }, [accounts, dragId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    // 새 계정은 맨 아래에 둔다
    const last = Math.max(0, ...accounts.map((a) => a.sortOrder));
    if (await run(() => accountApi.create(trimmed, last + STEP), `'${trimmed}' 계정을 추가했습니다.`)) {
      setName('');
      reload();
    }
  }

  /** 바뀐 순서를 저장한다. sortOrder 가 달라진 계정만 고친다. */
  async function persist(next: DebitAccount[]) {
    const changes = next
      .map((a, i) => ({ a, sortOrder: (i + 1) * STEP }))
      .filter(({ a, sortOrder }) => a.sortOrder !== sortOrder);
    if (changes.length === 0) return;
    setSaving(true);
    await run(
      () => Promise.all(changes.map(({ a, sortOrder }) => accountApi.update(a.id, { sortOrder }))),
      '순서를 저장했습니다.',
    );
    setSaving(false);
    reload();
  }

  function move(list: DebitAccount[], from: number, to: number) {
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  }

  // ── 끌어서 옮기기 (마우스·터치 공통) ──

  function onPointerDown(e: PointerEvent<HTMLButtonElement>, id: number) {
    if (saving) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (dragId === null) return;
    const list = orderRef.current;
    const from = list.findIndex((a) => a.id === dragId);
    // 들어갈 자리 = 포인터보다 위에 가운데가 있는 다른 줄의 수
    const to = list.filter((a) => {
      if (a.id === dragId) return false;
      const rect = rowRefs.current.get(a.id)?.getBoundingClientRect();
      return !!rect && rect.top + rect.height / 2 < e.clientY;
    }).length;
    if (to !== from) setOrder(move(list, from, to));
  }

  function onPointerUp() {
    if (dragId === null) return;
    setDragId(null);
    persist(orderRef.current);
  }

  // ── 키보드로 옮기기 ──

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : -1;
    if (to < 0 || to >= order.length || saving) return;
    e.preventDefault();
    const next = move(order, index, to);
    setOrder(next);
    persist(next);
    // 옮긴 줄의 손잡이에 초점을 유지한다
    requestAnimationFrame(() =>
      rowRefs.current.get(next[to].id)?.querySelector<HTMLButtonElement>('.drag-handle')?.focus(),
    );
  }

  return (
    <>
      <header className="page-head">
        <h1>차변계정</h1>
      </header>
      <p className="page-lede">
        경비와 구독을 분류하는 계정입니다. 왼쪽 손잡이를 끌어 순서를 바꾸면 선택 목록에도 그 순서대로 보입니다. 이름을 바꾸면 기존 경비에도 바뀐 이름으로 보입니다.
      </p>

      <form className="account-add" onSubmit={add}>
        <input className="input" placeholder="새 계정 이름 (예: 소모품비)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary">계정 추가</button>
      </form>

      {order.length === 0 ? (
        <div className="state">
          <p>계정이 없습니다. 경비를 등록하려면 먼저 계정을 하나 이상 추가하세요.</p>
        </div>
      ) : (
        <ul className={`account-list${dragId !== null ? ' dragging' : ''}${saving ? ' saving' : ''}`}>
          {order.map((a, i) => (
            <li
              key={a.id}
              ref={(el) => {
                if (el) rowRefs.current.set(a.id, el);
                else rowRefs.current.delete(a.id);
              }}
              className={dragId === a.id ? 'is-dragging' : undefined}
            >
              <AccountRow
                account={a}
                onChange={reload}
                run={run}
                handle={
                  <button
                    type="button"
                    className="drag-handle"
                    aria-label={`${a.name} 순서 옮기기. 위아래 화살표 키로도 옮길 수 있습니다.`}
                    title="끌어서 순서 바꾸기"
                    onPointerDown={(e) => onPointerDown(e, a.id)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onKeyDown={(e) => onKeyDown(e, i)}
                  />
                }
              />
            </li>
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
  handle,
}: {
  account: DebitAccount;
  onChange: () => void;
  run: ReturnType<typeof useAction>;
  handle: ReactNode;
}) {
  const [name, setName] = useState(account.name);
  const dirty = name.trim() !== account.name;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !name.trim()) return;
    if (await run(() => accountApi.update(account.id, { name: name.trim() }), '계정 이름을 저장했습니다.')) onChange();
  }

  async function remove() {
    if (!confirm(`'${account.name}' 계정을 삭제할까요?`)) return;
    if (await run(() => accountApi.remove(account.id), '계정을 삭제했습니다.')) onChange();
  }

  return (
    <form className="account-row" onSubmit={save}>
      {handle}
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="계정 이름" />
      <button className="btn btn-small" disabled={!dirty}>
        저장
      </button>
      <button
        type="button"
        className="btn btn-small btn-danger-quiet"
        onClick={remove}
        title="사용 중인 경비나 구독이 있으면 삭제할 수 없습니다."
      >
        삭제
      </button>
    </form>
  );
}
