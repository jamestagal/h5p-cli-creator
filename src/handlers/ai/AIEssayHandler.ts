import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";
import { AIPromptBuilder } from "../../ai/AIPromptBuilder";

/**
 * AI-generated essay content from a single prompt
 */
export interface AIEssayContent {
  type: "ai-essay";
  title?: string;
  prompt: string; // "Create an essay question about photosynthesis for high school students"

  keywordCount?: number; // Default: 5
  includeAlternatives?: boolean; // Generate synonyms for keywords, default: true
  includeSampleSolution?: boolean; // Generate example answer, default: true

  difficulty?: "easy" | "medium" | "hard";
  // Easy: 3-5 keywords, 50-200 chars, simple vocabulary
  // Medium: 5-7 keywords, 100-500 chars, moderate vocabulary
  // Hard: 7-10 keywords, 200-1000 chars, advanced vocabulary

  minimumLength?: number; // Override difficulty default
  maximumLength?: number; // Override difficulty default

  // Universal AI Configuration
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}

/**
 * AI response structure for essay generation
 */
interface EssayResult {
  taskDescription: string;
  placeholderText?: string;
  keywords: Array<{
    keyword: string;
    alternatives?: string[];
    points?: number;
    feedbackIncluded?: string;
    feedbackMissed?: string;
  }>;
  solution?: {
    introduction?: string;
    sample?: string;
  };
}

/**
 * Handler for AI-generated H5P.Essay content
 *
 * Creates essay questions with keyword-based automatic scoring using AI.
 *
 * AI-generated usage in YAML:
 * ```yaml
 * - type: ai-essay
 *   title: "Photosynthesis Essay"
 *   prompt: |
 *     Create an essay question about the process of photosynthesis,
 *     including the role of chlorophyll, sunlight, and carbon dioxide.
 *     Target high school biology students.
 *   keywordCount: 7
 *   includeAlternatives: true
 *   includeSampleSolution: true
 *   difficulty: "medium"
 *   minimumLength: 150
 *   maximumLength: 600
 *   aiConfig:
 *     targetAudience: "high-school"
 *     tone: "educational"
 * ```
 */
export class AIEssayHandler implements ContentHandler {
  /**
   * Returns the content type identifiers this handler supports
   */
  public getContentType(): string {
    return "ai-essay";
  }

