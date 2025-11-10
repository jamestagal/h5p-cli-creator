import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

/**
 * AI-generated crossword content from a single topic prompt
 *
 * Generates complete crossword puzzles using AI to create word/clue pairs
 * based on a topic description. The AI ensures answers are single words
 * suitable for crossword format.
 *
 * **Key Features:**
 * - Generate word/clue pairs from single topic prompt
 * - Control number of words generated (5-20 recommended)
 * - Apply difficulty levels affecting word length and complexity
 * - Optionally generate extra clue text for hints
 * - Validates AI-generated answers are single words (rejects multi-word)
 * - Fallback content if AI generation fails
 * - Universal AI configuration support (targetAudience, tone, customization)
 *
 * **Difficulty Levels:**
 * - **Easy:** Simple vocabulary, obvious clues, word length 5-8 letters
 * - **Medium:** Moderate vocabulary, requires thinking, word length 6-12 letters
 * - **Hard:** Academic vocabulary, cryptic clues, word length 8-15 letters
 *
 * **AI Prompt Strategy:**
 * The AI is prompted to generate word/clue pairs that:
 * 1. Are single words only (critical for crossword format)
 * 2. Have enough common letters to allow grid placement
 * 3. Match the difficulty level requested
 * 4. Are factually correct and educational
 * 5. Include optional extra clue text for hints
 *
 * **Example AI Prompt:**
 * ```
 * Generate exactly 10 crossword puzzle clues and answers about planets.
 *
 * Requirements:
 * - Each answer must be a SINGLE WORD (no spaces, hyphens allowed)
 * - Word length: 6-12 letters
 * - Clues should be educational but not too obvious
 * - Mix of planet names, features, moons, and related terms
 * - Include an "extraClue" field with additional hint text (1-2 sentences)
 *
 * Format as JSON array:
 * [
 *   {
 *     "clue": "The red planet",
 *     "answer": "Mars",
 *     "extraClue": "Fourth planet from the Sun, known for its rusty color"
 *   }
 * ]
 *
 * Return ONLY the JSON array with no markdown or additional text.
 * ```
 *
 * **H5P Content Generation:**
 * Once AI generates words, the handler builds the same H5P.Crossword structure
 * as the manual CrosswordHandler, with automatic grid generation handled by
 * the H5P library client-side.
 */
export interface AICrosswordContent {
  type: "ai-crossword";
  title?: string;

  /**
   * Topic prompt for AI to generate crossword content
   *
   * Example: "Create a crossword puzzle about planets in our solar system"
   */
  prompt: string; // Required

  /**
   * Number of words to generate (recommended: 5-20)
   * Default: 10
   */
  wordCount?: number;

  /**
   * Difficulty level affecting word length and clue complexity
   * - easy: 5-8 letters, simple vocabulary, obvious clues
   * - medium: 6-12 letters, moderate vocabulary, requires thinking
   * - hard: 8-15 letters, academic vocabulary, cryptic clues
   * Default: "medium"
   */
  difficulty?: "easy" | "medium" | "hard";

  /**
   * Generate extra clue text as hints (H5P.AdvancedText)
   * Default: false
   */
  includeExtraClues?: boolean;

  /**
   * Universal AI Configuration
   *
   * Controls reading level, tone, and customization for AI generation.
   * Uses AIPromptBuilder.resolveConfig() for configuration hierarchy.
   */
  aiConfig?: {
    /**
     * Target audience reading level
     * Examples: "kindergarten", "grade-3", "grade-6", "high-school", "college"
     */
    targetAudience?: string;

    /**
     * Tone of the generated content
     * Examples: "educational", "professional", "casual", "formal"
     */
    tone?: string;

    /**
     * Additional customization instructions for the AI
     * Example: "Focus on planet names, moons, and key features"
     */
    customization?: string;
  };
}

/**
 * Handler for AI-generated H5P.Crossword content
 *
 * Creates crossword puzzles using AI to generate word/clue pairs from a topic prompt.
 * The AI ensures answers are single words suitable for crossword format.
 *
 * AI-generated usage in YAML:
 * ```yaml
 * - type: ai-crossword
 *   title: "Solar System Crossword"
 *   prompt: "Create a crossword puzzle about planets in our solar system"
 *   wordCount: 10
 *   difficulty: "medium"
 *   includeExtraClues: true
 *   aiConfig:
 *     targetAudience: "grade-6"
 *     tone: "educational"
 *     customization: "Focus on planet names, moons, and key features"
 * ```
 */
