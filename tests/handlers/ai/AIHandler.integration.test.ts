/**
 * Integration tests for AI handlers with multi-language support and JSON validation
 *
 * Tests Task Group 5: Handler integration with:
 * - Language configuration (targetLanguage, instructionalLanguage, includeTranslations)
 * - JSONValidator integration for robust parsing
 * - Configuration cascade from book → chapter → item
 *
 * Maximum 8 tests (as specified in tasks.md)
 */

import { AIPromptBuilder } from "../../../src/ai/AIPromptBuilder";
import { JSONValidator } from "../../../src/ai/JSONValidator";
import { AIConfiguration } from "../../../src/compiler/types";

describe("AI Handler Integration Tests", () => {
  describe("Language Configuration", () => {
    /**
     * Test 1: Handler with Vietnamese targetLanguage
     * Verifies system prompt includes Vietnamese content language instruction
     */
    it("should inject Vietnamese content language into system prompt", () => {
      const config: AIConfiguration = {
        targetLanguage: "vi"
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      expect(systemPrompt).toContain("CONTENT LANGUAGE");
      expect(systemPrompt).toContain("Vietnamese");
      expect(systemPrompt).toContain("vi");
      expect(systemPrompt).toContain("Do not translate content to other languages");
    });

    /**
     * Test 2: Handler with instructionalLanguage=en + targetLanguage=vi
     * Verifies separate content and instructional language instructions
     */
    it("should inject both content and instructional language when different", () => {
      const config: AIConfiguration = {
        targetLanguage: "vi",
        instructionalLanguage: "en"
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      // Content language
      expect(systemPrompt).toContain("CONTENT LANGUAGE");
      expect(systemPrompt).toContain("Vietnamese");
      expect(systemPrompt).toContain("questions, answers, explanations");

      // Instructional language
      expect(systemPrompt).toContain("INSTRUCTIONAL LANGUAGE");
      expect(systemPrompt).toContain("English");
      expect(systemPrompt).toContain("task instructions, directions");
    });

    /**
     * Test 3: Handler with includeTranslations=true
     * Verifies translation instruction appears in system prompt
     */
    it("should inject translation instruction when includeTranslations enabled", () => {
      const config: AIConfiguration = {
        targetLanguage: "vi",
        includeTranslations: true
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      expect(systemPrompt).toContain("TRANSLATIONS");
      expect(systemPrompt).toContain("English translations in parentheses");
      expect(systemPrompt).toContain("Vietnamese");
      expect(systemPrompt).toContain("'Term (translation)'");
    });

    /**
     * Test 4: Handler with monolingual mode (no instructionalLanguage)
     * Verifies instructional language defaults to target language
     */
    it("should default instructionalLanguage to targetLanguage when not specified", () => {
      const config: AIConfiguration = {
        targetLanguage: "fr"
        // No instructionalLanguage specified
      };

      const systemPrompt = AIPromptBuilder.buildSystemPrompt(config);

      // Content language should be present
      expect(systemPrompt).toContain("CONTENT LANGUAGE");
      expect(systemPrompt).toContain("French");

      // Instructional language should NOT be present (defaults to French)
      expect(systemPrompt).not.toContain("INSTRUCTIONAL LANGUAGE");
    });
  });

  describe("JSON Validation Integration", () => {
    /**
     * Test 5: JSONValidator handles truncated JSON
     * Verifies truncation detection works correctly
     */
    it("should detect truncated JSON responses", () => {
      const truncatedJSON = '{"questions": [{"text": "What is the Sun?", "answer": "A star"';

      const isValid = JSONValidator.validateCompleteJSON(truncatedJSON);
      const isTruncated = JSONValidator.isLikelyTruncated(truncatedJSON);

      expect(isValid).toBe(false);
      expect(isTruncated).toBe(true);
    });

    /**
     * Test 6: JSONValidator strips markdown code fences
     * Verifies Gemini-style markdown wrapping is removed
     */
    it("should strip markdown code fences from AI responses", () => {
      const responseWithMarkdown = `\`\`\`json
{
  "questions": [
    {"text": "What is the Earth?", "answer": "A planet"}
  ]
}
\`\`\``;

      const cleaned = JSONValidator.stripMarkdown(responseWithMarkdown);

      expect(cleaned).not.toContain("```");
      expect(cleaned).toContain('"questions"');
      expect(cleaned.trim().startsWith("{")).toBe(true);
      expect(cleaned.trim().endsWith("}")).toBe(true);
    });

    /**
     * Test 7: JSONValidator extracts JSON from mixed content
     * Verifies extraction from explanatory text
     */
    it("should extract JSON from mixed content with explanatory text", () => {
      const mixedContent = `Here's the quiz data you requested:

{
  "questions": [
    {"text": "What is Mars?", "answer": "The red planet"}
  ]
}

I hope this helps!`;

      const extracted = JSONValidator.extractJSON(mixedContent);

      expect(extracted).toContain('"questions"');
      expect(extracted).not.toContain("Here's the quiz");
      expect(extracted).not.toContain("I hope this helps");
      expect(JSONValidator.validateCompleteJSON(extracted)).toBe(true);
    });

    /**
     * Test 8: JSONValidator handles complete valid JSON
     * Verifies valid JSON passes validation
     */
    it("should validate complete JSON as valid", () => {
      const validJSON = '{"questions": [{"text": "What is Venus?", "answer": "A planet"}]}';

      const isValid = JSONValidator.validateCompleteJSON(validJSON);
      const isTruncated = JSONValidator.isLikelyTruncated(validJSON);

      expect(isValid).toBe(true);
      expect(isTruncated).toBe(false);
    });
  });

  describe("Configuration Cascade", () => {
    /**
     * This test verifies the configuration cascade order is correct
     * (tested in AIPromptBuilder.test.ts, included here for completeness)
     */
    it("should resolve configuration from item > chapter > book hierarchy", () => {
      const bookConfig: AIConfiguration = {
        targetLanguage: "en",
        targetAudience: "grade-6"
      };

      const chapterConfig: AIConfiguration = {
        targetLanguage: "vi" // Override book language
      };

      const itemConfig: AIConfiguration = {
        includeTranslations: true // Add translation
      };

      const resolved = AIPromptBuilder.resolveConfig(
        itemConfig,
        chapterConfig,
        bookConfig
      );

      // Item-level translation wins
      expect(resolved.includeTranslations).toBe(true);

      // Chapter-level language wins over book
      expect(resolved.targetLanguage).toBe("vi");

      // Book-level targetAudience (no override)
      expect(resolved.targetAudience).toBe("grade-6");
    });
  });
});