  /**
   * Validates AI essay content structure
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // Validate prompt (required)
    if (!item.prompt) {
      return {
        valid: false,
        error: "AI-essay requires 'prompt' field. Please provide a prompt for generating essay questions."
      };
    }

    if (typeof item.prompt !== "string") {
      return {
        valid: false,
        error: "Field 'prompt' must be a string"
      };
    }

    if (item.prompt.length < 10) {
      return {
        valid: false,
        error: "Field 'prompt' must be at least 10 characters long"
      };
    }

    // Validate keywordCount (optional, 1-20)
    if (item.keywordCount !== undefined) {
      if (typeof item.keywordCount !== "number") {
        return {
          valid: false,
          error: "Field 'keywordCount' must be a number"
        };
      }
      if (item.keywordCount < 1 || item.keywordCount > 20) {
        return {
          valid: false,
          error: "keywordCount must be between 1 and 20"
        };
      }
    }

    // Validate includeAlternatives (optional boolean)
    if (item.includeAlternatives !== undefined && typeof item.includeAlternatives !== "boolean") {
      return {
        valid: false,
        error: "Field 'includeAlternatives' must be boolean"
      };
    }

    // Validate includeSampleSolution (optional boolean)
    if (item.includeSampleSolution !== undefined && typeof item.includeSampleSolution !== "boolean") {
      return {
        valid: false,
        error: "Field 'includeSampleSolution' must be boolean"
      };
    }

    // Validate difficulty (optional enum)
    if (item.difficulty !== undefined) {
      const validDifficulties = ["easy", "medium", "hard"];
      if (!validDifficulties.includes(item.difficulty)) {
        return {
          valid: false,
          error: `Field 'difficulty' must be one of: ${validDifficulties.join(", ")}`
        };
      }
    }

    // Validate minimumLength (optional non-negative integer)
    if (item.minimumLength !== undefined) {
      if (typeof item.minimumLength !== "number" || !Number.isInteger(item.minimumLength)) {
        return {
          valid: false,
          error: "Field 'minimumLength' must be an integer"
        };
      }
      if (item.minimumLength < 0) {
        return {
          valid: false,
          error: "minimumLength must be a non-negative integer"
        };
      }
    }

    // Validate maximumLength (optional non-negative integer)
    if (item.maximumLength !== undefined) {
      if (typeof item.maximumLength !== "number" || !Number.isInteger(item.maximumLength)) {
        return {
          valid: false,
          error: "Field 'maximumLength' must be an integer"
        };
      }
      if (item.maximumLength < 0) {
        return {
          valid: false,
          error: "maximumLength must be a non-negative integer"
        };
      }
    }

    // CRITICAL: Cross-field validation (maximumLength > minimumLength)
    if (item.minimumLength !== undefined && item.maximumLength !== undefined) {
      if (item.maximumLength <= item.minimumLength) {
        return {
          valid: false,
          error: `maximumLength (${item.maximumLength}) must be greater than minimumLength (${item.minimumLength})`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Processes AI essay content and adds it to the chapter
   */
  public async process(context: HandlerContext, item: AIEssayContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    // Determine effective parameters
    const difficulty = item.difficulty || "medium";
    const keywordCount = item.keywordCount || this.getDefaultKeywordCount(difficulty);
    const includeAlternatives = item.includeAlternatives !== undefined ? item.includeAlternatives : true;
    const includeSampleSolution = item.includeSampleSolution !== undefined ? item.includeSampleSolution : true;

    // Determine character limits based on difficulty (can be overridden)
    const { minimumLength, maximumLength } = this.getCharacterLimits(
      difficulty,
      item.minimumLength,
      item.maximumLength
    );

    if (options.verbose) {
      logger.log(`    - Generating AI essay: "${item.title || 'Untitled'}"`);
      logger.log(`      Prompt: "${item.prompt.substring(0, 60)}${item.prompt.length > 60 ? '...' : ''}"`);
      logger.log(`      Keyword count: ${keywordCount}`);
      logger.log(`      Difficulty: ${difficulty}`);
      logger.log(`      Character limits: ${minimumLength}-${maximumLength}`);
    }

    // Generate essay content using AI
    const essayResult = await this.generateEssayContent(
      context,
      item.prompt,
      keywordCount,
      includeAlternatives,
      includeSampleSolution,
      difficulty,
      minimumLength,
      maximumLength,
      item.aiConfig
    );

    if (options.verbose) {
      logger.log(`      ✓ Generated essay with ${essayResult.keywords.length} keywords`);
    }

    // Build H5P Essay structure using the generated content
    await this.buildH5PStructure(context, item, essayResult, minimumLength, maximumLength);
  }

