import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Small EN/FR toggle. Persists the choice via the language detector's
 * localStorage cache. `variant="dark"` is for the dark login hero.
 */
export default function LanguageSwitcher({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { i18n } = useTranslation();
  const isFr = i18n.language?.startsWith("fr");
  const next = isFr ? "en" : "fr";

  const base =
    "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors select-none";
  const skin =
    variant === "dark"
      ? "text-white/70 bg-white/[0.06] border border-white/10 hover:bg-white/[0.12]"
      : "text-ink-600 bg-ink-100/70 border border-ink-200 hover:bg-ink-200";

  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(next)}
      className={`${base} ${skin}`}
      title={isFr ? "Switch to English" : "Passer en français"}
    >
      <Languages className="w-3.5 h-3.5" />
      {isFr ? "EN" : "FR"}
    </button>
  );
}
