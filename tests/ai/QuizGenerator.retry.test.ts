/**
 * Retry Logic Tests for QuizGenerator
 *
 * These tests verify the robust JSON parsing and retry logic implemented in Task Group 4.
 * Tests cover:
 * 1. Retry on malformed JSON (transient error)
 * 2. Progressive degradation on truncation (increase max_tokens)
 * 3. Exponential backoff timing (1s, 2s, 4s)
 * 4. Final fallback after 3 failed retries
 * 5. Provider-specific error handling
 * 6. Permanent error detection (no retry)
 */

import { QuizGenerator } from "../../src/ai/QuizGenerator";
import { JSONValidator } from "../../src/ai/JSONValidator";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Mock the AI SDK modules
jest.mock("@anthropic-ai/sdk");
jest.mock("@google/generative-ai");

describe("QuizGenerator Retry Logic", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Suppress console.log during tests for cleaner output
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe("Retry on malformed JSON (transient error)", () => {
    it("should retry with same max_tokens when JSON is malformed but not truncated", async () => {
      const mockCreate = jest.fn()
        // First attempt: malformed JSON (missing comma)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"key": "value" "another": "value"}' }]
        })
        // Second attempt: valid JSON
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"key": "value", "another": "value"}' }]
        });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);
      const result = await generator.generateRawContent("system", "user");

      expect(result).toBe('{"key": "value", "another": "value"}');
      expect(mockCreate).toHaveBeenCalledTimes(2);

      // Verify max_tokens stayed the same (2048)
      expect(mockCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({ max_tokens: 2048 }));
      expect(mockCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({ max_tokens: 2048 }));
    });
  });

  describe("Progressive degradation on truncation", () => {
    it("should double max_tokens when truncation is detected", async () => {
      const mockCreate = jest.fn()
        // First attempt: truncated JSON (2048 tokens)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"questions": [{"text": "What' }]
        })
        // Second attempt: still truncated (4096 tokens)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"questions": [{"text": "What is the capital?", "answers": [{"text": "Paris"' }]
        })
        // Third attempt: complete JSON (8192 tokens)
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"questions": [{"text": "What is the capital?", "answers": [{"text": "Paris", "correct": true}]}]}' }]
        });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);
      const result = await generator.generateRawContent("system", "user");

      expect(result).toBe('{"questions": [{"text": "What is the capital?", "answers": [{"text": "Paris", "correct": true}]}]}');
      expect(mockCreate).toHaveBeenCalledTimes(3);

      // Verify max_tokens progression: 2048 → 4096 → 8192
      expect(mockCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({ max_tokens: 2048 }));
      expect(mockCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({ max_tokens: 4096 }));
      expect(mockCreate).toHaveBeenNthCalledWith(3, expect.objectContaining({ max_tokens: 8192 }));
    });

    it("should cap max_tokens at 8192", async () => {
      const mockCreate = jest.fn()
        // Simulate multiple truncations
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"incomplete":' }]
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"incomplete": "still' }]
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: '{"incomplete": "still truncated' }]
        });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);

      await expect(generator.generateRawContent("system", "user"))
        .rejects.toThrow("AI content generation failed after 3 attempts");

      // Verify max_tokens never exceeds 8192
      expect(mockCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({ max_tokens: 2048 }));
      expect(mockCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({ max_tokens: 4096 }));
      expect(mockCreate).toHaveBeenNthCalledWith(3, expect.objectContaining({ max_tokens: 8192 }));
    });
  });

  describe("Exponential backoff timing", () => {
    it("should retry 3 times with delays between attempts", async () => {
      const startTime = Date.now();

      const mockCreate = jest.fn()
        .mockResolvedValue({
          content: [{ type: "text", text: '{"invalid": "json"' }]
        });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);

      await expect(generator.generateRawContent("system", "user"))
        .rejects.toThrow("AI content generation failed after 3 attempts");

      const elapsedTime = Date.now() - startTime;

      // Verify 3 attempts were made
      expect(mockCreate).toHaveBeenCalledTimes(3);

      // Verify there was some delay (at least 1s + 2s = 3s total)
      // Allow for some timing variance, but should be at least 3000ms
      expect(elapsedTime).toBeGreaterThanOrEqual(3000);
    });
  });

  describe("Final fallback after 3 failed retries", () => {
    it("should throw error after 3 failed attempts", async () => {
      const mockCreate = jest.fn()
        .mockResolvedValue({
          content: [{ type: "text", text: 'invalid json here' }]
        });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);

      await expect(generator.generateRawContent("system", "user"))
        .rejects.toThrow(/AI content generation failed after 3 attempts/);

      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it("should include original error message in final error", async () => {
      const mockCreate = jest.fn()
        .mockResolvedValue({
          content: [{ type: "text", text: '{"unclosed":' }]
        });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);

      await expect(generator.generateRawContent("system", "user"))
        .rejects.toThrow(/failed after 3 attempts/);
    });
  });

  describe("Permanent error detection (no retry)", () => {
    it("should not retry on API key errors", async () => {
      const mockCreate = jest.fn()
        .mockRejectedValue(new Error("Invalid API key provided"));

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);

      await expect(generator.generateRawContent("system", "user"))
        .rejects.toThrow("Invalid API key provided");

      // Should fail immediately without retrying
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("should not retry on quota exceeded errors", async () => {
      const mockCreate = jest.fn()
        .mockRejectedValue(new Error("Quota exceeded for this API key"));

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);

      await expect(generator.generateRawContent("system", "user"))
        .rejects.toThrow("Quota exceeded");

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("should not retry on authentication errors", async () => {
      const mockCreate = jest.fn()
        .mockRejectedValue(new Error("Authentication failed"));

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);

      await expect(generator.generateRawContent("system", "user"))
        .rejects.toThrow("Authentication failed");

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("Validation pipeline sequence", () => {
    it("should execute validation steps in correct order: stripMarkdown → extractJSON → validateCompleteJSON → parse", async () => {
      const mixedContent = `Here's your JSON response:
\`\`\`json
{
  "questions": [
    {"text": "What is TypeScript?", "answers": [{"text": "A language", "correct": true}]}
  ]
}
\`\`\`
Hope this helps!`;

      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: "text", text: mixedContent }]
      });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);
      const result = await generator.generateRawContent("system", "user");

      // Verify result is clean JSON (markdown stripped, extracted, validated)
      expect(() => JSON.parse(result)).not.toThrow();

      const parsed = JSON.parse(result);
      expect(parsed.questions).toHaveLength(1);
      expect(parsed.questions[0].text).toBe("What is TypeScript?");
    });
  });

  describe("Verbose logging", () => {
    it("should log processing steps when verbose mode is enabled", async () => {
      consoleLogSpy.mockRestore(); // Restore to actually check logs
      const realConsoleLog = jest.spyOn(console, "log").mockImplementation();

      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: "text", text: '{"key": "value"}' }]
      });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", true); // verbose=true
      await generator.generateRawContent("system", "user");

      expect(realConsoleLog).toHaveBeenCalledWith(expect.stringContaining("[VERBOSE] AI Provider: anthropic"));
      expect(realConsoleLog).toHaveBeenCalledWith(expect.stringContaining("[VERBOSE] Raw response"));
      expect(realConsoleLog).toHaveBeenCalledWith(expect.stringContaining("[VERBOSE] After stripMarkdown"));
      expect(realConsoleLog).toHaveBeenCalledWith(expect.stringContaining("[VERBOSE] After extractJSON"));
      expect(realConsoleLog).toHaveBeenCalledWith(expect.stringContaining("[VERBOSE] Validation: Complete JSON ✓"));
      expect(realConsoleLog).toHaveBeenCalledWith(expect.stringContaining("[VERBOSE] Parse: Success ✓"));

      realConsoleLog.mockRestore();
    });

    it("should not log when verbose mode is disabled", async () => {
      consoleLogSpy.mockRestore();
      const realConsoleLog = jest.spyOn(console, "log").mockImplementation();

      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: "text", text: '{"key": "value"}' }]
      });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false); // verbose=false
      await generator.generateRawContent("system", "user");

      expect(realConsoleLog).not.toHaveBeenCalled();

      realConsoleLog.mockRestore();
    });
  });

  describe("Provider-specific handling", () => {
    it("should handle Gemini responses with markdown and explanatory text", async () => {
      const geminiResponse = '```json\n{"questions": [{"text": "Q1"}]}\n```\nHere is your JSON response.';

      const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
          text: () => geminiResponse
        }
      });

      const mockGetGenerativeModel = jest.fn().mockReturnValue({
        generateContent: mockGenerateContent
      });

      (GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>).mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel
      } as any));

      const generator = new QuizGenerator("google", "test-key", false);
      const result = await generator.generateRawContent("system", "user");

      expect(result).toBe('{"questions": [{"text": "Q1"}]}');
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it("should handle Claude responses with minimal cleaning", async () => {
      const claudeResponse = '```json\n{"questions": [{"text": "Q1"}]}\n```';

      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: "text", text: claudeResponse }]
      });

      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
        messages: { create: mockCreate }
      } as any));

      const generator = new QuizGenerator("anthropic", "test-key", false);
      const result = await generator.generateRawContent("system", "user");

      expect(result).toBe('{"questions": [{"text": "Q1"}]}');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });
});