  /**
   * Generates essay content using AI
   */
  private async generateEssayContent(
    context: HandlerContext,
    prompt: string,
    keywordCount: number,
    includeAlternatives: boolean,
    includeSampleSolution: boolean,
    difficulty: "easy" | "medium" | "hard",
    minimumLength: number,
    maximumLength: number,
    aiConfig?: { targetAudience?: string; tone?: string; customization?: string }
  ): Promise<EssayResult> {
    const { quizGenerator, logger, options } = context;

    try {
      // Build system prompt for essay generation
      const resolvedConfig = AIPromptBuilder.resolveConfig(
        aiConfig as any,
        context.chapterConfig,
        context.bookConfig
      );

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

      // Build difficulty-specific guidance
      let difficultyGuidance = this.getDifficultyGuidance(difficulty);

      // Build user prompt
      const alternativesInstruction = includeAlternatives
        ? `For each keyword, provide 2-3 alternative words or phrases (synonyms) that would also be acceptable answers. These help make scoring fair and comprehensive.`
        : `Do not include alternatives for keywords.`;

      const solutionInstruction = includeSampleSolution
        ? `Include a sample solution with:
- "introduction": A brief introduction to the sample solution (2-3 sentences)
- "sample": A complete example answer that demonstrates the expected response (3-5 sentences)`
        : `Do not include a solution object.`;

      const userPrompt = `${prompt}

Generate an essay question with the following parameters:
- Number of keywords: ${keywordCount}
- Difficulty level: ${difficulty.toUpperCase()}
- Character range: ${minimumLength}-${maximumLength} characters expected in student response

${difficultyGuidance}

${alternativesInstruction}

${solutionInstruction}

IMPORTANT: Provide per-keyword feedback:
- "feedbackIncluded": Positive feedback shown when the keyword is found in the student's essay (1 sentence)
- "feedbackMissed": Constructive feedback shown when the keyword is missing (1 sentence)

Format your response as a JSON object with this exact structure:
{
  "taskDescription": "Write a detailed essay about photosynthesis...",
  "placeholderText": "Begin by explaining...",
  "keywords": [
    {
      "keyword": "chlorophyll",
      "alternatives": ["chloroplast pigment", "green pigment"],
      "points": 2,
      "feedbackIncluded": "Excellent! You mentioned chlorophyll.",
      "feedbackMissed": "Remember to discuss the role of chlorophyll."
    },
    {
      "keyword": "sunlight",
      "alternatives": ["solar energy", "light energy"],
      "points": 2
    }
  ],
  "solution": {
    "introduction": "A strong answer should include...",
    "sample": "Photosynthesis is the process by which..."
  }
}

Return ONLY the JSON object with no additional text or markdown code blocks.`;

      // Use the quiz generator's AI client to generate essay
      const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

      if (options.verbose) {
        logger.log(`      AI response length: ${response.length} characters`);
      }

      // Parse and validate AI response
      return this.parseAIResponse(response);
    } catch (error) {
      logger.log(`      ⚠ AI essay generation failed: ${error.message}`);
      logger.log(`      Using fallback content`);

      // Return fallback content
      return this.getFallbackContent(prompt);
    }
  }

  /**
   * Parses and validates AI response
   */
  private parseAIResponse(response: string): EssayResult {
    // Strip markdown code fences
    const cleaned = response.trim()
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    // Parse JSON
    const data = JSON.parse(cleaned);

    // Validate required fields
    if (!data.taskDescription || typeof data.taskDescription !== "string") {
      throw new Error("AI response missing 'taskDescription' field (string)");
    }

    if (!data.keywords || !Array.isArray(data.keywords)) {
      throw new Error("AI response missing 'keywords' array");
    }

    if (data.keywords.length === 0) {
      throw new Error("AI response 'keywords' array is empty");
    }

    // Validate each keyword
    for (let i = 0; i < data.keywords.length; i++) {
      const keyword = data.keywords[i];
      if (!keyword.keyword || typeof keyword.keyword !== "string") {
        throw new Error(`Keyword ${i + 1} missing 'keyword' field (string)`);
      }
    }

    // Strip HTML from all AI-generated text
    const cleanedResult: EssayResult = {
      taskDescription: this.stripHtml(data.taskDescription),
      placeholderText: data.placeholderText ? this.stripHtml(data.placeholderText) : undefined,
      keywords: data.keywords.map((kw: any) => ({
        keyword: this.stripHtml(kw.keyword),
        alternatives: kw.alternatives && Array.isArray(kw.alternatives)
          ? kw.alternatives.map((alt: string) => this.stripHtml(alt))
          : undefined,
        points: kw.points,
        feedbackIncluded: kw.feedbackIncluded ? this.stripHtml(kw.feedbackIncluded) : undefined,
        feedbackMissed: kw.feedbackMissed ? this.stripHtml(kw.feedbackMissed) : undefined,
      })),
    };

    // Add solution if present
    if (data.solution) {
      cleanedResult.solution = {
        introduction: data.solution.introduction ? this.stripHtml(data.solution.introduction) : undefined,
        sample: data.solution.sample ? this.stripHtml(data.solution.sample) : undefined,
      };
    }

    return cleanedResult;
  }

