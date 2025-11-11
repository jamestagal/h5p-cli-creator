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
 * Internal structure for AI-generated crossword words
 */
interface GeneratedWord {
  clue: string;
  answer: string;
  extraClue?: string;
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
    // Validate prompt (required)
    if (!item.prompt) {
      return {
        valid: false,
        error: "AI-crossword requires 'prompt' field. Please provide a topic or theme for generating crossword content."
      };
    }

    if (typeof item.prompt !== "string") {
      return {
        valid: false,
        error: "Field 'prompt' must be a string"
      };
    }

    if (item.prompt.trim() === "") {
      return {
        valid: false,
        error: "Field 'prompt' must be non-empty"
      };
    }

    // Validate wordCount if provided
    if (item.wordCount !== undefined) {
      if (typeof item.wordCount !== "number" || !Number.isInteger(item.wordCount)) {
        return {
          valid: false,
          error: "Field 'wordCount' must be an integer"
        };
      }

      if (item.wordCount < 1) {
        return {
          valid: false,
          error: "wordCount must be a positive integer (at least 1)"
        };
      }

      if (item.wordCount > 50) {
        return {
          valid: false,
          error: "wordCount must not exceed 50 words (recommended: 5-20)"
        };
      }
    }

    // Validate difficulty if provided
    if (item.difficulty !== undefined) {
      if (!["easy", "medium", "hard"].includes(item.difficulty)) {
        return {
          valid: false,
          error: "difficulty must be one of: easy, medium, hard"
        };
      }
    }

    // Validate includeExtraClues if provided
    if (item.includeExtraClues !== undefined) {
      if (typeof item.includeExtraClues !== "boolean") {
        return {
          valid: false,
          error: "includeExtraClues must be boolean"
        };
      }
    }

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
    const { chapterBuilder, logger, options } = context;

    // Determine effective parameters with defaults
    const wordCount = item.wordCount || 10;
    const difficulty = item.difficulty || "medium";
    const includeExtraClues = item.includeExtraClues !== undefined
      ? item.includeExtraClues
      : false;

    if (options.verbose) {
      logger.log(`    - Generating AI crossword: "${item.title || 'Untitled'}"`);
      logger.log(`      Prompt: "${item.prompt}"`);
      logger.log(`      Word count: ${wordCount}, Difficulty: ${difficulty}, Extra clues: ${includeExtraClues}`);
    }

    // Generate crossword words using AI
    const generatedWords = await this.generateCrosswordWords(
      context,
      item.prompt,
      wordCount,
      difficulty,
      includeExtraClues,
      item.aiConfig
    );

    if (options.verbose) {
      logger.log(`      ✓ Generated ${generatedWords.length} words`);
    }

    // Build task description with HTML formatting (if provided)
    const taskDescription = "";

    // Build H5P words array
    const h5pWords = generatedWords.map(word => {
      const h5pWord: any = {
        clue: this.escapeHtml(word.clue),
        answer: word.answer,
        orientation: "across", // Auto-determined by H5P client-side
        fixWord: false // Don't manually position words
      };

      // Add extra clue if generated
      if (word.extraClue) {
        h5pWord.extraClue = this.buildTextExtraClue(word.extraClue);
      }

      return h5pWord;
    });

    // Build behaviour settings with sensible defaults
    const behaviour: any = {
      enableInstantFeedback: false,
      scoreWords: true,
      applyPenalties: false,
      enableRetry: true,
      enableSolutionsButton: true,
      keepCorrectAnswers: false,
      poolSize: 0 // Use all words
    };

    // Build overall feedback ranges
    const overallFeedback = [
      { from: 0, to: 49, feedback: "Keep practicing!" },
      { from: 50, to: 79, feedback: "Good work!" },
      { from: 80, to: 100, feedback: "Excellent!" }
    ];

    // Build H5P.Crossword structure
    const h5pContent: any = {
      library: "H5P.Crossword 0.5",
      params: {
        taskDescription: taskDescription,
        words: h5pWords,
        behaviour: behaviour,
        overallFeedback: overallFeedback,

        // UI labels (l10n)
        l10n: {
          across: "Across",
          down: "Down",
          checkAnswer: "Check",
          submitAnswer: "Submit",
          showSolution: "Show solution",
          tryAgain: "Retry",
          extraClue: "Extra clue",
          closeWindow: "Close window",
          couldNotGenerateCrossword: "Could not generate crossword with those words",
          couldNotGenerateCrosswordTooFewWords: "Could not generate crossword. You need at least two words."
        },

        // Accessibility labels (a11y)
        a11y: {
          crosswordGrid: "Crossword grid. Use arrow keys to navigate and keyboard to enter characters. Use tab to navigate to clue list.",
          column: "column",
          row: "row",
          across: "across",
          down: "down",
          empty: "Empty",
          resultFor: "Result for",
          correct: "Correct",
          wrong: "Wrong",
          point: "Point",
          solutionFor: "Solution for",
          extraClue: "Extra clue",
          letterSevenOfNine: "Letter @position of @length",
          lettersWord: "Letters of the word:",
          check: "Check the characters. Correct answers will be marked with a green background, wrong answers with a red background.",
          showSolution: "Show the solution. The crossword will be filled with the correct answers.",
          retry: "Retry the task. Reset all responses and start the task over again.",
          solutionText: "Solution",
          clueText: "Clue"
        }
      },
      metadata: {
        title: item.title || "AI-Generated Crossword",
        license: "U",
        contentType: "Crossword"
      },
      subContentId: this.generateSubContentId()
    };

