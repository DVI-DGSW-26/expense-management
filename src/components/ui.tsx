import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { FIRST_YEAR, money, toHalfWidth } from '../lib/format';

// ── 비동기 로딩 ──────────────────────────────────────────────

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (id === seq.current) setData(result);
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

// ── 알림 ─────────────────────────────────────────────────────

type ToastKind = 'ok' | 'error';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const show = useCallback((text: string, kind: ToastKind = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, kind, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** 작업을 실행하고 실패하면 알림으로 메시지를 보여준다. 성공 여부를 돌려준다. */
export function useAction() {
  const toast = useToast();
  return useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      try {
        await fn();
        if (success) toast(success);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error');
        return false;
      }
    },
    [toast],
  );
}

// ── 대화상자 ─────────────────────────────────────────────────

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

// ── 입력 ─────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 꼭 입력해야 하는 칸이면 이름 옆에 * 표시 */
  required?: boolean;
}) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span className="field-label">
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function RequiredMark() {
  return (
    <>
      <span className="req" aria-hidden>
        *
      </span>
      <span className="sr-only">(필수)</span>
    </>
  );
}

/** 입력창 맨 위에 두는 필수 표시 안내 */
export function RequiredNote({ className }: { className?: string }) {
  return (
    <p className={`required-note ${className ?? ''}`}>
      <span className="req" aria-hidden>
        *
      </span>{' '}
      표시는 꼭 입력해야 하는 칸입니다.
    </p>
  );
}

/** 천 단위 쉼표를 넣어 보여주는 금액 입력란. value 는 입력된 문자열 그대로. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  required,
  allowNegative,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  allowNegative?: boolean;
}) {
  return (
    <div className="money-input">
      <input
        className="input num"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => {
          // 한글 입력기가 전각 모드면 숫자가 １２３ 으로 들어오므로 반각으로 바꿔서 거른다
          const raw = toHalfWidth(e.target.value).replace(allowNegative ? /[^\d-]/g : /[^\d]/g, '');
          const neg = allowNegative && raw.startsWith('-');
          const digits = raw.replace(/-/g, '').replace(/^0+(?=\d)/, '');
          onChange((neg ? '-' : '') + (digits ? money(Number(digits)) : ''));
        }}
      />
      <span className="money-unit">원</span>
    </div>
  );
}

export const moneyText = (n: number | null | undefined) => (n === null || n === undefined ? '' : money(n));

export function YearStepper({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <div className="year-stepper">
      <button type="button" className="icon-btn" onClick={() => onChange(year - 1)} disabled={year <= FIRST_YEAR} aria-label="이전 해">
        ‹
      </button>
      <span className="year-value">{year}년</span>
      <button type="button" className="icon-btn" onClick={() => onChange(year + 1)} aria-label="다음 해">
        ›
      </button>
    </div>
  );
}

// ── 상태 표시 ────────────────────────────────────────────────

export function LoadState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error)
    return (
      <div className="state state-error">
        <p>{error}</p>
        <button className="btn" onClick={onRetry}>
          다시 불러오기
        </button>
      </div>
    );
  if (loading) return <div className="state">불러오는 중…</div>;
  return null;
}

export function Amount({ value, strong }: { value: number | null | undefined; strong?: boolean }) {
  const neg = typeof value === 'number' && value < 0;
  return <span className={`num${neg ? ' neg' : ''}${strong ? ' strong' : ''}`}>{money(value)}</span>;
}
