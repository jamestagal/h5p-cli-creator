import { AIConfiguration, ReadingLevel, Tone } from "../compiler/types";
import { LanguageUtils } from "./LanguageUtils";

/**
 * Reading level preset configuration.
 *
 * Each preset defines specific guidance for:
 * - Sentence length and structure
 * - Vocabulary complexity and technical term usage
 * - Writing style and tone
 * - Example types and context
 */
interface ReadingLevelPreset {
  sentenceLength: string;
  vocabulary: string;
  style: string;
  examples: string;
}

/**
 * AIPromptBuilder constructs complete prompts for AI content generation.
 *
 * This is a UNIVERSAL, STATELESS service that works across ALL AI-generated H5P content:
 * - Interactive Books (via BookDefinition.aiConfig)
 * - Smart Import API (via request.aiConfig)
 * - Standalone content generators (Flashcards, Dialog Cards, Summaries, etc.)
 *
 * Teachers write simple content prompts. This class adds all technical requirements:
 * - Non-negotiable HTML formatting rules
 * - Reading level-specific vocabulary and sentence structure guidance
 * - Tone and style specifications
 * - Multi-language content generation directives
 * - Custom instructions (if provided)
 *
 * All methods are static to ensure statelessness and universal reusability.
 */
export class AIPromptBuilder {
  /**
   * Reading level presets with vocabulary and structure guidelines.
   *
   * Each preset is based on educational standards and CEFR (Common European Framework of Reference).
   * Presets provide specific, actionable guidance to AI models for generating age-appropriate content.
   */
  private static readonly READING_LEVELS: Record<ReadingLevel, ReadingLevelPreset> = {
    "kindergarten": {
      sentenceLength: "Use very simple sentences (3-5 words). Keep structure basic.",
      vocabulary: "Use concrete nouns and basic verbs only. Avoid abstract concepts completely.",
      style: "Use a warm, supportive tone. Use repetition for learning.",
      examples: "Use simple, tangible examples: colors, animals, family members, basic actions."
    },
    "elementary": {
      sentenceLength: "Use very short sentences (8-12 words). Avoid complex sentence structures.",
      vocabulary: "Use simple, everyday vocabulary. Avoid technical terms. If a technical term is necessary, explain it in very simple words.",
      style: "Use a friendly, encouraging tone. Break concepts into very small steps.",
      examples: "Use concrete, tangible examples from everyday life. Avoid abstract concepts."
    },
    "grade-1": {
      sentenceLength: "Use simple sentences (5-7 words). Keep subject-verb-object order.",
      vocabulary: "Use common words and simple adjectives. Build basic vocabulary (100-300 words).",
      style: "Use a patient, encouraging tone. Use lots of repetition.",
      examples: "Use family, school, and playground examples. Keep very concrete."
    },
    "grade-2": {
      sentenceLength: "Use short sentences (7-10 words). Introduce basic compound sentences.",
      vocabulary: "Expand vocabulary to 300-500 words. Introduce simple descriptive language.",
      style: "Use a friendly, supportive tone. Build on known concepts.",
      examples: "Use examples from school, home, and neighborhood. Introduce simple cause-effect."
    },
    "grade-3": {
      sentenceLength: "Use medium sentences (8-12 words). Introduce conjunctions (and, but, so).",
      vocabulary: "Build vocabulary to 500-800 words. Introduce basic academic terms with definitions.",
      style: "Use an encouraging, instructional tone. Promote curiosity.",
      examples: "Use school subjects, hobbies, and community examples. Begin abstract thinking."
    },
    "grade-4": {
      sentenceLength: "Use varied sentences (10-15 words). Mix simple and compound sentences.",
      vocabulary: "Expand vocabulary to 800-1200 words. Introduce subject-specific terminology.",
      style: "Use a clear, engaging tone. Encourage independent thinking.",
      examples: "Use real-world applications from science, history, and current events."
    },
    "grade-5": {
      sentenceLength: "Use complex sentences (12-18 words). Introduce subordinate clauses.",
      vocabulary: "Build vocabulary to 1200-1500 words. Use more sophisticated academic language.",
      style: "Use an instructional, analytical tone. Promote critical thinking.",
      examples: "Use examples requiring analysis and comparison. Connect multiple concepts."
    },
    "grade-6": {
      sentenceLength: "Use medium-length sentences (12-15 words). Keep structure clear and direct.",
      vocabulary: "Use grade-appropriate vocabulary. Define technical terms when first introduced. Build on concepts students already know.",
      style: "Use a clear, instructional tone. Make concepts relatable to students' lives.",
      examples: "Use relatable examples from school, home, and popular culture. Include analogies when helpful."
    },
    "grade-7": {
      sentenceLength: "Use longer sentences (15-20 words). Vary structure with sophisticated transitions.",
      vocabulary: "Expand vocabulary to 2000-3000 words. Use discipline-specific terminology.",
      style: "Use an engaging, analytical tone. Promote deeper analysis.",
      examples: "Use current events, literature, and cross-disciplinary connections."
    },
    "grade-8": {
      sentenceLength: "Use complex sentences (18-25 words). Expect comprehension of nuanced arguments.",
      vocabulary: "Build vocabulary to 3000-4000 words. Introduce abstract concepts.",
      style: "Use a sophisticated, thought-provoking tone. Encourage debate and evaluation.",
      examples: "Use examples requiring synthesis of multiple sources and perspectives."
    },
    "grade-9": {
      sentenceLength: "Use longer sentences (15-20 words) with some complexity. Vary sentence structure for engagement.",
      vocabulary: "Use broader vocabulary. Introduce technical terms with brief definitions. Expect increasing subject knowledge.",
      style: "Use an engaging, analytical tone. Encourage critical thinking.",
      examples: "Use real-world applications and current events. Connect to broader themes."
    },
    "grade-10": {
      sentenceLength: "Use complex sentences (18-25 words). Expect comprehension of layered ideas.",
      vocabulary: "Use advanced vocabulary (5000-6000 words). Employ discipline-specific terminology.",
      style: "Use a challenging, analytical tone. Promote evaluation and synthesis.",
      examples: "Use college-prep examples, research concepts, and theoretical frameworks."
    },
    "grade-11": {
      sentenceLength: "Use sophisticated sentences (20-30 words). Vary structure for rhetorical effect.",
      vocabulary: "Use college-level vocabulary (6000-7000 words). Assume strong content knowledge.",
      style: "Use an academic, challenging tone. Encourage original analysis.",
      examples: "Use college-level analysis, research methods, and theoretical debates."
    },
    "grade-12": {
      sentenceLength: "Use advanced academic sentences (20-35 words). Expect mature comprehension.",
      vocabulary: "Use advanced vocabulary (7000-8000 words). Employ sophisticated academic language.",
      style: "Use a scholarly, rigorous tone. Promote independent scholarship.",
      examples: "Use advanced examples requiring synthesis, evaluation, and original thought."
    },
    "high-school": {
      sentenceLength: "Use complex sentences (18-25 words) with varied structure. Expect comprehension of compound ideas.",
      vocabulary: "Use advanced vocabulary and subject-specific terminology. Define only highly specialized terms.",
      style: "Use a sophisticated, academic tone. Promote analysis and evaluation.",
      examples: "Use college-level examples, research references, and interdisciplinary connections."
    },
    "college": {
      sentenceLength: "Use academic sentence structures of varying complexity. Expect comprehension of dense text.",
      vocabulary: "Use discipline-specific language freely. Assume foundational knowledge in the subject area.",
      style: "Use a scholarly, precise tone. Encourage synthesis and original thought.",
      examples: "Reference research, theories, and debates in the field. Assume intellectual maturity."
    },
    "professional": {
      sentenceLength: "Use concise, efficient sentences. Get to the point quickly.",
      vocabulary: "Use industry-standard terminology. Assume professional expertise.",
      style: "Use a professional, actionable tone. Focus on practical application.",
      examples: "Use industry case studies, best practices, and real-world scenarios. Emphasize ROI and outcomes."
    },
    "esl-beginner": {
      sentenceLength: "Use very short, simple sentences (5-8 words). Use subject-verb-object order consistently.",
      vocabulary: "Use only common, high-frequency vocabulary (top 1000-2000 words). Avoid idioms and slang.",
      style: "Use a patient, supportive tone. Repeat key concepts. Use explicit context.",
      examples: "Use universal concepts (food, family, weather, time). Avoid culturally specific references."
    },
    "esl-intermediate": {
      sentenceLength: "Use medium sentences (10-15 words). Introduce varied sentence patterns gradually.",
      vocabulary: "Expand vocabulary to everyday situations. Introduce common idioms with explanations. Use multiple tenses.",
      style: "Use a clear, encouraging tone. Build confidence with scaffolded complexity.",
      examples: "Include cultural context when introducing idioms. Use travel, work, and education scenarios."
    }
  };

