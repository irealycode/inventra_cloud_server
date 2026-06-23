import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ShiftRow, api, fmtDate, money } from "../lib/api";
import { useStores } from "../lib/store";
import { Card, EmptyRow, PageHeader, Pagination, StoreTag, Th } from "../components/ui";

const LIMIT = 50;

export default function Shifts() {
  const { t } = useTranslation();
  const { selectedId } = useStores();
  const showStore = !selectedId;
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.shifts({ storeId: selectedId ?? undefined, limit: LIMIT, offset });
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
      <PageHeader title={t("shifts.title")} subtitle={t("shifts.subtitle")} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 border-b border-ink-100">
              <tr>
                <Th>{t("cols.opened")}</Th>
                {showStore && <Th>{t("cols.store")}</Th>}
                <Th>{t("cols.cashier")}</Th>
                <Th right>{t("cols.opening")}</Th>
                <Th right>{t("cols.closing")}</Th>
                <Th>{t("cols.closed")}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={cols} text={t("common.loading")} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={cols} text={t("shifts.empty")} />
              ) : (
                rows.map((s) => (
                  <tr key={`${s.store_id}-${s.local_id}`} className="table-row">
                    <td className="px-5 py-3 whitespace-nowrap text-ink-600">{fmtDate(s.opened_at)}</td>
                    {showStore && (
                      <td className="px-5 py-3">
                        <StoreTag name={s.store_name} />
                      </td>
                    )}
                    <td className="px-5 py-3 font-medium">{s.cashier_name || "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{money(s.opening_cash)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {s.closing_cash == null ? <span className="chip-info">{t("common.open")}</span> : money(s.closing_cash)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-ink-500">{s.closed_at ? fmtDate(s.closed_at) : "—"}</td>
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
