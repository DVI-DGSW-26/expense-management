// Expenses API (v1.0.0) 스키마. 금액은 모두 원 단위 정수.

export type ExpenseSource = 'MANUAL' | 'SUBSCRIPTION';
export type Cycle = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'YEARLY';

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
  itemName: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
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

export interface ExpenseQuery {
  year?: number;
  month?: number;
  vendor?: string;
  debitAccountId?: number;
  source?: ExpenseSource;
}

export interface ExpenseFields {
  expenseDate: string;
  vendor: string;
  itemName: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount?: number;
  debitAccountId: number;
}

export interface Subscription extends Audit {
  id: number;
  name: string;
  vendor: string;
  itemName: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
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
  supplyAmount: number;
  taxAmount: number;
  totalAmount?: number;
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
}

export interface ChargeRun {
  subscriptionCount: number;
  createdCount: number;
}

export interface LeaseCost extends Audit {
  id: number;
  yearMonth: string;
  rent: number;
  maintenanceFee: number;
  electricity: number;
  total: number;
}

export interface LeaseCostDetail {
  leaseCost: LeaseCost;
  attachments: Attachment[];
}

/** 임차관리비 연간 표의 한 달. 등록하지 않은 달은 id 와 금액이 null. */
export interface LeaseMonth {
  id: number | null;
  month?: number;
  yearMonth?: string;
  rent: number | null;
  maintenanceFee: number | null;
  electricity: number | null;
  total: number | null;
}

export interface LeaseTotals {
  rent: number;
  maintenanceFee: number;
  electricity: number;
  total: number;
}

export interface LeaseYear {
  year: number;
  months: LeaseMonth[];
  yearTotal: LeaseTotals;
}

export interface LeaseCostFields {
  yearMonth: string;
  rent: number;
  maintenanceFee: number;
  electricity: number;
}

export interface SummaryMonth {
  month: number;
  manual: number;
  subscription: number;
  lease: number;
  total: number;
}

export interface SummaryAccount {
  debitAccountId: number;
  debitAccountName: string;
  count: number;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface Summary {
  year: number;
  months: SummaryMonth[];
  byDebitAccount: SummaryAccount[];
  yearTotal: SummaryMonth;
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
