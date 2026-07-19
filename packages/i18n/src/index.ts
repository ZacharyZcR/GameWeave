export type MessageValue = string | number;
export type MessageParams = Readonly<Record<string, MessageValue>>;
export type MessageCatalog = Readonly<Record<string, string>>;
export type MessageCatalogs = Readonly<Record<string, MessageCatalog>>;

export interface I18nOptions {
  readonly messages: MessageCatalogs;
  readonly locale?: string;
  readonly fallbackLocale?: string;
  readonly missing?: (key: string, locale: string) => string;
}

export interface I18n {
  readonly locale: string;
  readonly fallbackLocale: string;
  t(key: string, params?: MessageParams): string;
  has(key: string, locale?: string): boolean;
  setLocale(locale: string): void;
  subscribe(listener: (locale: string) => void): () => void;
}

export function createI18n(options: I18nOptions): I18n {
  let locale = normalizeLocale(options.locale ?? "en");
  const fallbackLocale = normalizeLocale(options.fallbackLocale ?? "en");
  const listeners = new Set<(locale: string) => void>();
  const resolveMessage = (key: string, requested: string): string | undefined => {
    for (const candidate of localeChain(requested, fallbackLocale)) {
      const message = options.messages[candidate]?.[key];
      if (message !== undefined) return message;
    }
    return undefined;
  };
  return {
    get locale() { return locale; },
    fallbackLocale,
    t(key, params = {}) {
      const message = resolveMessage(key, locale) ?? options.missing?.(key, locale) ?? key;
      return message.replace(/\{([A-Za-z0-9_.-]+)\}/g, (token, name: string) => params[name] === undefined ? token : String(params[name]));
    },
    has: (key, requested = locale) => resolveMessage(key, normalizeLocale(requested)) !== undefined,
    setLocale(next) {
      const normalized = normalizeLocale(next);
      if (normalized === locale) return;
      locale = normalized;
      for (const listener of listeners) listener(locale);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export function translateDocument(i18n: I18n, root: ParentNode = document): void {
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n]")) node.textContent = i18n.t(node.dataset.i18n ?? "");
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) node.title = i18n.t(node.dataset.i18nTitle ?? "");
  for (const node of root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]")) node.setAttribute("aria-label", i18n.t(node.dataset.i18nAriaLabel ?? ""));
  for (const node of root.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) node.placeholder = i18n.t(node.dataset.i18nPlaceholder ?? "");
  if (root === document) document.documentElement.lang = i18n.locale;
}

function localeChain(locale: string, fallback: string): string[] {
  const candidates = [locale, locale.split("-")[0]!, fallback, fallback.split("-")[0]!];
  return [...new Set(candidates)];
}

function normalizeLocale(locale: string): string {
  const value = locale.trim().replace(/_/g, "-");
  if (!value) return "en";
  const [language = "en", region] = value.split("-");
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}
