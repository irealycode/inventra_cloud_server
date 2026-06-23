import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api, type Store } from "./api";

interface StoresCtx {
  stores: Store[];
  loading: boolean;
  /** null = "All stores" */
  selectedId: string | null;
  selectedName: string;
  setSelectedId: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<StoresCtx | null>(null);
const KEY = "inventra.cloud.store";

export function StoreProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedIdState] = useState<string | null>(() => localStorage.getItem(KEY) || null);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await api.stores();
      setStores(list);
      // drop a stale selection that no longer exists
      setSelectedIdState((cur) => (cur && !list.some((s) => s.store_id === cur) ? null : cur));
    } catch {
      /* leave empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const setSelectedId = (id: string | null) => {
    setSelectedIdState(id);
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  };

  const selectedName = useMemo(() => {
    if (!selectedId) return t("common.allStores");
    return stores.find((s) => s.store_id === selectedId)?.name ?? t("common.allStores");
  }, [selectedId, stores, t]);

  return (
    <Ctx.Provider value={{ stores, loading, selectedId, selectedName, setSelectedId, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStores(): StoresCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStores must be used within StoreProvider");
  return c;
}