  /**
   * Tone presets for content style.
   *
   * Defines the overall voice and approach of the generated content.
   * Each tone affects word choice, formality level, and relationship with the reader.
   */
  private static readonly TONES: Record<Tone, string> = {
    "educational": "Use a clear, instructional, and approachable tone. Make learning engaging and accessible. Explain concepts step-by-step.",
    "professional": "Use a formal, business-like tone. Be concise and action-oriented. Focus on practical outcomes.",
    "casual": "Use a conversational, friendly tone. Write as if talking to a peer. Be relatable and warm.",
    "academic": "Use a scholarly, research-oriented tone. Be precise and objective. Support claims with evidence.",
    "creative": "Use an imaginative, expressive tone. Employ narrative techniques and vivid language. Engage emotions and creativity."
  };

  /**
   * Non-negotiable formatting rules for H5P compatibility.
   *
   * These rules are CRITICAL for H5P Interactive Books and ensure:
   * - Content renders correctly in H5P viewer
   * - No markdown syntax appears in output
   * - Proper semantic HTML structure
   * - Consistent formatting across all AI handlers
   *
   * These rules are NEVER exposed to teachers - always baked into system prompts.
   */
  private static readonly FORMATTING_RULES = `
CRITICAL FORMATTING REQUIREMENTS (NON-NEGOTIABLE):
- Use ONLY plain HTML tags: <p>, <h2>, <strong>, <em>, <ul>, <li>
- Wrap all paragraphs in <p> tags
- Use <h2> for section headings only (not <h1> or <h3>)
- Use <strong> for emphasis, <em> for italics
- Use <ul> and <li> for lists
- DO NOT use markdown formatting (no **, no *, no #, no -)
- DO NOT use special characters for formatting
- DO NOT use code blocks or syntax highlighting
- Separate paragraphs with blank lines for readability
- Output valid, clean HTML that renders correctly in H5P Interactive Books
`.trim();

