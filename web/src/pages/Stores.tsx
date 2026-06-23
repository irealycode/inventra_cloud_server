import { useEffect, useState } from "react";
import { CheckCircle2, CircleOff } from "lucide-react";
import { type Store, api } from "../lib/api";

export default function Stores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .stores()
      .then(setStores)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stores</h1>
        <p className="text-sm text-ink-500 mt-0.5">Branches registered to your account.</p>
      </div>

      {error && (
        <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="card divide-y divide-ink-100">
        {loading ? (
          <div className="p-6 text-sm text-ink-500 text-center">Loading…</div>
        ) : stores.length === 0 ? (
          <div className="p-6 text-sm text-ink-500 text-center">
            No stores yet. Register a branch from its Inventra app (Settings → Multi-store).
          </div>
        ) : (
          stores.map((s) => (
            <div key={s.store_id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="font-medium truncate">{s.name}</div>
                <div className="text-xs text-ink-500 mt-0.5">
                  Last seen {s.last_seen_at ? formatDate(s.last_seen_at) : "never"}
                </div>
              </div>
              <div
                className={
                  "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full " +
                  (s.active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-ink-100 text-ink-500")
                }
              >
                {s.active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CircleOff className="w-3.5 h-3.5" />}
                {s.active ? "Active" : "Inactive"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatDate(s: string): string {
  try {
    return new Date(s.endsWith("Z") || s.includes("+") ? s : s + "Z").toLocaleString();
  } catch {
    return s;
  }
}
