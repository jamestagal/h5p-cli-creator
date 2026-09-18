/**
 * StoryTranslator service for translating Vietnamese text to English.
 *
 * Responsibilities:
 * - Translate story pages using OpenAI GPT-4
 * - Provide story context for narrative consistency
 * - Cache translations to avoid reprocessing
 * - Handle API failures gracefully with fallback
 * - Estimate and log API costs
 *
 * Phase 2: YouTube Story Extraction for Interactive Books
 */

import OpenAI from "openai";
import * as fsExtra from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import { StoryPageData } from "../models/StoryPageData";

/**
 * Translation cache entry structure
 */
interface TranslationCacheEntry {
  key: string;
  vietnameseText: string;
  englishTranslation: string;
  timestamp: string;
  tokens: number;
}

/**
 * Translation cache structure stored in JSON
 */
interface TranslationCache {
  [key: string]: TranslationCacheEntry;
}

/**
 * StoryTranslator translates Vietnamese story pages to English.
 *
 * Features:
 * - Context-aware translation using OpenAI GPT-4
 * - Story context passed to maintain narrative consistency
 * - Caching to avoid duplicate API calls
 * - Retry logic for transient failures
 * - Cost estimation and logging
 */
export class StoryTranslator {
  private openai: OpenAI;
  private cacheBasePath: string;
  private totalTokens: number = 0;
  private totalCost: number = 0;

  // GPT-4 pricing (as of 2024): $0.03 per 1K input tokens, $0.06 per 1K output tokens
  private readonly INPUT_TOKEN_COST = 0.03 / 1000;
  private readonly OUTPUT_TOKEN_COST = 0.06 / 1000;

  /**
   * Creates a new StoryTranslator instance.
   * @param apiKey OpenAI API key (defaults to OPENAI_API_KEY environment variable)
   * @param cacheBasePath Base directory for translation cache (defaults to .youtube-cache)
   */
  constructor(apiKey?: string, cacheBasePath?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OpenAI API key required. Set OPENAI_API_KEY environment variable.");
    }

