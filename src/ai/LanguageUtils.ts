/**
 * Language utility functions for multi-language AI content generation
 *
 * Provides ISO 639-1 language code resolution and validation for AI prompts.
 */

/**
 * Language code to full name mapping (ISO 639-1)
 *
 * Supports common languages for educational content generation.
 * Unknown codes are returned as-is with a warning.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  fr: "French",
  de: "German",
  es: "Spanish",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ar: "Arabic",
  pt: "Portuguese",
  it: "Italian",
  ru: "Russian",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  no: "Norwegian",
  th: "Thai",
  hi: "Hindi",
  id: "Indonesian",
};

/**
 * Static utility class for language code resolution
 *
 * @example
 * ```typescript
 * const name = LanguageUtils.getLanguageName("vi"); // Returns "Vietnamese"
 * const name = LanguageUtils.getLanguageName("fr"); // Returns "French"
 * const name = LanguageUtils.getLanguageName("xyz"); // Returns "xyz" with warning
 * ```
 */
export class LanguageUtils {
  /**
   * Get full language name from ISO 639-1 code
   *
   * @param isoCode - Two-letter ISO 639-1 language code (case insensitive)
   * @returns Full language name, or the code itself if not recognized
   *
   * @example
   * ```typescript
   * LanguageUtils.getLanguageName("vi"); // "Vietnamese"
   * LanguageUtils.getLanguageName("VI"); // "Vietnamese" (case insensitive)
   * LanguageUtils.getLanguageName("fr"); // "French"
   * LanguageUtils.getLanguageName("de"); // "German"
   * LanguageUtils.getLanguageName("xyz"); // "xyz" (unknown code, returns as-is)
   * ```
   */
  static getLanguageName(isoCode: string): string {
    // Normalize to lowercase for case-insensitive lookup
    const normalizedCode = isoCode.toLowerCase();

    // Look up language name
    const languageName = LANGUAGE_NAMES[normalizedCode];

    // Return name if found, otherwise return code with warning
    if (!languageName) {
      console.warn(
        `[LanguageUtils] Unknown language code: "${isoCode}". Using code as-is. ` +
          `Supported codes: ${Object.keys(LANGUAGE_NAMES).join(", ")}. ` +
          `See ISO 639-1 for standard codes.`
      );
      return isoCode;
    }

    return languageName;
  }
}
