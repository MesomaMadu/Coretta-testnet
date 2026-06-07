"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type Locale, type TranslationKey, t as translate } from "./translations";

const STORAGE_KEY = "coretta_locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      let stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (!stored) {
        const legacy = localStorage.getItem("coremit_locale") as Locale | null;
        if (legacy) {
          stored = legacy;
          localStorage.setItem(STORAGE_KEY, legacy);
        }
      }
      if (stored && ["en", "es", "fr", "hi", "zh", "ja"].includes(stored)) {
        setLocaleState(stored);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  );

  if (!ready) return <>{children}</>;

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: "en" as Locale,
      setLocale: () => {},
      t: (key: TranslationKey, vars?: Record<string, string>) =>
        translate("en", key, vars),
    };
  }
  return ctx;
}