  /**
   * Strips HTML tags from text
   */
  private stripHtml(text: string): string {
    return text
      .replace(/<\/?p>/gi, "")      // Remove <p> and </p> tags
      .replace(/<br\s*\/?>/gi, " ")  // Replace <br> with space
      .replace(/<[^>]+>/g, "")       // Remove all other HTML tags
      .trim();
  }

  /**
   * Builds H5P Essay structure and adds to chapter
   */
  private async buildH5PStructure(
    context: HandlerContext,
    item: AIEssayContent,
    essayResult: EssayResult,
    minimumLength: number,
    maximumLength: number
  ): Promise<void> {
    const { chapterBuilder } = context;

    // Build task description with HTML formatting (escape AFTER stripping)
    const taskDescription = `<p>${this.escapeHtml(essayResult.taskDescription)}</p>`;

    // Build keywords array for H5P
    const h5pKeywords = essayResult.keywords.map((keyword) => {
      const h5pKeyword: any = {
        keyword: keyword.keyword, // CRITICAL: Preserve wildcards (*) and regex (/pattern/) if AI generated them
        options: {
          caseSensitive: true,
          forgiveMistakes: false,
        },
      };

      // Add alternatives array if provided (H5P expects array format)
      if (keyword.alternatives && keyword.alternatives.length > 0) {
        h5pKeyword.alternatives = keyword.alternatives;
      }

      // Add points (default: 1)
      h5pKeyword.points = keyword.points !== undefined ? keyword.points : 1;

      // Add occurrences (default: 1)
      h5pKeyword.occurrences = 1;

      // Add feedback strings (escape HTML)
      if (keyword.feedbackIncluded) {
        h5pKeyword.feedbackIncluded = this.escapeHtml(keyword.feedbackIncluded);
      }
      if (keyword.feedbackMissed) {
        h5pKeyword.feedbackMissed = this.escapeHtml(keyword.feedbackMissed);
      }

      return h5pKeyword;
    });

    // Build behaviour object
    const behaviour: any = {
      enableRetry: true,
      inputFieldSize: "10",
      ignoreScoring: false,
      percentagePassing: 50,
      percentageMastering: 100,
      minimumLength: minimumLength,
      maximumLength: maximumLength,
    };

    // Build solution object if provided
    let solution: any = undefined;
    if (essayResult.solution) {
      solution = {};
      if (essayResult.solution.introduction) {
        solution.introduction = `<p>${this.escapeHtml(essayResult.solution.introduction)}</p>`;
      }
      if (essayResult.solution.sample) {
        solution.sample = `<p>${this.escapeHtml(essayResult.solution.sample)}</p>`;
      }
    }

    // Build overall feedback ranges
    const overallFeedback = [
      { from: 0, to: 49, feedback: "You could improve your essay. Review the feedback." },
      { from: 50, to: 79, feedback: "Good work! You included some important points." },
      { from: 80, to: 100, feedback: "Excellent! Your essay covers all the key points." },
    ];

    // Build H5P Essay structure
    const h5pContent: any = {
      library: "H5P.Essay 1.5",
      params: {
        taskDescription: taskDescription,
        placeholderText: essayResult.placeholderText || "",
        keywords: h5pKeywords,
        overallFeedback: overallFeedback,
        behaviour: behaviour,

        // UI labels
        checkAnswer: "Check",
        submitAnswer: "Submit",
        tryAgain: "Retry",
        showSolution: "Show solution",
        feedbackHeader: "Feedback",
        solutionTitle: "Sample solution",

        // Accessibility labels
        remainingChars: "Remaining characters: @chars",
        notEnoughChars: "You must enter at least @chars characters!",
        messageSave: "saved",
        messageSaving: "Saving...",
        messageSubmitted: "Your answer has been submitted",
        messageSubmitting: "Submitting...",
      },
      metadata: {
        title: item.title || "Essay",
        license: "U",
        contentType: "Essay",
      },
      subContentId: this.generateSubContentId(),
    };

    // Add solution if provided
    if (solution) {
      h5pContent.params.solution = solution;
    }

    chapterBuilder.addCustomContent(h5pContent);
  }

