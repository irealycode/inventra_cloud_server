import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const LANG_KEY = "inventra.cloud.lang";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    // French is the default; a stored choice (if any) wins. We deliberately do
    // not sniff the browser language so first-time visitors land on French.
    fallbackLng: "fr",
    supportedLngs: ["en", "fr"],
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: LANG_KEY,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

/** BCP-47 locale for Intl formatting, derived from the active language. */
export function currentLocale(): string {
  return i18n.language?.startsWith("fr") ? "fr-FR" : "en-US";
}

export default i18n;
