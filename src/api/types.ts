// Expenses API 스키마. 금액은 모두 원 단위 정수 (외화 금액·환율만 소수).

export type ExpenseSource = 'MANUAL' | 'SUBSCRIPTION';
export type Cycle = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'YEARLY';
export type Currency = 'KRW' | 'USD' | 'EUR' | 'JPY' | 'GBP' | 'CNY';
/** 외화 구독의 부가세: 없음 / 별도 10% / 포함 10% */
export type TaxType = 'NONE' | 'EXCLUSIVE' | 'INCLUSIVE';

export interface Audit {
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface Attachment {
  id: number;
  originalName: string;
  contentType: string;
  fileSize: number;
  createdBy?: string;
  createdAt?: string;
}

export interface DebitAccount {
  id: number;
  name: string;
  sortOrder: number;
}

export interface Expense extends Audit {
  id: number;
  year: number;
  expenseDate: string;
  vendor: string;
  /** 거래처 사업자등록번호 */
  businessNumber?: string | null;
  itemName: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  /** 외화 구독 결제분이면 그 통화, 아니면 KRW */
  currency?: Currency;
  foreignAmount?: number | null;
  /** 외화 1단위당 원화 (매매기준율) */
  exchangeRate?: number | null;
  /** 환율 고시일 (결제일 직전 영업일) */
  rateDate?: string | null;
  debitAccountId: number;
  debitAccountName: string;
  source: ExpenseSource;
  subscriptionId: number | null;
  attachmentCount: number;
}

export interface ExpenseList {
  items: Expense[];
  count: number;
  supplyTotal: number;
  taxTotal: number;
  totalAmount: number;
}

export interface ExpenseDetail {
  expense: Expense;
  attachments: Attachment[];
}

/** 기간 조회. year·from·to 를 모두 비우면 전체. */
export interface ExpenseQuery {
  year?: number;
  month?: number;
  from?: string;
  to?: string;
  vendor?: string;
  debitAccountId?: number;
  source?: ExpenseSource;
}

/** 합계는 서버가 공급가액 + 세액으로 계산한다 */
export interface ExpenseFields {
  expenseDate: string;
  vendor: string;
  businessNumber?: string;
  itemName: string;
  supplyAmount: number;
  taxAmount: number;
  debitAccountId: number;
}

export interface BulkExpenseItem {
  expenseDate: string;
  vendor: string;
  businessNumber?: string;
  itemName: string;
  supplyAmount: number;
  taxAmount: number;
  debitAccountId?: number;
  /** debitAccountId 가 없으면 이름으로 찾는다 ((판) 접두사 허용) */
  debitAccountName?: string;
}

export interface BulkExpenseResult {
  index: number;
  status: 'CREATED' | 'DUPLICATE' | 'FAILED';
  expenseId: number | null;
  message: string | null;
}

export interface BulkExpenseResponse {
  requested: number;
  created: number;
  duplicated: number;
  failed: number;
  results: BulkExpenseResult[];
}

export interface Subscription extends Audit {
  id: number;
  name: string;
  vendor: string;
  itemName: string;
  currency: Currency;
  /** 원화 구독만. 외화 구독은 null */
  supplyAmount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  /** 외화 구독만 */
  foreignAmount: number | null;
  taxType: TaxType | null;
  taxTypeLabel: string | null;
  debitAccountId: number;
  debitAccountName: string;
  cycle: Cycle;
  cycleLabel: string;
  startDate: string;
  endDate: string | null;
  active: boolean;
  lastChargeDate: string | null;
  nextChargeDate: string | null;
}

export interface SubscriptionFields {
  name: string;
  vendor: string;
  itemName: string;
  currency: Currency;
  /** 원화 구독 */
  supplyAmount?: number;
  taxAmount?: number;
  /** 외화 구독 */
  foreignAmount?: number;
  taxType?: TaxType;
  debitAccountId: number;
  cycle: Cycle;
  startDate: string;
  endDate?: string;
}

export interface SubscriptionPatch extends Partial<SubscriptionFields> {
  removeEndDate?: boolean;
  active?: boolean;
}

export interface SubscriptionCharge {
  chargeDate: string;
  expenseId: number | null;
  supplyAmount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  foreignAmount?: number | null;
  exchangeRate?: number | null;
  rateDate?: string | null;
}

export interface ChargeRun {
  subscriptionCount: number;
  createdCount: number;
}

/** 전기료·부가세·전력기금은 아직 입력하지 않았으면 null */
export interface LeaseCost extends Audit {
  id: number;
  yearMonth: string;
  rent: number;
  maintenanceFee: number;
  electricity: number | null;
  vat: number | null;
  powerFund: number | null;
  /** 입력한 항목만 더한 청구 합계 */
  total: number;
}

export interface LeaseCostDetail {
  leaseCost: LeaseCost;
  attachments: Attachment[];
}

/** 임차관리비 표의 한 달. 등록하지 않은 달은 id 와 금액이 null. */
export interface LeaseMonthRow {
  month: number;
  yearMonth: string;
  id: number | null;
  rent: number | null;
  maintenanceFee: number | null;
  electricity: number | null;
  vat: number | null;
  powerFund: number | null;
  total: number | null;
  /** 고정 금액으로 자동 등록된 달 */
  autoCreated?: boolean;
  attachmentCount?: number;
}

export interface LeaseTotals {
  rent: number;
  maintenanceFee: number;
  electricity: number;
  vat: number;
  powerFund: number;
  total: number;
}

export interface LeasePeriod {
  /** year 로 조회했을 때만 */
  year: number | null;
  fromMonth: string | null;
  toMonth: string | null;
  months: LeaseMonthRow[];
  total: LeaseTotals;
}

export interface LeaseCostFields {
  yearMonth: string;
  rent: number;
  maintenanceFee: number;
  electricity: number | null;
  vat: number | null;
  powerFund: number | null;
}

/** 입력했던 값을 '아직 입력 안 함'(null)으로 되돌릴 항목 */
export type LeaseClearField = 'ELECTRICITY' | 'VAT' | 'POWER_FUND';

export interface LeaseCostPatch extends Partial<Omit<LeaseCostFields, 'electricity' | 'vat' | 'powerFund'>> {
  electricity?: number;
  vat?: number;
  powerFund?: number;
  clear?: LeaseClearField[];
}

/** 임대료·관리비 고정 금액. 서버가 매달 그달 임차관리비를 자동으로 만든다. */
export interface LeaseFixed extends Audit {
  rent: number;
  maintenanceFee: number;
  startMonth: string;
  active: boolean;
  lastGeneratedMonth: string | null;
  nextMonth: string | null;
}

export interface LeaseFixedFields {
  rent: number;
  maintenanceFee: number;
  startMonth: string;
  active?: boolean;
}

export interface SummaryMonth {
  /** 합계 행은 0 */
  month: number;
  /** 합계 행은 null */
  yearMonth: string | null;
  manual: number;
  subscription: number;
  lease: number;
  total: number;
}

export interface SummaryAccount {
  debitAccountId: number | null;
  debitAccountName: string;
  count: number;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  /** totalAmount 중 임차관리비에서 온 금액 */
  fromLease: number;
}

export interface Summary {
  year: number | null;
  fromMonth: string | null;
  toMonth: string | null;
  months: SummaryMonth[];
  byDebitAccount: SummaryAccount[];
  total: SummaryMonth;
}

export interface Me {
  sub: string;
  uid: number;
  username: string;
  name: string;
  email: string;
  roles: string[];
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}
