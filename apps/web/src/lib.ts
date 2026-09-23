export type User = {
  id: string;
  name: string;
  email: string;
  currency: string;
  timezone: string;
  locale: string;
};
export type Row = { id: string; [key: string]: any };
export type Resource =
  "accounts" | "transactions" | "categories" | "budgets" | "activities";
export type Data = Record<Resource, Row[]>;
export const emptyData: Data = {
  accounts: [],
  transactions: [],
  categories: [],
  budgets: [],
  activities: [],
};
export const apiBase = ((import.meta as any).env?.VITE_API_URL || "").replace(
  /\/$/,
  "",
);
export async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${apiBase}/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
export const digits = (currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
export function minor(value: string, currency: string) {
  const d = digits(currency);
  if (
    !new RegExp(`^-?\\d+(?:\\.\\d{1,${Math.max(d, 1)}})?$`).test(value) ||
    (d === 0 && value.includes("."))
  )
    throw new Error(`Enter an amount with at most ${d} decimal places`);
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const n = Number(whole) * 10 ** d + Number(fraction.padEnd(d, "0"));
  if (!Number.isSafeInteger(n) || n > 1e14)
    throw new Error("Amount is too large");
  return negative ? -n : n;
}
export const major = (amount: number | string, currency: string) =>
  (Number(amount) / 10 ** digits(currency)).toFixed(digits(currency));
export const money = (
  amount: number | string,
  currency: string,
  locale: string,
) =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    Number(amount) / 10 ** digits(currency),
  );
export function dayKey(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export const localInput = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const balance = (account: Row, transactions: Row[]) =>
  Number(account.opening_balance) +
  transactions
    .filter((t) => t.account_id === account.id)
    .reduce((n, t) => n + (t.type === "income" ? 1 : -1) * Number(t.amount), 0);
