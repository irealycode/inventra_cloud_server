import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, LineChart as LineChartIcon, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type StoreCompare,
  type Trends,
  api,
  daysAgoISO,
  money,
  num,
  todayISO,
} from "../lib/api";
import { useStores } from "../lib/store";
import { Card, PageHeader, Th } from "../components/ui";

// Distinct, reasonably colour-blind-friendly hues for per-store lines/bars.
const PALETTE = [
  "#4f46e5", "#059669", "#d97706", "#7c3aed", "#dc2626",
  "#0891b2", "#db2777", "#65a30d", "#2563eb", "#ea580c",
];
const colorAt = (i: number) => PALETTE[i % PALETTE.length];

type Metric = "revenue" | "sales";

export default function Analytics() {
  const { t } = useTranslation();
  const { selectedId } = useStores();
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [metric, setMetric] = useState<Metric>("revenue");
  const [trends, setTrends] = useState<Trends | null>(null);
  const [cmp, setCmp] = useState<StoreCompare | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tr, c] = await Promise.all([
        api.trends({ storeId: selectedId ?? undefined, from, to }),
        api.compare({ from, to }),
      ]);
      setTrends(tr);
      setCmp(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [selectedId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const chartSeries = useMemo(() => {
    if (!trends) return [];
    return trends.series.map((s, i) => ({
      id: s.store_id,
      name: s.store_name,
      color: colorAt(i),
      values: metric === "revenue" ? s.revenue : s.sales,
      total: metric === "revenue" ? s.total_revenue : s.sales.reduce((a, b) => a + b, 0),
    }));
  }, [trends, metric]);

  const fmt = metric === "revenue" ? money : num;
  const visible = chartSeries.filter((s) => !hidden.has(s.id));
  const hasData = !!trends && trends.buckets.length > 0 && chartSeries.some((s) => s.total > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("analytics.title")}
        subtitle={t("analytics.subtitle")}
        right={
          <>
            <div className="flex-1 min-w-0 sm:flex-none">
              <label className="label">{t("common.from")}</label>
              <input type="date" className="field w-full sm:w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex-1 min-w-0 sm:flex-none">
              <label className="label">{t("common.to")}</label>
              <input type="date" className="field w-full sm:w-44" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        }
      />

      {error && <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      {/* Trend chart */}
      <Card
        title={metric === "revenue" ? t("analytics.revenueTrend") : t("analytics.salesTrend")}
        icon={<LineChartIcon className="w-4 h-4" />}
        right={
          <div className="inline-flex rounded-lg border border-ink-200 p-0.5 text-xs">
            <MetricTab active={metric === "revenue"} onClick={() => setMetric("revenue")}>
              {t("analytics.metricRevenue")}
            </MetricTab>
            <MetricTab active={metric === "sales"} onClick={() => setMetric("sales")}>
              {t("analytics.metricSales")}
            </MetricTab>
          </div>
        }
      >
        <div className="p-5">
          {!hasData ? (
            <div className="text-sm text-ink-500 py-10 text-center">
              {loading ? t("common.loading") : t("analytics.noData")}
            </div>
          ) : (
            <>
              <LineChart buckets={trends!.buckets} series={visible} format={fmt} />
              {chartSeries.length > 1 && (
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                  {chartSeries.map((s) => {
                    const off = hidden.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggle(s.id)}
                        className={"inline-flex items-center gap-1.5 text-xs transition-opacity " + (off ? "opacity-40" : "")}
                        title={t("analytics.toggleSeries")}
                      >
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
                        <span className={"truncate max-w-[10rem] " + (off ? "line-through" : "font-medium")}>{s.name}</span>
                        <span className="text-ink-500 tabular-nums">{fmt(s.total)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Store comparison */}
      <Card title={t("analytics.comparison")} icon={<BarChart3 className="w-4 h-4" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 border-b border-ink-100">
              <tr>
                <Th>{t("analytics.colRank")}</Th>
                <Th>{t("common.store")}</Th>
                <Th right>{t("analytics.colRevenue")}</Th>
                <Th right>{t("analytics.colSales")}</Th>
                <Th right>{t("analytics.colAvgTicket")}</Th>
                <Th right>{t("analytics.colUnits")}</Th>
                <Th right>{t("analytics.colExpenses")}</Th>
                <Th right>{t("analytics.colNet")}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {!cmp || cmp.stores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-ink-500">
                    {loading ? t("common.loading") : t("analytics.noStores")}
                  </td>
                </tr>
              ) : (
                cmp.stores.map((s, i) => {
                  const share = cmp.totals.revenue > 0 ? (s.revenue / cmp.totals.revenue) * 100 : 0;
                  return (
                    <tr key={s.store_id} className="hover:bg-ink-50/50">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 tabular-nums text-ink-500">
                          {i === 0 && s.revenue > 0 ? <Trophy className="w-3.5 h-3.5 text-amber-500" /> : null}
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium truncate max-w-[12rem]" title={s.store_name}>{s.store_name}</div>
                        <div className="mt-1 h-1.5 w-32 rounded-full bg-ink-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: colorAt(i) }} />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">
                        {money(s.revenue)}
                        <div className="text-[11px] text-ink-400">{share.toFixed(0)}%</div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{num(s.sales_count)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{money(s.avg_ticket)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{num(Math.round(s.units_sold))}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-ink-600">{money(s.expenses)}</td>
                      <td className={"px-5 py-3 text-right tabular-nums font-medium " + (s.net >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {money(s.net)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {cmp && cmp.stores.length > 0 && (
              <tfoot className="border-t-2 border-ink-200 bg-ink-50/40 font-medium">
                <tr>
                  <td className="px-5 py-3" />
                  <td className="px-5 py-3">{t("analytics.allStores")}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{money(cmp.totals.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{num(cmp.totals.sales_count)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{money(cmp.totals.avg_ticket)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{num(Math.round(cmp.totals.units_sold))}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{money(cmp.totals.expenses)}</td>
                  <td className={"px-5 py-3 text-right tabular-nums " + (cmp.totals.net >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {money(cmp.totals.net)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}

function MetricTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-2.5 py-1 rounded-md font-medium transition-colors " +
        (active ? "bg-ink-900 text-white shadow-sm" : "text-ink-600 hover:text-ink-900")
      }
    >
      {children}
    </button>
  );
}

// ---- hand-rolled multi-series SVG line chart (no chart-lib dependency) -------
const W = 1000;
const H = 300;
const PAD = { l: 14, r: 14, t: 14, b: 24 };

function LineChart({
  buckets,
  series,
  format,
}: {
  buckets: string[];
  series: { id: string; name: string; color: string; values: number[] }[];
  format: (n: number) => string;
}) {
  const n = buckets.length;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const single = series.length === 1;
  // ~6 evenly spaced x labels.
  const labelIdx = n <= 1 ? [0] : Array.from({ length: Math.min(6, n) }, (_, k) => Math.round((k / (Math.min(6, n) - 1)) * (n - 1)));
  const showDots = n <= 60;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" preserveAspectRatio="none">
      {/* horizontal grid + y labels */}
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <text x={PAD.l} y={y(v) - 3} fill="#9ca3af" fontSize={11}>
            {format(v)}
          </text>
        </g>
      ))}

      {series.map((s) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
        return (
          <g key={s.id}>
            {single && (
              <polygon
                points={`${PAD.l},${y(0)} ${pts} ${x(n - 1)},${y(0)}`}
                fill={s.color}
                opacity={0.1}
              />
            )}
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            {showDots &&
              s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} vectorEffect="non-scaling-stroke">
                  <title>{`${s.name} · ${buckets[i]}: ${format(v)}`}</title>
                </circle>
              ))}
          </g>
        );
      })}

      {/* x labels */}
      {labelIdx.map((i) => (
        <text key={i} x={x(i)} y={H - 6} fill="#9ca3af" fontSize={11} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
          {(buckets[i] || "").slice(5)}
        </text>
      ))}
    </svg>
  );
}
