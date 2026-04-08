import { useI18n, type Locale } from "../lib/i18n";

const locales: Locale[] = ["zh-Hans", "zh-Hant", "en"];

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="lang-switcher">
      <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
        {locales.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </div>
  );
}
