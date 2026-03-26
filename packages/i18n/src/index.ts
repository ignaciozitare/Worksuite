import { createContext, useContext, type ReactNode } from 'react';
import es from '../locales/es.json';
import en from '../locales/en.json';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Locale = 'es' | 'en';

const locales = { es, en } as const;

/**
 * Nested key path, e.g. 'common.save' | 'retro.categories.good'
 * Typed via recursive template literal — autocomplete en IDE.
 */
type NestedKeys<T, Prefix extends string = ''> = {
  [K in keyof T]: T[K] extends string
    ? Prefix extends '' ? `${string & K}` : `${Prefix}.${string & K}`
    : T[K] extends object
    ? NestedKeys<T[K], Prefix extends '' ? `${string & K}` : `${Prefix}.${string & K}`>
    : never;
}[keyof T];

export type TranslationKey = NestedKeys<typeof es>;

// ─── Core t() function ────────────────────────────────────────────────────────

/**
 * Resolves a dot-notation key against a locale object.
 * Falls back to the key itself so the UI never breaks.
 */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string>,
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dict: any = locales[locale] ?? locales.es;
  const value: unknown = key
    .split('.')
    .reduce((obj, k) => (obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[k] : undefined), dict as unknown);

  if (typeof value !== 'string') {
    // Key not found — return key as-is so nothing breaks in prod
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[i18n] Missing key: "${key}" for locale "${locale}"`);
    }
    return key;
  }

  if (!params) return value;

  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`);
}

// ─── React context ────────────────────────────────────────────────────────────

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale:    'es',
  setLocale: () => undefined,
  t:         (key) => key,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

interface I18nProviderProps {
  locale:    Locale;
  setLocale: (l: Locale) => void;
  children:  ReactNode;
}

export function I18nProvider({ locale, setLocale, children }: I18nProviderProps) {
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useTranslation() — acceso al sistema i18n desde cualquier componente.
 *
 * @example
 * const { t, locale, setLocale } = useTranslation();
 * <button>{t('common.save')}</button>
 * <button onClick={() => setLocale('en')}>EN</button>
 */
export function useTranslation() {
  return useContext(I18nContext);
}

/**
 * Versión standalone sin contexto React — útil en utilidades fuera del árbol.
 *
 * @example
 * const t = createTranslator('es');
 * const label = t('common.save'); // 'Guardar'
 */
export function createTranslator(locale: Locale) {
  return (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lista de locales disponibles con su etiqueta nativa */
export const AVAILABLE_LOCALES: { id: Locale; label: string }[] = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
];

/** Lee la preferencia de locale del localStorage (o devuelve 'es') */
export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'es';
  const stored = localStorage.getItem('ws_locale');
  return (stored === 'en' || stored === 'es') ? stored : 'es';
}

/** Persiste la preferencia de locale */
export function storeLocale(locale: Locale): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ws_locale', locale);
  }
}