export class AICrosswordHandler implements ContentHandler {
  /**
   * Returns the content type identifier this handler supports
   */
  public getContentType(): string {
    return "ai-crossword";
  }

  /**
   * Returns the required H5P libraries for this content type
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Crossword"];
  }

  /**
   * Validates AI crossword content structure
   *
   * Validation rules:
   * - prompt field is required (non-empty string)
   * - wordCount must be positive integer (1-50) if provided
   * - difficulty must be one of: "easy", "medium", "hard" if provided
   * - includeExtraClues must be boolean if provided
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // TODO: Implement validation in Task Group 3
    return { valid: true };
  }

  /**
   * Processes AI crossword content and generates H5P package structure
   *
   * Workflow:
   * 1. Determine effective parameters (wordCount, difficulty defaults)
   * 2. Call generateCrosswordWords() to get AI-generated words
   * 3. Build H5P.Crossword content structure (same as manual handler)
   * 4. Apply default behaviour settings
   * 5. Generate extra clues if includeExtraClues=true
   */
  public async process(
    context: HandlerContext,
    item: AICrosswordContent
  ): Promise<void> {
    // TODO: Implement AI generation and H5P content building in Task Group 3
  }

  /**
   * Returns difficulty-specific guidance for AI prompt
   *
   * Provides detailed instructions to the AI based on difficulty level,
   * affecting word length, vocabulary complexity, and clue difficulty.
   */
  private getDifficultyGuidance(difficulty: "easy" | "medium" | "hard"): string {
    switch (difficulty) {
      case "easy":
        return "Use simple vocabulary and straightforward concepts. Word length: 5-8 letters. Choose common, everyday words that students would recognize immediately.";

      case "medium":
        return "Use moderate vocabulary requiring some thinking. Word length: 6-12 letters. Mix common and technical terms appropriate for standard educational level.";

      case "hard":
        return "Use complex academic vocabulary. Word length: 8-15 letters. Choose challenging words requiring deep subject understanding and technical knowledge.";
    }
  }

  /**
   * Generates crossword words using AI based on prompt and difficulty
   *
   * Builds AI prompt with:
   * - System prompt using AIPromptBuilder.resolveConfig() and buildSystemPrompt()
   * - User prompt with difficulty-specific instructions
   * - Enforcement of SINGLE WORD answers (critical requirement)
   * - Request for exact wordCount
   * - Optional request for extra clue text
   *
   * Returns array of word/clue pairs after parsing and validation.
   * Skips multi-word answers with warning logged.
   */
  private async generateCrosswordWords(
    context: HandlerContext,
    item: AICrosswordContent
  ): Promise<Array<{ clue: string; answer: string; extraClue?: string }>> {
    // TODO: Implement AI generation in Task Group 3
    return [];
  }

  /**
   * Parses AI response JSON and validates word structure
   *
   * Processing:
   * - Strips markdown code fences (```json) from AI response
   * - Parses JSON array of word/clue pairs
   * - Validates each word has clue and answer fields
   * - **CRITICAL:** Skips multi-word answers (with spaces) and logs warning
   * - Strips HTML tags from all AI-generated text using stripHtml()
   * - Returns cleaned array of words
   */
  private parseAIResponse(
    response: string
  ): Array<{ clue: string; answer: string; extraClue?: string }> {
    // TODO: Implement AI response parsing in Task Group 3
    return [];
  }

  /**
   * Returns fallback crossword content if AI generation fails
   *
   * Generates 5 generic words indicating AI generation failed.
   * Fallback clues include prompt snippet for context.
   */
  private getFallbackContent(
    prompt: string
  ): Array<{ clue: string; answer: string; extraClue?: string }> {
    // TODO: Implement fallback content in Task Group 3
    return [];
  }

  /**
   * Strips all HTML tags from text (sanitizes AI responses)
   */
  private stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, "");
  }

  /**
   * Escapes HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Generates a unique sub-content ID for H5P sub-content structures
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
