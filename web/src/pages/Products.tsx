import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type ProductRow, api, money, num } from "../lib/api";
import { useStores } from "../lib/store";
import { Card, EmptyRow, PageHeader, Pagination, StoreTag, Th } from "../components/ui";

const LIMIT = 50;

export default function Products() {
  const { t } = useTranslation();
  const { selectedId } = useStores();
  const showStore = !selectedId;
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.products({ storeId: selectedId ?? undefined, search, limit: LIMIT, offset });
      setRows(r.items);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
  }, [selectedId, search, offset]);

  // debounce search / reset page when filters change
  useEffect(() => {
    setOffset(0);
  }, [selectedId, search]);
  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  const cols = showStore ? 6 : 5;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("products.title")}
        subtitle={t("products.subtitle")}
        right={
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              className="field pl-8 w-full sm:w-64"
              placeholder={t("products.searchPlaceholder")}
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
                <Th>{t("cols.product")}</Th>
                {showStore && <Th>{t("cols.store")}</Th>}
                <Th>{t("cols.sku")}</Th>
                <Th>{t("cols.category")}</Th>
                <Th right>{t("cols.price")}</Th>
                <Th right>{t("cols.stock")}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={cols + 1} text={t("common.loading")} />
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={cols + 1} text={t("products.empty")} />
              ) : (
                rows.map((p) => (
                  <tr key={`${p.store_id}-${p.local_id}`} className="table-row">
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    {showStore && (
                      <td className="px-5 py-3">
                        <StoreTag name={p.store_name} />
                      </td>
                    )}
                    <td className="px-5 py-3 text-ink-500">{p.sku || p.barcode || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{p.category || "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{money(p.price)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {(p.stock ?? 0) <= 0 ? (
                        <span className="chip-out">{t("common.out")}</span>
                      ) : (
                        <span className="font-medium">{num(p.stock)}</span>
                      )}
                    </td>
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