  /**
   * Provides fallback content if AI generation fails
   */
  private getFallbackContent(prompt: string): EssayResult {
    const promptSnippet = prompt.substring(0, 60);
    return {
      taskDescription: `AI generation failed for prompt: "${promptSnippet}${prompt.length > 60 ? '...' : ''}". Please check your API configuration and try again. To troubleshoot: 1) Verify API key is set, 2) Check network connection, 3) Review prompt for clarity.`,
      placeholderText: "Describe your understanding of the error...",
      keywords: [
        {
          keyword: "error",
          alternatives: ["failure", "issue"],
          points: 1,
          feedbackMissed: "This is a fallback question due to AI generation failure."
        }
      ],
      solution: {
        introduction: "This is a fallback essay question because AI generation encountered an error.",
        sample: "Please review your AI configuration and try generating this content again."
      }
    };
  }

  /**
   * Returns default keyword count based on difficulty
   */
  private getDefaultKeywordCount(difficulty: "easy" | "medium" | "hard"): number {
    switch (difficulty) {
      case "easy":
        return 4; // 3-5 range
      case "medium":
        return 6; // 5-7 range
      case "hard":
        return 8; // 7-10 range
      default:
        return 5;
    }
  }

  /**
   * Returns character limits based on difficulty
   */
  private getCharacterLimits(
    difficulty: "easy" | "medium" | "hard",
    minOverride?: number,
    maxOverride?: number
  ): { minimumLength: number; maximumLength: number } {
    // Use overrides if provided
    if (minOverride !== undefined && maxOverride !== undefined) {
      return { minimumLength: minOverride, maximumLength: maxOverride };
    }

    // Default limits based on difficulty
    let minimumLength: number;
    let maximumLength: number;

    switch (difficulty) {
      case "easy":
        minimumLength = 50;
        maximumLength = 200;
        break;
      case "medium":
        minimumLength = 100;
        maximumLength = 500;
        break;
      case "hard":
        minimumLength = 200;
        maximumLength = 1000;
        break;
      default:
        minimumLength = 100;
        maximumLength = 500;
    }

    // Apply individual overrides
    if (minOverride !== undefined) {
      minimumLength = minOverride;
    }
    if (maxOverride !== undefined) {
      maximumLength = maxOverride;
    }

    return { minimumLength, maximumLength };
  }

  /**
   * Returns difficulty-specific guidance for AI prompt
   */
  private getDifficultyGuidance(difficulty: "easy" | "medium" | "hard"): string {
    switch (difficulty) {
      case "easy":
        return `EASY DIFFICULTY GUIDANCE:
- Use simple, everyday vocabulary appropriate for beginners
- Choose keywords that are obvious and clear
- Keep the essay prompt straightforward and easy to understand
- Use common, familiar terms
- Make the task accessible to students with basic knowledge`;

      case "medium":
        return `MEDIUM DIFFICULTY GUIDANCE:
- Use moderate, grade-level vocabulary
- Choose keywords that require some thought but are not obscure
- Balance between common and subject-specific terms
- Make the task moderately challenging
- Require analytical thinking`;

      case "hard":
        return `HARD DIFFICULTY GUIDANCE:
- Use advanced, subject-specific vocabulary
- Choose keywords that require deep understanding of the topic
- Include technical terms and specialized language
- Make the task challenging and thought-provoking
- Require complex analysis and synthesis`;

      default:
        return "";
    }
  }

  /**
   * Returns the H5P libraries required by this handler
   */
  public getRequiredLibraries(): string[] {
    return ["H5P.Essay"];
  }

  /**
   * Escapes HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Generates a unique sub-content ID for H5P content
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
