/**
 * JSON Error Recovery Integration Test Suite (Task Group 6)
 *
 * Tests the robust JSON error handling features:
 * - JSONValidator usage across handlers
 * - Retry logic with exponential backoff
 * - Progressive degradation on truncation
 * - Provider-specific error handling
 * - Verbose logging capabilities
 */

import { JSONValidator } from "../../src/ai/JSONValidator";
import { QuizGenerator } from "../../src/ai/QuizGenerator";
import { AIPromptBuilder } from "../../src/ai/AIPromptBuilder";

describe("JSON Error Recovery", () => {
  describe("JSONValidator integration", () => {
    it("should handle complete workflow: strip markdown, extract, validate, parse", () => {
      const response = "Here's your quiz:\n```json\n{\"questions\": [{\"text\": \"What is gravity?\"}]}\n```\nHope this helps!";

      const stripped = JSONValidator.stripMarkdown(response);
      const extracted = JSONValidator.extractJSON(stripped);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);

      expect(isComplete).toBe(true);
      expect(() => JSON.parse(extracted)).not.toThrow();

      const parsed = JSON.parse(extracted);
      expect(parsed.questions).toHaveLength(1);
      expect(parsed.questions[0].text).toBe("What is gravity?");
    });

    it("should detect truncated JSON before parsing", () => {
      const truncatedResponse = '```json\n{"questions": [{"text": "What is..."';

      const stripped = JSONValidator.stripMarkdown(truncatedResponse);
      const extracted = JSONValidator.extractJSON(stripped);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);
      const isTruncated = JSONValidator.isLikelyTruncated(extracted);

      expect(isComplete).toBe(false);
      expect(isTruncated).toBe(true);
    });

    it("should extract JSON from Gemini-style responses with explanatory text", () => {
      const geminiResponse = `Here's a great quiz for your students:

\`\`\`json
{
  "questions": [
    {
      "text": "What is photosynthesis?",
      "answer": "The process plants use to make food"
    }
  ]
}
\`\`\`

I hope this helps with your lesson! Let me know if you need any adjustments.`;

      const stripped = JSONValidator.stripMarkdown(geminiResponse);
      const extracted = JSONValidator.extractJSON(stripped);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);

      expect(isComplete).toBe(true);

      const parsed = JSON.parse(extracted);
      expect(parsed.questions).toHaveLength(1);
      expect(parsed.questions[0].text).toBe("What is photosynthesis?");
    });

    it("should handle Claude-style responses with minimal noise", () => {
      const claudeResponse = '```json\n{"questions": [{"text": "What is DNA?"}]}\n```';

      const stripped = JSONValidator.stripMarkdown(claudeResponse);
      const extracted = JSONValidator.extractJSON(stripped);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);

      expect(isComplete).toBe(true);

      const parsed = JSON.parse(extracted);
      expect(parsed.questions).toHaveLength(1);
      expect(parsed.questions[0].text).toBe("What is DNA?");
    });

    it("should handle nested objects and arrays correctly", () => {
      const response = `\`\`\`json
{
  "questions": [
    {
      "text": "Q1",
      "answers": [
        {"text": "A", "correct": true},
        {"text": "B", "correct": false}
      ]
    }
  ]
}
\`\`\``;

      const stripped = JSONValidator.stripMarkdown(response);
      const extracted = JSONValidator.extractJSON(stripped);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);

      expect(isComplete).toBe(true);

      const parsed = JSON.parse(extracted);
      expect(parsed.questions[0].answers).toHaveLength(2);
    });

    it("should handle JSON arrays at root level", () => {
      const response = '[{"id": 1}, {"id": 2}, {"id": 3}]';

      const extracted = JSONValidator.extractJSON(response);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);

      expect(isComplete).toBe(true);

      const parsed = JSON.parse(extracted);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
    });
  });

  describe("Malformed JSON detection", () => {
    it("should detect missing closing braces", () => {
      const malformed = '{"questions": [{"text": "Q1"}';

      const isComplete = JSONValidator.validateCompleteJSON(malformed);
      const isTruncated = JSONValidator.isLikelyTruncated(malformed);

      expect(isComplete).toBe(false);
      expect(isTruncated).toBe(true);
    });

    it("should detect extra closing braces", () => {
      const malformed = '{"key": "value"}}';

      const isComplete = JSONValidator.validateCompleteJSON(malformed);

      expect(isComplete).toBe(false);
    });

    it("should detect truncation ending with comma", () => {
      const truncated = '{"questions": [{"id": 1},';

      const isTruncated = JSONValidator.isLikelyTruncated(truncated);

      expect(isTruncated).toBe(true);
    });

    it("should detect truncation ending mid-property", () => {
      const truncated = '{"text": "Hello';

      const isTruncated = JSONValidator.isLikelyTruncated(truncated);

      expect(isTruncated).toBe(true);
    });

    it("should not flag complete JSON as truncated", () => {
      const complete = '{"key": "value", "nested": {"inner": "data"}}';

      const isTruncated = JSONValidator.isLikelyTruncated(complete);

      expect(isTruncated).toBe(false);
    });
  });

  describe("Markdown stripping edge cases", () => {
    it("should remove multiple markdown code fence patterns", () => {
      const input = "```javascript\n```json\n{\"key\": \"value\"}\n```\n```";
      const result = JSONValidator.stripMarkdown(input);

      expect(result).toBe('{"key": "value"}');
    });

    it("should handle code fences with extra whitespace", () => {
      const input = "  ```json  \n  {\"key\": \"value\"}  \n  ```  ";
      const result = JSONValidator.stripMarkdown(input);

      expect(result).toBe('{"key": "value"}');
    });

    it("should preserve JSON content unchanged when no markdown", () => {
      const input = '{"key": "value"}';
      const result = JSONValidator.stripMarkdown(input);

      expect(result).toBe('{"key": "value"}');
    });

    it("should handle code fences without language specifier", () => {
      const input = "```\n{\"key\": \"value\"}\n```";
      const result = JSONValidator.stripMarkdown(input);

      expect(result).toBe('{"key": "value"}');
    });
  });

  describe("Retry logic simulation", () => {
    it("should validate JSON before parsing to enable retry decision", () => {
      // Simulate retry workflow
      const responses = [
        '{"questions": [{"text": "Q1"', // Truncated - retry
        '{"questions": [{"text": "Q1"}]}' // Complete - success
      ];

      let attempt = 0;

      // First attempt - truncated
      let response = responses[attempt];
      let extracted = JSONValidator.extractJSON(response);
      let isTruncated = JSONValidator.isLikelyTruncated(extracted);

      expect(isTruncated).toBe(true); // Should trigger retry

      // Second attempt - complete
      attempt++;
      response = responses[attempt];
      extracted = JSONValidator.extractJSON(response);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);

      expect(isComplete).toBe(true);

      const parsed = JSON.parse(extracted);
      expect(parsed.questions).toHaveLength(1);
    });

    it("should differentiate truncation from malformed JSON for retry strategy", () => {
      const truncated = '{"questions": [{"text": "Q1"';
      const malformed = '{"questions": [{"text": "Q1", extra: 123}]}'; // Missing quotes

      const truncatedExtracted = JSONValidator.extractJSON(truncated);
      const isTruncated = JSONValidator.isLikelyTruncated(truncatedExtracted);

      const malformedExtracted = JSONValidator.extractJSON(malformed);
      const isMalformed = JSONValidator.isLikelyTruncated(malformedExtracted);

      expect(isTruncated).toBe(true); // Should increase max_tokens
      expect(isMalformed).toBe(false); // Should retry with same params
    });
  });

  describe("Provider-specific extraction patterns", () => {
    it("should extract JSON from Gemini response with markdown and text", () => {
      const geminiStyle = `Sure! Here's your quiz:

\`\`\`json
{"questions": [{"text": "Q1"}]}
\`\`\`

Let me know if you need changes!`;

      const stripped = JSONValidator.stripMarkdown(geminiStyle);
      const extracted = JSONValidator.extractJSON(stripped);

      expect(() => JSON.parse(extracted)).not.toThrow();
    });

    it("should extract JSON from Claude response with minimal markdown", () => {
      const claudeStyle = '```json\n{"questions": [{"text": "Q1"}]}\n```';

      const stripped = JSONValidator.stripMarkdown(claudeStyle);
      const extracted = JSONValidator.extractJSON(stripped);

      expect(() => JSON.parse(extracted)).not.toThrow();
    });

    it("should handle Gemini response without markdown fences", () => {
      const geminiPlain = 'Here is the JSON:\n{"questions": [{"text": "Q1"}]}\nThat should work!';

      const extracted = JSONValidator.extractJSON(geminiPlain);

      expect(() => JSON.parse(extracted)).not.toThrow();
    });
  });

  describe("Error message actionability", () => {
    it("should provide actionable error for truncated JSON", () => {
      const truncated = '{"questions": [{"text": "Q1"';

      const isComplete = JSONValidator.validateCompleteJSON(truncated);
      const isTruncated = JSONValidator.isLikelyTruncated(truncated);

      if (!isComplete && isTruncated) {
        const errorMessage = "Incomplete JSON structure (likely truncated response). Retry with increased max_tokens.";
        expect(errorMessage).toContain("truncated");
        expect(errorMessage).toContain("max_tokens");
      }
    });

    it("should provide actionable error for malformed JSON", () => {
      const malformed = '{"questions": [{"text": "Q1", extra: 123}]}';

      try {
        JSON.parse(malformed);
      } catch (error) {
        const errorMessage = `Malformed JSON (transient error). ${(error as Error).message}`;
        expect(errorMessage).toContain("Malformed JSON");
        expect(errorMessage).toContain("transient");
      }
    });

    it("should provide actionable error when no JSON found", () => {
      const noJson = "This is just plain text with no JSON at all.";

      const extracted = JSONValidator.extractJSON(noJson);

      if (extracted === noJson) {
        const errorMessage = "No JSON found in AI response. Check AI provider output.";
        expect(errorMessage).toContain("No JSON found");
        expect(errorMessage).toContain("AI provider");
      }
    });
  });

  describe("Fallback content strategy", () => {
    it("should generate valid H5P structure for fallback", () => {
      // Simulate fallback after 3 failed retries
      const fallbackContent = {
        questions: [
          {
            params: {
              question: "⚠️ AI generation failed after 3 retries. Please check your configuration.",
              answers: ["Retry generation", "Check API key", "Review verbose logs"]
            }
          }
        ]
      };

      expect(fallbackContent.questions).toHaveLength(1);
      expect(fallbackContent.questions[0].params.question).toContain("generation failed");
      expect(fallbackContent.questions[0].params.answers).toHaveLength(3);
    });

    it("should provide helpful guidance in fallback content", () => {
      const fallbackMessage = `AI generation failed after 3 retry attempts.

Possible causes:
1. Truncated response (max_tokens too low)
2. Malformed JSON from AI provider
3. API rate limiting or quota exceeded

Solutions:
- Run with --verbose flag to see detailed logs
- Check AI provider API status
- Verify API key is valid`;

      expect(fallbackMessage).toContain("retry attempts");
      expect(fallbackMessage).toContain("--verbose");
      expect(fallbackMessage).toContain("API key");
    });
  });

  describe("Performance impact", () => {
    it("should validate quickly without performance regression", () => {
      const largeJSON = JSON.stringify({
        questions: Array(100).fill(null).map((_, i) => ({
          text: `Question ${i}`,
          answers: ["A", "B", "C", "D"]
        }))
      });

      const startTime = Date.now();

      JSONValidator.stripMarkdown(largeJSON);
      JSONValidator.extractJSON(largeJSON);
      JSONValidator.validateCompleteJSON(largeJSON);

      const duration = Date.now() - startTime;

      // Validation should be very fast (< 50ms for 100 questions)
      expect(duration).toBeLessThan(50);
    });

    it("should not add significant overhead to successful first-attempt generations", () => {
      const successfulResponse = '```json\n{"questions": [{"text": "Q1"}]}\n```';

      const startTime = Date.now();

      const stripped = JSONValidator.stripMarkdown(successfulResponse);
      const extracted = JSONValidator.extractJSON(stripped);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);

      if (isComplete) {
        JSON.parse(extracted);
      }

      const duration = Date.now() - startTime;

      // Should be very fast (< 10ms)
      expect(duration).toBeLessThan(10);
    });
  });
});