    this.openai = new OpenAI({ apiKey: key });
    this.cacheBasePath = cacheBasePath || path.join(process.cwd(), ".youtube-cache");
  }

  /**
   * Translates all story pages with context awareness.
   *
   * @param pages Array of story pages to translate
   * @param storyContext Story title and description for context
   * @param videoId YouTube video ID for cache directory
   * @returns Array of translated pages
   */
  public async translatePages(
    pages: StoryPageData[],
    storyContext: string,
    videoId: string
  ): Promise<StoryPageData[]> {
    const translatedPages: StoryPageData[] = [];

    for (const page of pages) {
      const translation = await this.translateSinglePage(page, storyContext, videoId);

      translatedPages.push({
        ...page,
        englishTranslation: translation
      });
    }

    return translatedPages;
  }

  /**
   * Translates a single page from Vietnamese to English.
   *
   * Features:
   * - Checks cache before making API call
   * - Includes story context in prompt
   * - Retries on transient failures
   * - Falls back to untranslated text on error
   *
   * @param page Story page data with Vietnamese text
   * @param storyContext Story context for consistent translation
   * @param videoId Video ID for cache location
   * @returns English translation
   */
  public async translateSinglePage(
    page: StoryPageData,
    storyContext: string,
    videoId: string
  ): Promise<string> {
    // Check cache first
    const cacheKey = this.generateCacheKey(videoId, page.pageNumber, page.vietnameseText);
    const cached = await this.getCachedTranslation(videoId, cacheKey);

    if (cached) {
      return cached.englishTranslation;
    }

    // Build translation prompt
    const prompt = this.buildTranslationPrompt(page.vietnameseText, storyContext);

    // Attempt translation with retry logic
    try {
      const translation = await this.callOpenAIWithRetry(prompt);

      // Calculate tokens and cost (estimate)
      const estimatedTokens = Math.ceil((prompt.length + translation.length) / 4);
      const estimatedCost = estimatedTokens * (this.INPUT_TOKEN_COST + this.OUTPUT_TOKEN_COST) / 2;

      this.totalTokens += estimatedTokens;
      this.totalCost += estimatedCost;

      // Cache the translation
      await this.cacheTranslation(videoId, cacheKey, {
        key: cacheKey,
        vietnameseText: page.vietnameseText,
        englishTranslation: translation,
        timestamp: new Date().toISOString(),
        tokens: estimatedTokens
      });

      return translation;
    } catch (error: any) {
      console.warn(
        `Translation failed for page ${page.pageNumber}: ${error.message}. Using untranslated text.`
      );
      return page.vietnameseText;
    }
  }

  /**
   * Builds a context-aware translation prompt.
   *
   * The prompt includes:
   * - System instructions for professional translation
   * - Story context for narrative consistency
   * - Vietnamese text to translate
   * - Instructions to preserve tone and flow
   *
   * @param text Vietnamese text to translate
   * @param context Story title and description
   * @returns Complete translation prompt
   */
  public buildTranslationPrompt(text: string, context: string): string {
    return `Translate the following Vietnamese text to natural, readable English.

STORY CONTEXT:
${context}

VIETNAMESE TEXT:
${text}

REQUIREMENTS:
- Translate to natural, conversational English
- Preserve the story's tone and narrative flow
- Maintain the emotional quality of the original text
- Use age-appropriate vocabulary for children
- Keep the translation concise and readable

Return ONLY the English translation, with no additional commentary.`;
  }

  /**
   * Calls OpenAI API with retry logic for transient failures.
   *
   * Retry strategy:
   * - Up to 3 attempts
   * - Exponential backoff (1s, 2s, 4s)
   * - Handles rate limiting (429 errors)
   * - Handles network errors
   *
   * @param prompt Translation prompt
   * @returns Translated text
   * @throws Error if all retries fail
   */
  private async callOpenAIWithRetry(prompt: string, maxRetries = 3): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a professional translator specializing in Vietnamese to English translation. " +
                "Translate Vietnamese to natural, readable English while preserving the story's tone and narrative flow."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.3, // Lower temperature for more consistent translations
          max_tokens: 500
        });

        const translation = response.choices[0]?.message?.content?.trim();

        if (!translation) {
          throw new Error("Empty response from OpenAI API");
        }

        // Track actual token usage if available
        if (response.usage) {
          this.totalTokens = response.usage.total_tokens;
          const cost =
            response.usage.prompt_tokens * this.INPUT_TOKEN_COST +
            response.usage.completion_tokens * this.OUTPUT_TOKEN_COST;
          this.totalCost += cost;
        }

        return translation;
      } catch (error: any) {
        lastError = error;

        // Check if it's a rate limit error (429)
        if (error.status === 429 && attempt < maxRetries) {
          const backoffDelay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          console.warn(
            `Rate limited by OpenAI. Retrying in ${backoffDelay / 1000}s (attempt ${attempt}/${maxRetries})...`
          );
          await this.sleep(backoffDelay);
          continue;
        }

        // Check if it's a network error
        if (
          (error.code === "ECONNRESET" ||
            error.code === "ETIMEDOUT" ||
            error.message?.includes("network")) &&
          attempt < maxRetries
        ) {
          const backoffDelay = Math.pow(2, attempt - 1) * 1000;
          console.warn(
            `Network error. Retrying in ${backoffDelay / 1000}s (attempt ${attempt}/${maxRetries})...`
          );
          await this.sleep(backoffDelay);
          continue;
        }

        // If it's not a retryable error, throw immediately
        throw error;
      }
    }

    throw lastError || new Error("Translation failed after maximum retries");
  }

  /**
   * Generates a cache key for a translation.
   *
   * Cache key is a hash of:
   * - Video ID
   * - Page number
   * - Vietnamese text
   *
   * This ensures unique cache entries for each page and video.
   *
   * @param videoId YouTube video ID
   * @param pageNumber Page number
   * @param text Vietnamese text
   * @returns SHA256 hash as cache key
   */
  private generateCacheKey(videoId: string, pageNumber: number, text: string): string {
    const data = `${videoId}:${pageNumber}:${text}`;
    return crypto.createHash("sha256").update(data, "utf-8").digest("hex");
  }

  /**
   * Caches a translation to disk.
   *
   * Cache location: .youtube-cache/VIDEO_ID/translations.json
   *
   * @param videoId Video ID
   * @param key Cache key
   * @param entry Translation cache entry
   */
  private async cacheTranslation(
    videoId: string,
    key: string,
    entry: TranslationCacheEntry
  ): Promise<void> {
    const cacheDir = path.join(this.cacheBasePath, videoId);
    await fsExtra.ensureDir(cacheDir);

    const cachePath = path.join(cacheDir, "translations.json");

    // Load existing cache
    let cache: TranslationCache = {};
    if (await fsExtra.pathExists(cachePath)) {
      cache = await fsExtra.readJson(cachePath, { encoding: "utf-8" });
    }

    // Add new entry
    cache[key] = entry;

    // Save cache
    await fsExtra.writeJson(cachePath, cache, {
      encoding: "utf-8",
      spaces: 2
    });
  }

  /**
   * Retrieves a cached translation.
   *
   * @param videoId Video ID
   * @param key Cache key
   * @returns Cached translation entry or null if not found
   */
  private async getCachedTranslation(
    videoId: string,
    key: string
  ): Promise<TranslationCacheEntry | null> {
    const cachePath = path.join(this.cacheBasePath, videoId, "translations.json");

    if (!(await fsExtra.pathExists(cachePath))) {
      return null;
    }

    const cache: TranslationCache = await fsExtra.readJson(cachePath, { encoding: "utf-8" });
    return cache[key] || null;
  }

  /**
   * Gets total token usage for the current session.
   */
  public getTotalTokens(): number {
    return this.totalTokens;
  }

  /**
   * Gets estimated total cost for the current session.
   */
  public getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Logs API cost summary (for verbose mode).
   */
  public logCostSummary(): void {
    console.log(`\nTranslation API Summary:`);
    console.log(`  Total tokens: ${this.totalTokens}`);
    console.log(`  Estimated cost: $${this.totalCost.toFixed(4)}`);
  }

  /**
   * Sleep utility for retry backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
