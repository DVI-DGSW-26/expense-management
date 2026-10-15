import { createContext, useContext, type ReactNode } from 'react';
import { accountApi } from '../api/endpoints';
import type { DebitAccount } from '../api/types';
import { useAction, useAsync } from './ui';

interface AccountsState {
  accounts: DebitAccount[];
  reload: () => Promise<void>;
}

const AccountsContext = createContext<AccountsState>({ accounts: [], reload: async () => {} });

/** 차변계정 목록은 여러 화면의 선택 상자에서 쓰므로 한 번 불러와 공유한다 */
export function AccountsProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useAsync(() => accountApi.list(), []);
  return <AccountsContext.Provider value={{ accounts: data ?? [], reload }}>{children}</AccountsContext.Provider>;
}

export const useAccounts = () => useContext(AccountsContext);

const NEW = '__new__';

export function AccountSelect({
  value,
  onChange,
  required,
  emptyLabel,
  allowCreate,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  emptyLabel: string;
  /** 목록 끝에 '새 계정 등록'을 두어 고르는 자리에서 바로 추가한다 */
  allowCreate?: boolean;
}) {
  const { accounts, reload } = useAccounts();
  const run = useAction();

  async function create() {
    const name = prompt('새 차변계정 이름을 입력하세요. (예: 소모품비)')?.trim();
    if (!name) return;
    let created: DebitAccount | undefined;
    const ok = await run(async () => {
      created = await accountApi.create(name);
    }, `'${name}' 계정을 등록했습니다.`);
    if (ok && created) {
      await reload();
      onChange(String(created.id));
    }
  }

  return (
    <select
      className="input"
      value={value}
      required={required}
      onChange={(e) => (e.target.value === NEW ? create() : onChange(e.target.value))}
    >
      <option value="">{emptyLabel}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
      {allowCreate && <option value={NEW}>+ 새 계정 등록…</option>}
    </select>
  );
}
