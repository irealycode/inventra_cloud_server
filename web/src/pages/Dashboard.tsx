import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Package, Receipt, TrendingUp, Users, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type Overview, type SalesReport, api, daysAgoISO, money, num, todayISO } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useStores } from "../lib/store";
import { Card, StatCard } from "../components/ui";

export default function Dashboard() {
  const { t } = useTranslation();
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t("dashboard.greetingMorning");
    if (h < 18) return t("dashboard.greetingAfternoon");
    return t("dashboard.greetingEvening");
  };
  const { me } = useAuth();
  const { selectedId, selectedName } = useStores();
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [ov, setOv] = useState<Overview | null>(null);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, r] = await Promise.all([
        api.overview({ storeId: selectedId ?? undefined, from, to }),
        api.salesReport({ storeId: selectedId ?? undefined, from, to }),
      ]);
      setOv(o);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const maxRev = Math.max(1, ...(report?.by_store.map((s) => s.revenue) ?? [0]));

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white shadow-pop">
        <div aria-hidden className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-accent-500/30 blur-3xl animate-blob" />
        <div aria-hidden className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-emerald-400/15 blur-3xl animate-blob" />
        <div className="relative p-6 sm:p-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/60">{selectedName}</div>
            <h1 className="text-2xl sm:text-3xl font-semibold mt-1 font-display">
              {t("dashboard.greeting", { greeting: greeting(), name: me?.name || t("nav.owner") })}
            </h1>
            <p className="text-sm text-white/70 mt-1">
              {ov && ov.revenue > 0
                ? t("dashboard.summary", { revenue: money(ov.revenue), sales: num(ov.sales_count) })
                : t("dashboard.noSales")}
            </p>
          </div>
          <div className="flex items-end gap-2 w-full sm:w-auto">
            <div className="flex-1 min-w-0 sm:flex-none">
              <label className="label text-white/60">{t("common.from")}</label>
              <input type="date" className="field w-full sm:w-44 px-0 sm:px-3 bg-white/10 border-white/15 text-white [color-scheme:dark]" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex-1 min-w-0 sm:flex-none">
              <label className="label text-white/60">{t("common.to")}</label>
              <input type="date" className="field w-full sm:w-44 px-0 sm:px-3 bg-white/10 border-white/15 text-white [color-scheme:dark]" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {error && <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("dashboard.statRevenue")} value={ov ? money(ov.revenue) : "—"} icon={<TrendingUp className="w-5 h-5" />} tint="emerald" />
        <StatCard label={t("dashboard.statSales")} value={ov ? num(ov.sales_count) : "—"} icon={<Receipt className="w-5 h-5" />} tint="accent" />
        <StatCard label={t("dashboard.statExpenses")} value={ov ? money(ov.expenses_total) : "—"} icon={<Wallet className="w-5 h-5" />} tint="amber" />
        <StatCard label={t("dashboard.statProducts")} value={ov ? num(ov.product_count) : "—"} icon={<Package className="w-5 h-5" />} tint="violet" />
        <StatCard label={t("dashboard.statClients")} value={ov ? num(ov.client_count) : "—"} icon={<Users className="w-5 h-5" />} tint="accent" />
        <StatCard label={t("dashboard.statStaff")} value={ov ? num(ov.employee_count) : "—"} icon={<Users className="w-5 h-5" />} tint="ink" />
        <StatCard label={t("dashboard.statStores")} value={ov ? num(ov.store_count) : "—"} icon={<BarChart3 className="w-5 h-5" />} tint="ink" />
        <StatCard
          label={t("dashboard.statNet")}
          value={ov ? money(ov.revenue - ov.expenses_total) : "—"}
          icon={<TrendingUp className="w-5 h-5" />}
          tint="emerald"
        />
      </div>

      {/* Revenue by store */}
      <Card title={t("dashboard.revenueByStore")} icon={<BarChart3 className="w-4 h-4" />}>
        <div className="p-5">
          {!report || report.by_store.length === 0 ? (
            <div className="text-sm text-ink-500 py-6 text-center inline-flex items-center gap-2 w-full justify-center">
              <AlertTriangle className="w-4 h-4" />
              {loading ? t("common.loading") : t("dashboard.noSalesRange")}
            </div>
          ) : (
            <div className="space-y-3">
              {report.by_store.map((s) => (
                <div key={s.store_id} className="flex items-center gap-2 sm:gap-3">
                  <div className="w-24 sm:w-40 shrink-0 truncate text-sm font-medium" title={s.store_name}>
                    {s.store_name}
                  </div>
                  <div className="flex-1 min-w-0 h-7 rounded-md bg-ink-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent-500 to-accent-600 rounded-md transition-all"
                      style={{ width: `${Math.max(2, (s.revenue / maxRev) * 100)}%` }}
                    />
                  </div>
                  <div className="w-20 sm:w-28 shrink-0 text-right text-sm tabular-nums font-medium">{money(s.revenue)}</div>
                  <div className="hidden sm:block w-16 shrink-0 text-right text-xs text-ink-500 tabular-nums">{s.sales_count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