  /**
   * Builds a system prompt with formatting rules and reading level guidance.
   *
   * This prompt is prepended to the user's content prompt. It includes:
   * 1. Critical HTML formatting rules (non-negotiable)
   * 2. Reading level-specific guidance (vocabulary, sentences, style, examples)
   * 3. Tone specification (educational, professional, casual, academic)
   * 4. Language requirements (content language, instructional language, translations)
   *
   * The system prompt ensures ALL AI output meets H5P requirements and matches
   * the target audience's reading level, regardless of what the teacher writes
   * in their content prompt.
   *
   * @param config AI configuration (reading level, tone, language settings, etc.)
   * @returns Complete system prompt with all technical requirements
   */
  public static buildSystemPrompt(config?: AIConfiguration): string {
    const targetAudience = config?.targetAudience || "grade-6";
    const tone = config?.tone || "educational";
    const readingLevel = this.READING_LEVELS[targetAudience];
    const toneGuidance = this.TONES[tone];

    let systemPrompt = `
You are an expert educational content generator creating content for H5P Interactive Books.

${this.FORMATTING_RULES}

READING LEVEL: ${targetAudience.toUpperCase()}
${readingLevel.sentenceLength}
${readingLevel.vocabulary}
${readingLevel.style}
${readingLevel.examples}

TONE: ${tone.toUpperCase()}
${toneGuidance}
`.trim();

    // Inject language requirements if specified
    if (config?.targetLanguage) {
      const targetLangName = LanguageUtils.getLanguageName(config.targetLanguage);

      // CONTENT LANGUAGE instruction (always inject when targetLanguage specified)
      systemPrompt += `\n\nCONTENT LANGUAGE: Generate all educational content (questions, answers, explanations) in ${targetLangName} (${config.targetLanguage}). Do not translate content to other languages unless explicitly instructed.`;

      // INSTRUCTIONAL LANGUAGE instruction (only when different from target language)
      if (config.instructionalLanguage && config.instructionalLanguage !== config.targetLanguage) {
        const instructionalLangName = LanguageUtils.getLanguageName(config.instructionalLanguage);
        systemPrompt += `\n\nINSTRUCTIONAL LANGUAGE: Generate all task instructions, directions, and scaffolding text in ${instructionalLangName} (${config.instructionalLanguage}). This includes quiz instructions, activity directions, and any text that guides the learner through the task.`;
      }

      // TRANSLATIONS instruction (only when enabled)
      if (config.includeTranslations && config.targetLanguage !== "en") {
        systemPrompt += `\n\nTRANSLATIONS: Include English translations in parentheses after ${targetLangName} terms for language learners. Format: 'Term (translation)'. IMPORTANT: For fill-in-the-blank, drag-and-drop, and matching activities, only include translations in the question/instructions text, NOT in the answer options or blanks themselves (students should practice the ${targetLangName} term without translation hints in answers).`;
      }
    }

    return systemPrompt;
  }

