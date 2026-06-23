import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ExpenseRow, api, daysAgoISO, fmtDate, money, todayISO } from "../lib/api";
import { useStores } from "../lib/store";
import { Card, EmptyRow, PageHeader, Pagination, StoreTag, Th } from "../components/ui";

const LIMIT = 50;

export default function Expenses() {
  const { t } = useTranslation();
  const { selectedId } = useStores();
  const showStore = !selectedId;
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.expenses({ storeId: selectedId ?? undefined, from, to, limit: LIMIT, offset });
      setRows(r.items);
      setTotal(r.total);
      setTotalAmount(r.total_amount);
    } finally {
      setLoading(false);
    }
  }, [selectedId, from, to, offset]);

  useEffect(() => {
    setOffset(0);
  }, [selectedId, from, to]);
  useEffect(() => {
    load();
  }, [load]);

  const cols = showStore ? 5 : 4;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("expenses.title")}
        subtitle={t("expenses.subtitle", { amount: money(totalAmount) })}
        right={
          <>
            <div className="flex-1 min-w-0 sm:flex-none">
              <label className="label">{t("common.from")}</label>
              <input type="date" className="field w-full sm:w-44 px-0 sm:px-3" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex-1 min-w-0 sm:flex-none">
              <label className="label">{t("common.to")}</label>
              <input type="date" className="field w-full sm:w-44 px-0 sm:px-3" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        }
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 border-b border-ink-100">
              <tr>
                <Th>{t("cols.date")}</Th>
                {showStore && <Th>{t("cols.store")}</Th>}
                <Th>{t("cols.description")}</Th>
                <Th>{t("cols.category")}</Th>
                <Th right>{t("cols.amount")}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={cols} text={t("common.loading")} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={cols} text={t("expenses.empty")} />
              ) : (
                rows.map((x) => (
                  <tr key={`${x.store_id}-${x.local_id}`} className="table-row">
                    <td className="px-5 py-3 whitespace-nowrap text-ink-600">{fmtDate(x.created_at)}</td>
                    {showStore && (
                      <td className="px-5 py-3">
                        <StoreTag name={x.store_name} />
                      </td>
                    )}
                    <td className="px-5 py-3 font-medium">{x.description || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{x.category || "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">{money(x.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination total={total} limit={LIMIT} offset={offset} onPage={setOffset} />
      </Card>
    </div>
  );
}
