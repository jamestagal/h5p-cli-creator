/**
 * Unit tests for StoryTranslator service.
 *
 * Tests cover:
 * - OpenAI API integration (with mocked responses)
 * - Context-aware translation with story context
 * - Translation caching to avoid reprocessing
 * - Graceful fallback when translation fails
 *
 * Phase 2: YouTube Story Extraction for Interactive Books
 */

import { StoryTranslator } from "../../src/services/StoryTranslator";
import { StoryPageData } from "../../src/models/StoryPageData";
import * as fsExtra from "fs-extra";
import * as path from "path";

// Mock OpenAI module
const mockCreate = jest.fn();
jest.mock("openai", () => {
  return {
    default: jest.fn().mockImplementation(() => {
      return {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      };
    })
  };
});

describe("StoryTranslator", () => {
  let translator: StoryTranslator;
  const testVideoId = "TEST_VIDEO_123";
  const testCacheDir = path.join(process.cwd(), ".youtube-cache", testVideoId);

  beforeEach(() => {
    // Create translator with test API key
    translator = new StoryTranslator("test-api-key");
    // Clear mock
    mockCreate.mockClear();
  });

  afterEach(async () => {
    // Clean up test cache directory
    if (await fsExtra.pathExists(testCacheDir)) {
      await fsExtra.remove(testCacheDir);
    }
  });

  describe("translateSinglePage", () => {
    it("should translate Vietnamese text to English using OpenAI API", async () => {
      const mockPage: StoryPageData = {
        pageNumber: 1,
        title: "Page 1",
        startTime: 0,
        endTime: 30,
        vietnameseText: "Xin chào. Đây là một câu chuyện.",
        audioPath: "page1.mp3",
        imagePath: "placeholder.png",
        isPlaceholder: true,
        transcriptSegments: []
      };

      const mockTranslation = "Hello. This is a story.";
      const storyContext = "A Vietnamese children's story about friendship";

      // Mock OpenAI API response
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: mockTranslation
            }
          }
        ],
        usage: {
          total_tokens: 50,
          prompt_tokens: 30,
          completion_tokens: 20
        }
      });

      const result = await translator.translateSinglePage(
        mockPage,
        storyContext,
        testVideoId
      );

      expect(result).toBe(mockTranslation);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4",
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "system"
            }),
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("Xin chào")
            })
          ])
        })
      );
    });

    it("should include story context in translation prompt", async () => {
      const mockPage: StoryPageData = {
        pageNumber: 1,
        title: "Page 1",
        startTime: 0,
        endTime: 30,
        vietnameseText: "Con mèo đi chơi.",
        audioPath: "page1.mp3",
        imagePath: "placeholder.png",
        isPlaceholder: true,
        transcriptSegments: []
      };

      const storyContext = "A story about a curious cat exploring the garden";

      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "The cat went out to play."
            }
          }
        ],
        usage: {
          total_tokens: 40,
          prompt_tokens: 25,
          completion_tokens: 15
        }
      });

      await translator.translateSinglePage(mockPage, storyContext, testVideoId);

      // Verify context is included in the prompt
      const callArgs = mockCreate.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain(storyContext);
    });
  });

  describe("Translation caching", () => {
    it("should cache translations and skip API call on subsequent requests", async () => {
      const mockPage: StoryPageData = {
        pageNumber: 1,
        title: "Page 1",
        startTime: 0,
        endTime: 30,
        vietnameseText: "Tôi yêu học tiếng Việt.",
        audioPath: "page1.mp3",
        imagePath: "placeholder.png",
        isPlaceholder: true,
        transcriptSegments: []
      };

      const mockTranslation = "I love learning Vietnamese.";
      const storyContext = "Language learning story";

      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: mockTranslation
            }
          }
        ],
        usage: {
          total_tokens: 45,
          prompt_tokens: 28,
          completion_tokens: 17
        }
      });

      // First call - should hit API
      const result1 = await translator.translateSinglePage(
        mockPage,
        storyContext,
        testVideoId
      );
      expect(result1).toBe(mockTranslation);
      expect(mockCreate).toHaveBeenCalledTimes(1);

      // Reset mock to verify it's not called again
      mockCreate.mockClear();

      // Second call - should use cache
      const result2 = await translator.translateSinglePage(
        mockPage,
        storyContext,
        testVideoId
      );
      expect(result2).toBe(mockTranslation);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should return untranslated text with warning when API fails", async () => {
      const mockPage: StoryPageData = {
        pageNumber: 1,
        title: "Page 1",
        startTime: 0,
        endTime: 30,
        vietnameseText: "Đây là văn bản gốc.",
        audioPath: "page1.mp3",
        imagePath: "placeholder.png",
        isPlaceholder: true,
        transcriptSegments: []
      };

      const storyContext = "Test story";

      mockCreate.mockRejectedValueOnce(new Error("API rate limit exceeded"));

      const result = await translator.translateSinglePage(
        mockPage,
        storyContext,
        testVideoId
      );

      // Should return original text when translation fails
      expect(result).toBe(mockPage.vietnameseText);
    });
  });
});