  /**
   * Builds a complete prompt ready for AI API call.
   *
   * Combines in order:
   * 1. System prompt (formatting rules + reading level + tone + language requirements)
   * 2. Separator
   * 3. User's content prompt (e.g., "Explain photosynthesis")
   * 4. Customization section (if provided)
   *
   * This is the final prompt sent to Gemini or Claude API.
   *
   * @param userPrompt The teacher's content prompt (simple, clean)
   * @param config AI configuration for reading level and tone
   * @returns Complete prompt ready for Gemini or Claude API
   */
  public static buildCompletePrompt(
    userPrompt: string,
    config?: AIConfiguration
  ): string {
    const systemPrompt = this.buildSystemPrompt(config);
    const customization = config?.customization?.trim();

    let completePrompt = systemPrompt;
    completePrompt += "\n\n---\n\n";
    completePrompt += userPrompt;

    if (customization) {
      completePrompt += "\n\n";
      completePrompt += `ADDITIONAL CUSTOMIZATION:\n${customization}`;
    }

    return completePrompt;
  }

  /**
   * Resolves configuration hierarchy: item > chapter > book > defaults.
   *
   * Configuration cascade for Interactive Books:
   * - Item-level aiConfig (highest priority)
   * - Chapter-level aiConfig
   * - Book-level aiConfig
   * - System defaults (lowest priority)
   *
   * Configuration merge is field-by-field, NOT object replacement.
   * This allows partial overrides at each level.
   *
   * System defaults:
   * - targetAudience: "grade-6"
   * - tone: "educational"
   * - outputStyle: "plain-html"
   * - includeTranslations: false
   *
   * @param itemConfig Item-level configuration (highest priority)
   * @param chapterConfig Chapter-level configuration
   * @param bookConfig Book-level configuration
   * @returns Resolved configuration with all fields populated
   */
  public static resolveConfig(
    itemConfig?: AIConfiguration,
    chapterConfig?: AIConfiguration,
    bookConfig?: AIConfiguration
  ): AIConfiguration {
    return {
      targetAudience:
        itemConfig?.targetAudience ||
        chapterConfig?.targetAudience ||
        bookConfig?.targetAudience ||
        "grade-6",
      tone:
        itemConfig?.tone ||
        chapterConfig?.tone ||
        bookConfig?.tone ||
        "educational",
      outputStyle:
        itemConfig?.outputStyle ||
        chapterConfig?.outputStyle ||
        bookConfig?.outputStyle ||
        "plain-html",
      customization:
        itemConfig?.customization ||
        chapterConfig?.customization ||
        bookConfig?.customization ||
        undefined,
      targetLanguage:
        itemConfig?.targetLanguage ||
        chapterConfig?.targetLanguage ||
        bookConfig?.targetLanguage ||
        undefined,
      instructionalLanguage:
        itemConfig?.instructionalLanguage ||
        chapterConfig?.instructionalLanguage ||
        bookConfig?.instructionalLanguage ||
        undefined,
      includeTranslations:
        itemConfig?.includeTranslations !== undefined
          ? itemConfig.includeTranslations
          : chapterConfig?.includeTranslations !== undefined
          ? chapterConfig.includeTranslations
          : bookConfig?.includeTranslations !== undefined
          ? bookConfig.includeTranslations
          : false
    };
  }
}
