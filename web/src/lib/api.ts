// Thin fetch wrapper for the cloud API. Same-origin relative paths by default.

import { currentLocale } from "./i18n";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const TOKEN_KEY = "inventra.cloud.jwt";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ---- types ------------------------------------------------------------------
export interface Me {
  customer_id: string;
  email: string;
  name: string | null;
  seats: number;
  store_count: number;
}
export interface Store {
  store_id: string;
  name: string;
  customer_id: string;
  active: boolean;
  created_at: string;
  last_seen_at: string | null;
}
export interface StoreSales {
  store_id: string;
  store_name: string;
  sales_count: number;
  revenue: number;
}
export interface SalesReport {
  total_revenue: number;
  total_sales: number;
  by_store: StoreSales[];
}
export interface Overview {
  revenue: number;
  sales_count: number;
  expenses_total: number;
  product_count: number;
  client_count: number;
  employee_count: number;
  store_count: number;
}
export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface TrendSeries {
  store_id: string;
  store_name: string;
  revenue: number[];
  sales: number[];
  total_revenue: number;
}
export interface Trends {
  from: string | null;
  to: string | null;
  buckets: string[];
  series: TrendSeries[];
  totals: { revenue: number[]; sales: number[] };
}
export interface StoreCompareRow {
  store_id: string;
  store_name: string;
  revenue: number;
  sales_count: number;
  avg_ticket: number;
  units_sold: number;
  expenses: number;
  net: number;
}
export interface StoreCompare {
  from: string | null;
  to: string | null;
  stores: StoreCompareRow[];
  totals: {
    revenue: number;
    sales_count: number;
    units_sold: number;
    expenses: number;
    net: number;
    avg_ticket: number;
  };
}
export interface SaleRow {
  store_id: string;
  store_name: string;
  local_id: number;
  total: number | null;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  payment_method: string | null;
  status: string | null;
  cashier_name: string | null;
  created_at: string | null;
}
export interface ProductRow {
  store_id: string;
  store_name: string;
  local_id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  cost: number | null;
  stock: number | null;
  category: string | null;
}
export interface MovementRow {
  store_id: string;
  store_name: string;
  local_id: number;
  product_name: string | null;
  delta: number | null;
  reason: string | null;
  note: string | null;
  created_at: string | null;
}
export interface ExpenseRow {
  store_id: string;
  store_name: string;
  local_id: number;
  description: string | null;
  category: string | null;
  amount: number | null;
  created_at: string | null;
}
export interface ClientRow {
  store_id: string;
  store_name: string;
  local_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  loyalty_points: number | null;
}
export interface EmployeeRow {
  store_id: string;
  store_name: string;
  local_id: number;
  username: string;
  full_name: string | null;
  role: string | null;
  active: boolean;
}
export interface ShiftRow {
  store_id: string;
  store_name: string;
  local_id: number;
  cashier_name: string | null;
  opening_cash: number | null;
  closing_cash: number | null;
  opened_at: string | null;
  closed_at: string | null;
}

export interface ApiError extends Error {
  status?: number;
}

async function req<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const t = getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j && j.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* non-JSON body */
    }
    const err = new Error(detail) as ApiError;
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface ListParams {
  storeId?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const api = {
  login: (email: string, password: string) =>
    req<{ access_token: string }>("/api/v1/auth/login", { method: "POST", body: { email, password }, auth: false }),
  setPassword: (token: string, password: string) =>
    req<{ access_token: string }>("/api/v1/auth/set-password", { method: "POST", body: { token, password }, auth: false }),
  me: () => req<Me>("/api/v1/me"),
  stores: () => req<Store[]>("/api/v1/stores"),
  deleteStore: (storeId: string) => req<void>(`/api/v1/stores/${storeId}`, { method: "DELETE" }),

  salesReport: (p: ListParams) =>
    req<SalesReport>(`/api/v1/reports/sales${qs({ store_id: p.storeId, from: p.from, to: p.to })}`),
  overview: (p: ListParams) =>
    req<Overview>(`/api/v1/reports/overview${qs({ store_id: p.storeId, from: p.from, to: p.to })}`),
  trends: (p: ListParams) =>
    req<Trends>(`/api/v1/reports/trends${qs({ store_id: p.storeId, from: p.from, to: p.to })}`),
  compare: (p: ListParams) =>
    req<StoreCompare>(`/api/v1/reports/compare${qs({ from: p.from, to: p.to })}`),
  salesList: (p: ListParams) =>
    req<Paged<SaleRow>>(
      `/api/v1/reports/sales-list${qs({ store_id: p.storeId, from: p.from, to: p.to, limit: p.limit, offset: p.offset })}`,
    ),
  products: (p: ListParams) =>
    req<Paged<ProductRow>>(
      `/api/v1/reports/products${qs({ store_id: p.storeId, search: p.search, limit: p.limit, offset: p.offset })}`,
    ),
  movements: (p: ListParams) =>
    req<Paged<MovementRow>>(`/api/v1/reports/movements${qs({ store_id: p.storeId, limit: p.limit, offset: p.offset })}`),
  expenses: (p: ListParams) =>
    req<Paged<ExpenseRow> & { total_amount: number }>(
      `/api/v1/reports/expenses${qs({ store_id: p.storeId, from: p.from, to: p.to, limit: p.limit, offset: p.offset })}`,
    ),
  clients: (p: ListParams) =>
    req<Paged<ClientRow>>(
      `/api/v1/reports/clients${qs({ store_id: p.storeId, search: p.search, limit: p.limit, offset: p.offset })}`,
    ),
  employees: (p: ListParams) =>
    req<{ items: EmployeeRow[] }>(`/api/v1/reports/employees${qs({ store_id: p.storeId })}`),
  shifts: (p: ListParams) =>
    req<Paged<ShiftRow>>(`/api/v1/reports/shifts${qs({ store_id: p.storeId, limit: p.limit, offset: p.offset })}`),
};

// ---- formatting helpers -----------------------------------------------------
export function money(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function num(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString(currentLocale());
}
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
export function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s.includes("T") || s.includes("+") || s.endsWith("Z") ? s : s + "Z").toLocaleString(currentLocale());
  } catch {
    return s;
  }
}
