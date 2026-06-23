import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, LogIn, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import LanguageSwitcher from "../components/LanguageSwitcher";

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-ink-50">
      {/* LEFT — form */}
      <div className="flex flex-col px-6 sm:px-12 lg:px-16 py-10">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="w-8 h-8 rounded-lg shadow-card" />
            <span className="text-[15px] font-semibold tracking-tight font-display text-ink-900">
              Inventra <span className="text-ink-400">HQ</span>
            </span>
          </div>
          <LanguageSwitcher />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          <div className="w-full max-w-sm animate-slideUp">
            <h1 className="page-title text-3xl">{t("login.welcomeBack")}</h1>
            <p className="text-sm text-ink-500 mt-2">{t("login.subtitle")}</p>

            <form onSubmit={submit} className="mt-8 space-y-4">
              <div>
                <label className="label">{t("login.email")}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    className="field pl-9"
                    placeholder={t("login.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">{t("login.password")}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    className="field pl-9"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 animate-fadeIn">
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full h-11" disabled={busy || !email || !password}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {busy ? t("login.signingIn") : t("login.signIn")}
              </button>
            </form>
          </div>
        </div>

        <div className="text-xs text-ink-400">{t("login.footnote")}</div>
      </div>

      {/* RIGHT — hero (matches the console's dashboard hero) */}
      <div className="relative overflow-hidden hidden lg:block bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white">
        <div aria-hidden className="absolute -top-24 -right-20 w-96 h-96 rounded-full bg-accent-500/30 blur-3xl animate-blob" />
        <div aria-hidden className="absolute -bottom-28 -left-16 w-96 h-96 rounded-full bg-emerald-400/15 blur-3xl animate-blob" />
        <ChevronArt />

        <div className="relative h-full flex flex-col items-center justify-center px-12">
          <img src="/logo.svg" alt="Inventra" className="w-[72%] max-w-[420px] mb-6" />
          <p className="text-white/60 font-display font-extralight text-lg text-center">
            {t("login.tagline")}
          </p>
          <div className="mt-5 flex items-center gap-2 opacity-50">
            <span className="text-white/60 font-display font-extralight text-sm">{t("login.by")}</span>
            <img src="/sovereign.svg" alt="Sovereign" className="h-5" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Chevron motif echoing the console sidebar — accent V-shapes anchored
 * bottom-right, in the brand's indigo so it reads as the same product family
 * rather than a copy of the desktop's monochrome hero.
 */
function ChevronArt() {
  const chevrons: React.ReactNode[] = [];
  const total = 18;
  for (let i = 0; i < total; i++) {
    const size = 70 + i * 40;
    const opacity = 0.05 + Math.min(0.4, i * 0.02);
    chevrons.push(
      <path
        key={i}
        d={`M ${-size} ${size} L 0 0 L ${size} ${size}`}
        stroke={i % 5 === 0 ? "rgba(165,180,252,0.7)" : "rgba(255,255,255,0.5)"}
        strokeWidth={i % 4 === 0 ? 1.4 : 0.7}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />,
    );
  }
  return (
    <svg
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 600 600"
      preserveAspectRatio="xMaxYMax meet"
    >
      <g transform="translate(560 560)">{chevrons}</g>
    </svg>
  );
}
