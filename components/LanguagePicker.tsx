"use client";

import { LANGS, type Lang } from "@/lib/i18n";
import { useLang } from "./LanguageProvider";

export default function LanguagePicker() {
  const { lang, setLang, t } = useLang();
  return (
    <label className="field-label">
      <span className="sr-only">{t("lang.label")}</span>
      <select
        name="language"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="nav-lang"
        aria-label={t("lang.label")}
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}
