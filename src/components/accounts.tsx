import { createContext, useContext, type ReactNode } from 'react';
import { accountApi } from '../api/endpoints';
import type { DebitAccount } from '../api/types';
import { useAsync } from './ui';

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

export function AccountSelect({
  value,
  onChange,
  required,
  emptyLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  emptyLabel: string;
}) {
  const { accounts } = useAccounts();
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{emptyLabel}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
