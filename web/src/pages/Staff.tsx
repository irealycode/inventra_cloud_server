import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type EmployeeRow, api } from "../lib/api";
import { useStores } from "../lib/store";
import { Card, EmptyRow, PageHeader, StoreTag, Th } from "../components/ui";

export default function Staff() {
  const { t } = useTranslation();
  const { selectedId } = useStores();
  const showStore = !selectedId;
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.employees({ storeId: selectedId ?? undefined });
      setRows(r.items);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const cols = showStore ? 5 : 4;

  return (
    <div className="space-y-5">
      <PageHeader title={t("staff.title")} subtitle={t("staff.subtitle")} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 border-b border-ink-100">
              <tr>
                <Th>{t("cols.name")}</Th>
                {showStore && <Th>{t("cols.store")}</Th>}
                <Th>{t("cols.username")}</Th>
                <Th>{t("cols.role")}</Th>
                <Th right>{t("cols.status")}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={cols} text={t("common.loading")} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={cols} text={t("staff.empty")} />
              ) : (
                rows.map((e) => (
                  <tr key={`${e.store_id}-${e.local_id}`} className="table-row">
                    <td className="px-5 py-3 font-medium">{e.full_name || e.username}</td>
                    {showStore && (
                      <td className="px-5 py-3">
                        <StoreTag name={e.store_name} />
                      </td>
                    )}
                    <td className="px-5 py-3 text-ink-600">{e.username}</td>
                    <td className="px-5 py-3 capitalize text-ink-600">{e.role || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {e.active ? <span className="chip-ok">{t("common.active")}</span> : <span className="chip-out">{t("common.inactive")}</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
