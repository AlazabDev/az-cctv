import { createContext, useContext } from "react";
import type { Lang, TKey } from "./i18n";

export interface LanguageContextValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  t: (key: TKey) => string;
  catLabel: (category: string) => string;
  fmtPrice: (price: number) => string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export const fmtNumber = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
