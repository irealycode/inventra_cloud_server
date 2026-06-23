import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function SetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8 || password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      const { access_token } = await api.setPassword(token, password);
      await setSession(access_token);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setPassword.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-ink-900 px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-3">
          <LanguageSwitcher variant="dark" />
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-accent-600" />
            <h1 className="text-lg font-semibold">{t("setPassword.title")}</h1>
          </div>
          {!token ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {t("setPassword.missingToken")}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-500">{t("setPassword.subtitle")}</p>
              <div>
                <label className="label">{t("setPassword.newPassword")}</label>
                <input
                  type="password"
                  className="field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
                {tooShort && <p className="text-xs text-red-600 mt-1">{t("setPassword.tooShort")}</p>}
              </div>
              <div>
                <label className="label">{t("setPassword.confirmPassword")}</label>
                <input
                  type="password"
                  className="field"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                {mismatch && <p className="text-xs text-red-600 mt-1">{t("setPassword.mismatch")}</p>}
              </div>
              {error && (
                <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={busy || password.length < 8 || password !== confirm}
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("setPassword.submit")}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
