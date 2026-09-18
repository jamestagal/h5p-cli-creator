import { JSONValidator } from "../../src/ai/JSONValidator";

describe("JSONValidator", () => {
  describe("stripMarkdown", () => {
    it("should remove markdown code fences with json language", () => {
      const input = "```json\n{\"key\": \"value\"}\n```";
      const result = JSONValidator.stripMarkdown(input);
      expect(result).toBe('{"key": "value"}');
    });

    it("should remove markdown code fences without language specifier", () => {
      const input = "```\n{\"key\": \"value\"}\n```";
      const result = JSONValidator.stripMarkdown(input);
      expect(result).toBe('{"key": "value"}');
    });

    it("should remove multiple markdown patterns and extra whitespace", () => {
      const input = "  ```javascript\n\n  {\"key\": \"value\"}  \n\n```  ";
      const result = JSONValidator.stripMarkdown(input);
      expect(result).toBe('{"key": "value"}');
    });

    it("should handle text without markdown fences", () => {
      const input = '{"key": "value"}';
      const result = JSONValidator.stripMarkdown(input);
      expect(result).toBe('{"key": "value"}');
    });
  });

  describe("extractJSON", () => {
    it("should extract JSON object from mixed content with text before", () => {
      const input = 'Here is your JSON:\n{"questions": [{"text": "What is..."}]}';
      const result = JSONValidator.extractJSON(input);
      expect(result).toBe('{"questions": [{"text": "What is..."}]}');
    });

    it("should extract JSON object from mixed content with text after", () => {
      const input = '{"questions": [{"text": "What is..."}]}\nHope this helps!';
      const result = JSONValidator.extractJSON(input);
      expect(result).toBe('{"questions": [{"text": "What is..."}]}');
    });

    it("should extract JSON object from mixed content with text before and after", () => {
      const input = 'Here you go:\n{"key": "value"}\nThat\'s it!';
      const result = JSONValidator.extractJSON(input);
      expect(result).toBe('{"key": "value"}');
    });

    it("should extract JSON array from mixed content", () => {
      const input = 'Results:\n[{"id": 1}, {"id": 2}]\nDone.';
      const result = JSONValidator.extractJSON(input);
      expect(result).toBe('[{"id": 1}, {"id": 2}]');
    });

    it("should handle nested objects and arrays correctly", () => {
      const input = '{"outer": {"inner": [1, 2, 3]}, "array": [{"a": 1}]}';
      const result = JSONValidator.extractJSON(input);
      expect(result).toBe('{"outer": {"inner": [1, 2, 3]}, "array": [{"a": 1}]}');
    });

    it("should return original if no JSON found", () => {
      const input = "No JSON here at all";
      const result = JSONValidator.extractJSON(input);
      expect(result).toBe(input);
    });
  });

  describe("validateCompleteJSON", () => {
    it("should return true for balanced JSON object", () => {
      const input = '{"key": "value", "nested": {"inner": "data"}}';
      expect(JSONValidator.validateCompleteJSON(input)).toBe(true);
    });

    it("should return true for balanced JSON array", () => {
      const input = '[{"id": 1}, {"id": 2}]';
      expect(JSONValidator.validateCompleteJSON(input)).toBe(true);
    });

    it("should return false for unbalanced opening brace", () => {
      const input = '{"key": "value", "nested": {"inner": "data"}';
      expect(JSONValidator.validateCompleteJSON(input)).toBe(false);
    });

    it("should return false for unbalanced opening bracket", () => {
      const input = '[{"id": 1}, {"id": 2}';
      expect(JSONValidator.validateCompleteJSON(input)).toBe(false);
    });

    it("should return false for extra closing brace", () => {
      const input = '{"key": "value"}}';
      expect(JSONValidator.validateCompleteJSON(input)).toBe(false);
    });

    it("should handle strings with escaped braces correctly", () => {
      const input = '{"text": "Use \\{ and \\} for braces"}';
      expect(JSONValidator.validateCompleteJSON(input)).toBe(true);
    });
  });

  describe("isLikelyTruncated", () => {
    it("should detect truncated JSON with missing closing braces", () => {
      const input = '{"questions": [{"text": "What is..."';
      expect(JSONValidator.isLikelyTruncated(input)).toBe(true);
    });

    it("should detect truncated JSON ending mid-property value", () => {
      const input = '{"text": "Hello';
      expect(JSONValidator.isLikelyTruncated(input)).toBe(true);
    });

    it("should detect truncated JSON ending with comma", () => {
      const input = '{"questions": [{"id": 1},';
      expect(JSONValidator.isLikelyTruncated(input)).toBe(true);
    });

    it("should return false for complete JSON object", () => {
      const input = '{"key": "value"}';
      expect(JSONValidator.isLikelyTruncated(input)).toBe(false);
    });

    it("should return false for complete JSON array", () => {
      const input = '[{"id": 1}, {"id": 2}]';
      expect(JSONValidator.isLikelyTruncated(input)).toBe(false);
    });

    it("should detect truncated JSON with unbalanced nested structures", () => {
      const input = '{"outer": {"inner": [1, 2, 3]';
      expect(JSONValidator.isLikelyTruncated(input)).toBe(true);
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete workflow: strip markdown, extract, validate, parse", () => {
      const input = "Here's your quiz:\n```json\n{\"questions\": [{\"text\": \"Q1\"}]}\n```\nEnjoy!";

      const stripped = JSONValidator.stripMarkdown(input);
      const extracted = JSONValidator.extractJSON(stripped);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);

      expect(isComplete).toBe(true);
      expect(() => JSON.parse(extracted)).not.toThrow();

      const parsed = JSON.parse(extracted);
      expect(parsed.questions).toHaveLength(1);
      expect(parsed.questions[0].text).toBe("Q1");
    });

    it("should detect truncation in workflow", () => {
      const input = "```json\n{\"questions\": [{\"text\": \"Q1\"";

      const stripped = JSONValidator.stripMarkdown(input);
      const extracted = JSONValidator.extractJSON(stripped);
      const isComplete = JSONValidator.validateCompleteJSON(extracted);
      const isTruncated = JSONValidator.isLikelyTruncated(extracted);

      expect(isComplete).toBe(false);
      expect(isTruncated).toBe(true);
    });
  });
});
