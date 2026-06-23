import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type MovementRow, api, fmtDate, num } from "../lib/api";
import { useStores } from "../lib/store";
import { Card, EmptyRow, PageHeader, Pagination, StoreTag, Th } from "../components/ui";

const LIMIT = 50;

export default function Movements() {
  const { t } = useTranslation();
  const { selectedId } = useStores();
  const showStore = !selectedId;
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.movements({ storeId: selectedId ?? undefined, limit: LIMIT, offset });
      setRows(r.items);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
  }, [selectedId, offset]);

  useEffect(() => {
    setOffset(0);
  }, [selectedId]);
  useEffect(() => {
    load();
  }, [load]);

  const cols = showStore ? 6 : 5;

  return (
    <div className="space-y-5">
      <PageHeader title={t("movements.title")} subtitle={t("movements.subtitle")} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 border-b border-ink-100">
              <tr>
                <Th>{t("cols.date")}</Th>
                {showStore && <Th>{t("cols.store")}</Th>}
                <Th>{t("cols.product")}</Th>
                <Th right>{t("cols.change")}</Th>
                <Th>{t("cols.reason")}</Th>
                <Th>{t("cols.note")}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={cols} text={t("common.loading")} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={cols} text={t("movements.empty")} />
              ) : (
                rows.map((m) => {
                  const d = m.delta ?? 0;
                  return (
                    <tr key={`${m.store_id}-${m.local_id}`} className="table-row">
                      <td className="px-5 py-3 whitespace-nowrap text-ink-600">{fmtDate(m.created_at)}</td>
                      {showStore && (
                        <td className="px-5 py-3">
                          <StoreTag name={m.store_name} />
                        </td>
                      )}
                      <td className="px-5 py-3 font-medium">{m.product_name || "—"}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-medium ${d < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {d > 0 ? "+" : ""}
                        {num(d)}
                      </td>
                      <td className="px-5 py-3 capitalize text-ink-600">{m.reason || "—"}</td>
                      <td className="px-5 py-3 text-ink-500">{m.note || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination total={total} limit={LIMIT} offset={offset} onPage={setOffset} />
      </Card>
    </div>
  );
}
