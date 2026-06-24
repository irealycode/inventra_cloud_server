import { useState } from "react";
import { CheckCircle2, CircleOff, Loader2, Store as StoreIcon, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api, fmtDate } from "../lib/api";
import { useStores } from "../lib/store";
import { Card, EmptyRow, PageHeader, Th } from "../components/ui";

export default function Stores() {
  const { t } = useTranslation();
  const { stores, loading, selectedId, setSelectedId, refresh } = useStores();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(storeId: string, name: string) {
    if (!window.confirm(t("stores.removeConfirm", { name }))) return;
    setBusyId(storeId);
    setError(null);
    try {
      await api.deleteStore(storeId);
      if (selectedId === storeId) setSelectedId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("stores.removeFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t("stores.title")} subtitle={t("stores.subtitle")} />

      {error && (
        <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 animate-fadeIn">
          {error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-50/60 border-b border-ink-100">
              <tr>
                <Th>{t("stores.name")}</Th>
                <Th>{t("stores.lastSeen")}</Th>
                <Th>{t("stores.status")}</Th>
                <Th right>{t("stores.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={4} text={t("common.loading")} />
              ) : stores.length === 0 ? (
                <EmptyRow colSpan={4} text={t("stores.empty")} />
              ) : (
                stores.map((s) => (
                  <tr key={s.store_id} className="table-row">
                    <td className="px-5 py-3 font-medium inline-flex items-center gap-2">
                      <StoreIcon className="w-4 h-4 text-ink-400" />
                      {s.name}
                    </td>
                    <td className="px-5 py-3 text-ink-600 whitespace-nowrap">
                      {s.last_seen_at ? fmtDate(s.last_seen_at) : t("stores.never")}
                    </td>
                    <td className="px-5 py-3">
                      {s.active ? (
                        <span className="chip-ok">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t("stores.active")}
                        </span>
                      ) : (
                        <span className="chip-out">
                          <CircleOff className="w-3.5 h-3.5" />
                          {t("stores.inactive")}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="btn-ghost text-red-600 hover:bg-red-50 h-8"
                        onClick={() => remove(s.store_id, s.name)}
                        disabled={busyId === s.store_id}
                        title={t("stores.remove")}
                      >
                        {busyId === s.store_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        {t("stores.remove")}
                      </button>
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
