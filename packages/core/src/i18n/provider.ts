/**
 * Default i18n Provider Implementation
 *
 * Provides translation services with parameter interpolation.
 * Supports English (en) and Chinese (zh) locales.
 *
 * @since 0.4.0
 */

import type { Locale, I18nProvider } from './types.js';
import { EN_MESSAGES } from './en.js';
import { ZH_MESSAGES } from './zh.js';

/**
 * Default I18n Provider
 *
 * Provides translation with the following features:
 * - English and Chinese locales
 * - Parameter interpolation with {param} syntax
 * - Fallback to key if translation not found
 * - Locale switching at runtime
 *
 * @example
 * ```ts
 * const i18n = new DefaultI18nProvider('en');
 * console.log(i18n.t('scan.start', { count: 5 }));
 * // Output: "Scanning 5 files..."
 *
 * i18n.setLocale('zh');
 * console.log(i18n.t('scan.start', { count: 5 }));
 * // Output: "正在扫描 5 个文件..."
 * ```
 */
export class DefaultI18nProvider implements I18nProvider {
  private _locale: Locale;
  private catalogs: Map<Locale, Record<string, string>>;

  constructor(locale?: Locale) {
    this._locale = locale ?? 'en';
    this.catalogs = new Map<Locale, Record<string, string>>();
    this.catalogs.set('en', EN_MESSAGES);
    this.catalogs.set('zh', ZH_MESSAGES);

    // Bind t() so it can be destructured: const { t } = i18n;
    this.t = this.t.bind(this);
  }

  get locale(): Locale {
    return this._locale;
  }

  setLocale(locale: Locale): void {
    this._locale = locale;
  }

  t(key: string, params?: Record<string, string | number>): string {
    const catalog = this.catalogs.get(this._locale) ?? this.catalogs.get('en')!;

    // Get message from catalog, fallback to key if not found
    let message = catalog[key] ?? key;

    // Interpolate parameters if provided
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }

    return message;
  }

  /**
   * Check if a key exists in the current locale's catalog.
   */
  has(key: string): boolean {
    const catalog = this.catalogs.get(this._locale);
    return catalog ? key in catalog : false;
  }

  /**
   * Get all keys available in the current locale.
   */
  keys(): string[] {
    const catalog = this.catalogs.get(this._locale);
    return catalog ? Object.keys(catalog) : [];
  }

  /**
   * Get a raw message without interpolation.
   */
  raw(key: string): string | undefined {
    const catalog = this.catalogs.get(this._locale);
    return catalog?.[key];
  }
}

/**
 * Create a new I18n provider with the specified locale.
 */
export function createI18n(locale?: Locale): I18nProvider {
  return new DefaultI18nProvider(locale);
}
