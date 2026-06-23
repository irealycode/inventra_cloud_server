import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="flex items-end gap-2 w-full sm:w-auto">{right}</div>}
    </div>
  );
}

export function Card({
  title,
  icon,
  right,
  children,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      {(title || right) && (
        <div className="px-5 py-3.5 border-b border-ink-100 flex items-center justify-between">
          <div className="font-medium flex items-center gap-2">
            {icon && <span className="text-ink-500">{icon}</span>}
            {title}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

const TINTS: Record<string, string> = {
  accent: "bg-accent-50 text-accent-600",
  emerald: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  ink: "bg-ink-100 text-ink-600",
};

export function StatCard({
  label,
  value,
  icon,
  tint = "accent",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tint?: keyof typeof TINTS | string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${TINTS[tint] || TINTS.accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-ink-500">{label}</div>
        <div className="text-xl font-semibold font-display tabular-nums truncate">{value}</div>
      </div>
    </div>
  );
}

export function Pagination({
  total,
  limit,
  offset,
  onPage,
}: {
  total: number;
  limit: number;
  offset: number;
  onPage: (offset: number) => void;
}) {
  const { t } = useTranslation();
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="flex items-center justify-between px-5 py-3 text-sm text-ink-500">
      <div>{t("common.pagination", { from, to, total })}</div>
      <div className="flex gap-2">
        <button className="btn-secondary" disabled={offset <= 0} onClick={() => onPage(Math.max(0, offset - limit))}>
          {t("common.prev")}
        </button>
        <button className="btn-secondary" disabled={to >= total} onClick={() => onPage(offset + limit)}>
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}

export function StoreTag({ name }: { name: string }) {
  return (
    <span className="chip-info max-w-[10rem] align-middle" title={name}>
      <span className="truncate">{name}</span>
    </span>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-sm text-ink-500">
        {text}
      </td>
    </tr>
  );
}

export function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