    chapterBuilder.addCustomContent(h5pContent);
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
    prompt: string,
    wordCount: number,
    difficulty: "easy" | "medium" | "hard",
    includeExtraClues: boolean,
    aiConfig?: { targetAudience?: string; tone?: string; customization?: string }
  ): Promise<GeneratedWord[]> {
    const { quizGenerator, logger, options } = context;

    try {
      // Build system prompt using AIPromptBuilder
      const resolvedConfig = AIPromptBuilder.resolveConfig(
        aiConfig as any,
        context.chapterConfig,
        context.bookConfig
      );

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

      // Get difficulty-specific guidance
      const difficultyGuidance = this.getDifficultyGuidance(difficulty);

      // Build user prompt with difficulty and extra clue instructions
      const extraClueInstruction = includeExtraClues
        ? '\n- Include an "extraClue" field with additional hint text (1-2 sentences)'
        : "";

      const userPrompt = `${prompt}

Generate exactly ${wordCount} crossword puzzle clues and answers.

${difficultyGuidance}

${aiConfig?.customization || ""}

CRITICAL REQUIREMENTS:
- Each answer MUST be a SINGLE WORD (absolutely no spaces allowed)
- Hyphens are allowed for compound words (e.g., "New-York")
- Ensure words have common letters to allow grid placement
- Make clues clear and educational
- Answers should be factually correct${extraClueInstruction}

Format your response as a JSON array with this exact structure:
[
  {
    "clue": "The red planet",
    "answer": "Mars"${includeExtraClues ? ',\n    "extraClue": "Fourth planet from the Sun, known for its rusty color"' : ""}
  }
]

Return ONLY the JSON array with no additional text or markdown code blocks.`;

      if (options.verbose) {
        logger.log(`      Calling AI to generate ${wordCount} words...`);
      }

      // Call AI service to generate content
      const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

      if (options.verbose) {
        logger.log(`      AI response received (${response.length} characters)`);
      }

      // Parse AI response
      const words = this.parseAIResponse(response, logger, options);

      // Ensure we have at least 2 words (minimum for crossword)
      if (words.length < 2) {
        throw new Error(`AI generated only ${words.length} word(s), minimum 2 required`);
      }

      // Limit to requested count
      const finalWords = words.slice(0, wordCount);

      return finalWords;
    } catch (error) {
      logger.log(`      ⚠ AI crossword generation failed: ${error.message}`);
      logger.log(`      Using fallback content`);

      // Return fallback content
      return this.getFallbackContent(prompt, wordCount);
    }
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
    response: string,
    logger: any,
    options: any
  ): GeneratedWord[] {
    // Strip markdown code fences (```json ... ```)
    const cleaned = response.trim()
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    // Parse JSON array
    const rawWords = JSON.parse(cleaned);

    if (!Array.isArray(rawWords)) {
      throw new Error("AI response is not an array");
    }

    // Validate and clean each word
    const validatedWords: GeneratedWord[] = [];

    for (const word of rawWords) {
      // Validate required fields
      if (!word.clue || typeof word.clue !== "string") {
        if (options.verbose) {
          logger.log(`      ⚠ Skipping word with missing/invalid clue`);
        }
        continue;
      }

      if (!word.answer || typeof word.answer !== "string") {
        if (options.verbose) {
          logger.log(`      ⚠ Skipping word with missing/invalid answer`);
        }
        continue;
      }

      // CRITICAL: Validate single word (no spaces)
      if (word.answer.includes(" ")) {
        logger.log(`      ⚠ AI generated multi-word answer '${word.answer}' which was skipped. Only single words are allowed.`);
        continue;
      }

      // Strip HTML tags from AI-generated text
      const cleanedWord: GeneratedWord = {
        clue: this.stripHtml(word.clue),
        answer: word.answer.trim()
      };

      // Include extra clue if present
      if (word.extraClue && typeof word.extraClue === "string") {
        cleanedWord.extraClue = this.stripHtml(word.extraClue);
      }

      validatedWords.push(cleanedWord);
    }

    return validatedWords;
  }

  /**
   * Returns fallback crossword content if AI generation fails
   *
   * Generates 5 generic words indicating AI generation failed.
   * Fallback clues include prompt snippet for context.
   */
  private getFallbackContent(
    prompt: string,
    count: number
  ): GeneratedWord[] {
    const fallbackWords: GeneratedWord[] = [
      {
        clue: `AI generation failed for prompt: "${prompt}". Please check your API key and try again.`,
        answer: "Failed"
      },
      {
        clue: "This is fallback word 2",
        answer: "Fallback"
      },
      {
        clue: "This is fallback word 3",
        answer: "Error"
      },
      {
        clue: "This is fallback word 4",
        answer: "Warning"
      },
      {
        clue: "This is fallback word 5",
        answer: "Retry"
      }
    ];

    // Return requested count (up to 5 fallback words)
    return fallbackWords.slice(0, Math.min(count, 5));
  }

  /**
   * Builds H5P.AdvancedText sub-content structure for text extra clues
   */
  private buildTextExtraClue(content: string): any {
    return {
      library: "H5P.AdvancedText 1.1",
      params: {
        text: `<p>${this.escapeHtml(content)}</p>`
      },
      metadata: {
        contentType: "Text",
        license: "U",
        title: "Untitled Text"
      },
      subContentId: this.generateSubContentId()
    };
  }

  /**
   * Strips all HTML tags from text (sanitizes AI responses)
   */
  private stripHtml(text: string): string {
    return text
      .replace(/<\/?p>/gi, "")  // Remove <p> and </p> tags
      .replace(/<br\s*\/?>/gi, " ")  // Replace <br> with space
      .replace(/<[^>]+>/g, "")  // Remove any other HTML tags
      .trim();
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
