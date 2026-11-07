"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, LANG_STORAGE_KEY, LANGS, translate, type Lang, type StringKey } from "@/lib/i18n";
import "@/lib/i18n-site";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a string-table key for the current language. */
  t: (key: StringKey | (string & {})) => string;
}

const Ctx = createContext<LangCtx>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (k) => translate(DEFAULT_LANG, k),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY) as Lang | null;
    if (saved && LANGS.some((l) => l.code === saved)) setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LANG_STORAGE_KEY, l);
  }, []);

  const value = useMemo<LangCtx>(() => ({ lang, setLang, t: (k) => translate(lang, k) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Hook: const { lang, setLang, t } = useLang(); */
export const useLang = () => useContext(Ctx);
