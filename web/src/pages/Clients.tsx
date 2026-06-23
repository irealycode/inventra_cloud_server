import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type ClientRow, api, num } from "../lib/api";
import { useStores } from "../lib/store";
import { Card, EmptyRow, PageHeader, Pagination, StoreTag, Th } from "../components/ui";

const LIMIT = 50;

export default function Clients() {
  const { t } = useTranslation();
  const { selectedId } = useStores();
  const showStore = !selectedId;
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.clients({ storeId: selectedId ?? undefined, search, limit: LIMIT, offset });
      setRows(r.items);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
  }, [selectedId, search, offset]);

  useEffect(() => {
    setOffset(0);
  }, [selectedId, search]);
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  const cols = showStore ? 5 : 4;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("clients.title")}
        subtitle={t("clients.subtitle")}
        right={
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              className="field pl-8 w-full sm:w-64"
              placeholder={t("clients.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 border-b border-ink-100">
              <tr>
                <Th>{t("cols.name")}</Th>
                {showStore && <Th>{t("cols.store")}</Th>}
                <Th>{t("cols.phone")}</Th>
                <Th>{t("cols.email")}</Th>
                <Th right>{t("cols.loyalty")}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={cols} text={t("common.loading")} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={cols} text={t("clients.empty")} />
              ) : (
                rows.map((c) => (
                  <tr key={`${c.store_id}-${c.local_id}`} className="table-row">
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    {showStore && (
                      <td className="px-5 py-3">
                        <StoreTag name={c.store_name} />
                      </td>
                    )}
                    <td className="px-5 py-3 text-ink-600">{c.phone || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{c.email || "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{num(c.loyalty_points)}</td>
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
