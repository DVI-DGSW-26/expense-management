import { ApiError, request, tokens } from './client';
import type {
  Attachment,
  ChargeRun,
  DebitAccount,
  ExpenseDetail,
  ExpenseFields,
  ExpenseList,
  ExpenseQuery,
  BulkExpenseItem,
  BulkExpenseResponse,
  LeaseCostDetail,
  LeaseCostFields,
  LeaseCostPatch,
  LeaseFixed,
  LeaseFixedFields,
  LeasePeriod,
  Me,
  Subscription,
  SubscriptionCharge,
  SubscriptionFields,
  SubscriptionPatch,
  Summary,
} from './types';

function toForm(fields: object, files: File[] = []) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
  }
  files.forEach((f) => form.append('files', f));
  return form;
}

function filesForm(files: File[]) {
  return toForm({}, files);
}

export const authApi = {
  me: () => request<Me>('GET', '/auth/me'),
  async logout() {
    const refreshToken = tokens.refresh;
    if (refreshToken) {
      await request<void>('POST', '/auth/logout', { json: { refreshToken }, noRefresh: true }).catch(() => undefined);
    }
    tokens.clear();
  },
};

/** 기간 조회 조건. 모두 비우면 전체. */
export interface PeriodQuery {
  year?: number;
  from?: string;
  to?: string;
}

export const summaryApi = {
  get: (q: PeriodQuery) => request<Summary>('GET', '/summary', { query: { ...q } }),
};

export const expenseApi = {
  list: (q: ExpenseQuery) => request<ExpenseList>('GET', '/expense', { query: { ...q } }),
  get: (id: number) => request<ExpenseDetail>('GET', `/expense/${id}`),
  create: (fields: ExpenseFields, files: File[]) =>
    request<ExpenseDetail>('POST', '/expense', { form: toForm(fields, files) }),
  /** 여러 건을 한 번에 등록한다. 중복(일자·거래처·품명·합계)은 서버가 건너뛴다. */
  bulk: (items: BulkExpenseItem[]) => request<BulkExpenseResponse>('POST', '/expense/bulk', { json: { items } }),
  update: (id: number, fields: Partial<ExpenseFields>) => request<void>('PATCH', `/expense/${id}`, { json: fields }),
  remove: (id: number) => request<void>('DELETE', `/expense/${id}`),
  addFiles: (id: number, files: File[]) =>
    request<Attachment[]>('POST', `/expense/${id}/attachment`, { form: filesForm(files) }),
};

export const leaseApi = {
  period: (q: PeriodQuery) => request<LeasePeriod>('GET', '/lease-cost', { query: { ...q } }),
  get: (id: number) => request<LeaseCostDetail>('GET', `/lease-cost/${id}`),
  create: (fields: LeaseCostFields, files: File[]) =>
    request<LeaseCostDetail>('POST', '/lease-cost', { form: toForm(fields, files) }),
  update: (id: number, patch: LeaseCostPatch) => request<void>('PATCH', `/lease-cost/${id}`, { json: patch }),
  /** 임대료·관리비 고정 금액 (없으면 null) */
  fixed: () =>
    request<LeaseFixed | null>('GET', '/lease-cost/fixed').catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }),
  setFixed: (fields: LeaseFixedFields) => request<LeaseFixed>('PUT', '/lease-cost/fixed', { json: fields }),
  remove: (id: number) => request<void>('DELETE', `/lease-cost/${id}`),
  addFiles: (id: number, files: File[]) =>
    request<Attachment[]>('POST', `/lease-cost/${id}/attachment`, { form: filesForm(files) }),
};

export const subscriptionApi = {
  list: () => request<Subscription[]>('GET', '/subscription'),
  get: (id: number) => request<Subscription>('GET', `/subscription/${id}`),
  create: (fields: SubscriptionFields) => request<Subscription>('POST', '/subscription', { json: fields }),
  update: (id: number, patch: SubscriptionPatch) => request<Subscription>('PATCH', `/subscription/${id}`, { json: patch }),
  remove: (id: number) => request<void>('DELETE', `/subscription/${id}`),
  charges: (id: number) => request<SubscriptionCharge[]>('GET', `/subscription/${id}/charges`),
  run: () => request<ChargeRun>('POST', '/subscription/run'),
};

export const accountApi = {
  list: () => request<DebitAccount[]>('GET', '/debit-account'),
  create: (name: string, sortOrder?: number) =>
    request<DebitAccount>('POST', '/debit-account', { json: { name, sortOrder } }),
  update: (id: number, fields: { name?: string; sortOrder?: number }) =>
    request<void>('PATCH', `/debit-account/${id}`, { json: fields }),
  remove: (id: number) => request<void>('DELETE', `/debit-account/${id}`),
};

export const attachmentApi = {
  /** 인증 헤더가 필요하므로 fetch 로 Blob 을 받는다 (미리보기·내려받기 공용) */
  async blob(a: Attachment): Promise<Blob> {
    const res = await request<Response>('GET', `/attachment/${a.id}/download`, { raw: true });
    return res.blob();
  },
  /** 원본 파일명으로 저장한다 */
  async download(a: Attachment) {
    const url = URL.createObjectURL(await attachmentApi.blob(a));
    const link = document.createElement('a');
    link.href = url;
    link.download = a.originalName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  remove: (id: number) => request<void>('DELETE', `/attachment/${id}`),
};
