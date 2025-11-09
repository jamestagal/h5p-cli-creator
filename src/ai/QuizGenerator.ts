import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  QuizContent,
  QuizQuestion,
  H5pMultipleChoiceContent,
  H5pMultipleChoiceParams
} from "./types";
import { AIConfiguration } from "../compiler/types";
import { AIPromptBuilder } from "./AIPromptBuilder";

type AIProvider = "anthropic" | "google";

/**
 * QuizGenerator uses AI (Claude or Gemini) to generate multiple-choice quiz questions
 * from source text and format them as H5P.MultipleChoice content.
 *
 * Phase 5: Integrated with AIConfiguration for reading level-appropriate quiz generation.
 */
export class QuizGenerator {
  private anthropic?: Anthropic;
  private gemini?: GoogleGenerativeAI;
  private provider: AIProvider;

  /**
   * Creates a new QuizGenerator instance.
   * Auto-detects provider based on available API keys.
   * @param provider AI provider to use ("anthropic" or "google"). Auto-detected if not specified.
   * @param apiKey API key (defaults to ANTHROPIC_API_KEY or GOOGLE_API_KEY environment variable)
   */
  constructor(provider?: AIProvider, apiKey?: string) {
    // Auto-detect provider based on available API keys if not specified
    if (!provider) {
      if (process.env.GOOGLE_API_KEY) {
        this.provider = "google";
      } else if (process.env.ANTHROPIC_API_KEY) {
        this.provider = "anthropic";
      } else {
        throw new Error("No API key found. Set ANTHROPIC_API_KEY or GOOGLE_API_KEY environment variable.");
      }
    } else {
      this.provider = provider;
    }

    // Initialize the appropriate provider
    if (this.provider === "anthropic") {
      const key = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!key) {
        throw new Error("Anthropic API key required. Set ANTHROPIC_API_KEY environment variable.");
      }
      this.anthropic = new Anthropic({ apiKey: key });
    } else {
      const key = apiKey || process.env.GOOGLE_API_KEY;
      if (!key) {
        throw new Error("Google API key required. Set GOOGLE_API_KEY environment variable.");
      }
      this.gemini = new GoogleGenerativeAI(key);
    }
  }

  /**
   * Generates quiz questions from source text using AI (Claude or Gemini).
   *
   * Phase 5: Accepts optional AIConfiguration to:
   * - Match vocabulary to reading level (elementary, grade-6, college, etc.)
   * - Adjust question complexity based on target audience
   * - Apply tone and customization to quiz style
   *
   * @param sourceText Educational text to generate quiz questions from
   * @param questionCount Number of questions to generate (default: 5)
   * @param config Optional AI configuration for reading level and tone
   * @returns QuizContent with generated questions
   * @throws Error if API call fails or response cannot be parsed
   */
  public async generateQuiz(
    sourceText: string,
    questionCount: number = 5,
    config?: AIConfiguration
  ): Promise<QuizContent> {
    try {
      // Build reading-level-aware prompt
      const readingLevel = config?.targetAudience || "grade-6";
      const basePrompt = `Generate ${questionCount} multiple-choice quiz questions about this educational text:

${sourceText}

Requirements:
- Each question should have 4 answer options
- Only one answer should be correct
- Questions should test understanding, not just recall
- Answers should be clear and unambiguous
- Include common misconceptions as incorrect answers
- Match the vocabulary and complexity to ${readingLevel} reading level
${this.getReadingLevelQuizGuidance(readingLevel)}

Return ONLY a JSON array with this exact format (no additional text):
[
  {
    "question": "What is the main concept?",
    "answers": [
      { "text": "Correct answer", "correct": true },
      { "text": "Incorrect answer 1", "correct": false },
      { "text": "Incorrect answer 2", "correct": false },
      { "text": "Incorrect answer 3", "correct": false }
    ]
  }
]`;

      // Use AIPromptBuilder for consistent formatting if customization provided
      const prompt = config?.customization
        ? AIPromptBuilder.buildCompletePrompt(basePrompt, config)
        : basePrompt;

      let responseText: string;

      if (this.provider === "anthropic" && this.anthropic) {
        const message = await this.anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        });

        // Extract text from Claude's response
        responseText = message.content
          .filter((block) => block.type === "text")
          .map((block) => (block as any).text)
          .join("");
      } else if (this.provider === "google" && this.gemini) {
        const model = this.gemini.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
      } else {
        throw new Error("No AI provider initialized");
      }

      // Parse the AI response
      const questions = this.parseAIResponse(responseText);

      return { questions };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Quiz generation failed: ${error.message}`);
      }
      throw new Error("Quiz generation failed: Unknown error");
    }
  }

  /**
   * Provides reading-level-specific guidance for quiz question generation.
   *
   * Each reading level has unique requirements for:
   * - Vocabulary complexity in questions and answers
   * - Question structure and sentence length
   * - Type of thinking skills tested
   *
   * Phase 5: Ensures quiz questions match the same reading level as text content.
   *
   * @param level Reading level (elementary, grade-6, college, etc.)
   * @returns Specific guidance string to include in quiz prompt
   * @private
   */
  private getReadingLevelQuizGuidance(level: string): string {
    const guidance: Record<string, string> = {
      "elementary": "- Use very simple vocabulary in questions and answers\n- Questions should test basic comprehension only\n- Avoid complex sentence structures in questions",
      "grade-6": "- Use grade-appropriate vocabulary\n- Include some application questions beyond recall\n- Keep questions clear and direct",
      "grade-9": "- Use broader vocabulary and some technical terms\n- Include analysis and application questions\n- Test deeper understanding of concepts",
      "high-school": "- Use advanced vocabulary and subject terminology\n- Focus on analysis, evaluation, and synthesis\n- Test critical thinking skills",
      "college": "- Use discipline-specific language freely\n- Test higher-order thinking and analysis\n- Include questions requiring synthesis of concepts",
      "professional": "- Use industry terminology\n- Focus on practical application and problem-solving\n- Test real-world scenario understanding",
      "esl-beginner": "- Use only common, high-frequency vocabulary\n- Keep questions very simple and direct\n- Avoid idioms and complex grammar",
      "esl-intermediate": "- Use everyday vocabulary with some expansion\n- Include varied sentence patterns\n- Introduce common expressions gradually"
    };

    return guidance[level] || guidance["grade-6"];
  }

  /**
   * Parses Claude AI response into structured quiz questions.
   * @param response Raw response text from Claude API
   * @returns Array of parsed quiz questions
   * @throws Error if response cannot be parsed
   */
  public parseAIResponse(response: string): QuizQuestion[] {
    try {
      // Try to extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? jsonMatch[0] : response;

      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        throw new Error("Response is not an array");
      }

      // Validate structure
      const questions: QuizQuestion[] = parsed.map((item, index) => {
        if (!item.question || typeof item.question !== "string") {
          throw new Error(`Question ${index + 1} missing or invalid question text`);
        }

        if (!Array.isArray(item.answers) || item.answers.length === 0) {
          throw new Error(`Question ${index + 1} has invalid answers array`);
        }

        const hasCorrectAnswer = item.answers.some((a: any) => a.correct === true);
        if (!hasCorrectAnswer) {
          throw new Error(`Question ${index + 1} has no correct answer`);
        }

        return {
          question: item.question,
          answers: item.answers.map((a: any) => ({
            text: a.text,
            correct: a.correct === true
          }))
        };
      });

      return questions;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse AI response: ${error.message}`);
      }
      throw new Error("Failed to parse AI response: Unknown error");
    }
  }

  /**
   * Converts quiz questions to H5P.MultipleChoice format.
   * @param questions Array of quiz questions
   * @returns Array of H5P.MultipleChoice content structures
   */
  public toH5pFormat(questions: QuizQuestion[]): H5pMultipleChoiceContent[] {
    return questions.map((q, index) => {
      const params: H5pMultipleChoiceParams = {
        question: q.question,
        answers: q.answers.map((answer) => ({
          text: answer.text,
          correct: answer.correct,
          tipsAndFeedback: {
            tip: "",
            chosenFeedback: answer.correct
              ? "Correct! Well done."
              : "Incorrect. Try again.",
            notChosenFeedback: ""
          }
        })),
        behaviour: {
          enableRetry: true,
          enableSolutionsButton: true,
          enableCheckButton: true,
          type: "auto",
          singlePoint: false,
          randomAnswers: true,
          showSolutionsRequiresInput: true,
          confirmCheckDialog: false,
          confirmRetryDialog: false,
          autoCheck: false,
          passPercentage: 100,
          showScorePoints: true
        },
        UI: {
          checkAnswerButton: "Check",
          submitAnswerButton: "Submit",
          showSolutionButton: "Show solution",
          tryAgainButton: "Retry",
          tipsLabel: "Show tip",
          scoreBarLabel: "You got :num out of :total points",
          tipAvailable: "Tip available",
          feedbackAvailable: "Feedback available",
          readFeedback: "Read feedback",
          wrongAnswer: "Wrong answer",
          correctAnswer: "Correct answer",
          shouldCheck: "Should have been checked",
          shouldNotCheck: "Should not have been checked",
          noInput: "Please answer before viewing the solution",
          a11yCheck: "Check the answers. The responses will be marked as correct, incorrect, or unanswered.",
          a11yShowSolution: "Show the solution. The task will be marked with its correct solution.",
          a11yRetry: "Retry the task. Reset all responses and start the task over again."
        },
        overallFeedback: [
          { from: 0, to: 100 }
        ],
        confirmCheck: {
          header: "Finish?",
          body: "Are you sure you wish to finish?",
          cancelLabel: "Cancel",
          confirmLabel: "Finish"
        },
        confirmRetry: {
          header: "Retry?",
          body: "Are you sure you wish to retry?",
          cancelLabel: "Cancel",
          confirmLabel: "Retry"
        }
      };

      return {
        library: "H5P.MultiChoice 1.16",
        params,
        metadata: {
          contentType: "Multiple Choice",
          license: "U",
          title: `Quiz Question ${index + 1}`
        }
      };
    });
  }

  /**
   * Generates quiz and returns H5P.MultipleChoice structures.
   * Convenience method combining generateQuiz and toH5pFormat.
   *
   * Phase 5: Accepts optional AIConfiguration to match reading level.
   *
   * @param sourceText Educational text to generate quiz questions from
   * @param questionCount Number of questions to generate (default: 5)
   * @param config Optional AI configuration for reading level and tone
   * @returns Array of H5P.MultipleChoice content structures
   */
  public async generateH5pQuiz(
    sourceText: string,
    questionCount: number = 5,
    config?: AIConfiguration
  ): Promise<H5pMultipleChoiceContent[]> {
    const quizContent = await this.generateQuiz(sourceText, questionCount, config);
    return this.toH5pFormat(quizContent.questions);
  }
}
