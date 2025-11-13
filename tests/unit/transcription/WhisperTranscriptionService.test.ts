import { WhisperTranscriptionService } from "../../../src/services/transcription/WhisperTranscriptionService";
import * as fsExtra from "fs-extra";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";

// Mock dependencies
jest.mock("fs-extra");
jest.mock("fs");
jest.mock("openai");

describe("WhisperTranscriptionService", () => {
  let service: WhisperTranscriptionService;
  let mockOpenAIInstance: any;
  let mockFileStream: any;
  const testVideoId = "TEST_VIDEO_ID";
  const testAudioPath = "/test/audio.mp3";
  const testLanguage = "vi";
  const testCacheDir = path.join(process.cwd(), ".youtube-cache", testVideoId);
  const testCachePath = path.join(testCacheDir, "whisper-transcript.json");

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock file stream
    mockFileStream = {
      on: jest.fn(),
      close: jest.fn()
    };

    // Mock fs.createReadStream
    (fs.createReadStream as jest.Mock) = jest.fn().mockReturnValue(mockFileStream);

    // Mock OpenAI client
    mockOpenAIInstance = {
      audio: {
        transcriptions: {
          create: jest.fn()
        }
      }
    };

    // Mock OpenAI constructor to return our mock instance
    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAIInstance);

    // Set up environment variable
    process.env.OPENAI_API_KEY = "test-api-key";

    // Mock console methods to suppress logs during tests
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    jest.restoreAllMocks();
  });

  describe("Constructor", () => {
    it("should throw error if OPENAI_API_KEY is not set", () => {
      delete process.env.OPENAI_API_KEY;

      expect(() => {
        new WhisperTranscriptionService();
      }).toThrow("OPENAI_API_KEY not found in environment");
    });

    it("should initialize with provided API key", () => {
      const customKey = "custom-api-key";
      const service = new WhisperTranscriptionService(customKey);

      expect(OpenAI).toHaveBeenCalledWith({ apiKey: customKey });
    });

    it("should initialize with environment variable API key", () => {
      process.env.OPENAI_API_KEY = "env-api-key";
      const service = new WhisperTranscriptionService();

      expect(OpenAI).toHaveBeenCalledWith({ apiKey: "env-api-key" });
    });
  });

  describe("transcribe() - Cache Hit Behavior", () => {
    beforeEach(() => {
      service = new WhisperTranscriptionService();
    });

    it("should return cached segments when cache exists", async () => {
      const cachedSegments = [
        { startTime: 0, endTime: 5.5, text: "Xin chào" },
        { startTime: 5.5, endTime: 10.2, text: "Tôi là người Việt Nam" }
      ];

      // Mock cache file exists
      (fsExtra.pathExists as jest.Mock).mockResolvedValue(true);
      (fsExtra.readJson as jest.Mock).mockResolvedValue(cachedSegments);

      const result = await service.transcribe(testAudioPath, testLanguage, testVideoId);

      expect(result).toEqual(cachedSegments);
      expect(fsExtra.pathExists).toHaveBeenCalledWith(testCachePath);
      expect(fsExtra.readJson).toHaveBeenCalledWith(testCachePath, { encoding: "utf-8" });
      expect(mockOpenAIInstance.audio.transcriptions.create).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith("Using cached transcript");
    });
  });

  describe("transcribe() - Cache Miss Behavior", () => {
    beforeEach(() => {
      service = new WhisperTranscriptionService();
    });

    it("should call Whisper API when cache does not exist", async () => {
      const mockWhisperResponse = {
        text: "Full transcript text",
        segments: [
          { id: 0, start: 0, end: 5.5, text: "Xin chào" },
          { id: 1, start: 5.5, end: 10.2, text: "Tôi là người Việt Nam" }
        ],
        language: "vi"
      };

      // Mock cache does not exist
      (fsExtra.pathExists as jest.Mock).mockResolvedValue(false);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 }); // 1 MB
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);

      // Mock Whisper API response
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue(mockWhisperResponse);

      const result = await service.transcribe(testAudioPath, testLanguage, testVideoId);

      expect(fsExtra.pathExists).toHaveBeenCalledWith(testCachePath);
      expect(mockOpenAIInstance.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "whisper-1",
          language: testLanguage,
          response_format: "verbose_json"
        })
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ startTime: 0, endTime: 5.5, text: "Xin chào" });
      expect(result[1]).toEqual({ startTime: 5.5, endTime: 10.2, text: "Tôi là người Việt Nam" });
    });
  });

  describe("transcribe() - Whisper API Response Parsing", () => {
    beforeEach(() => {
      service = new WhisperTranscriptionService();
      (fsExtra.pathExists as jest.Mock).mockResolvedValue(false);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 });
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
    });

    it("should correctly parse Whisper response to TranscriptSegment format", async () => {
      const mockWhisperResponse = {
        text: "Vietnamese text with diacritics: trời ơi",
        segments: [
          { id: 0, start: 0.5, end: 3.2, text: "Trời ơi!" },
          { id: 1, start: 3.2, end: 7.8, text: "Được rồi." }
        ],
        language: "vi"
      };

      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue(mockWhisperResponse);

      const result = await service.transcribe(testAudioPath, testLanguage, testVideoId);

      expect(result).toEqual([
        { startTime: 0.5, endTime: 3.2, text: "Trời ơi!" },
        { startTime: 3.2, endTime: 7.8, text: "Được rồi." }
      ]);
    });

    it("should preserve Vietnamese diacritics in text", async () => {
      const mockWhisperResponse = {
        text: "Full text",
        segments: [
          { id: 0, start: 0, end: 5, text: "Tiếng Việt có dấu: ă â đ ê ô ơ ư" }
        ],
        language: "vi"
      };

      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue(mockWhisperResponse);

      const result = await service.transcribe(testAudioPath, testLanguage, testVideoId);

      expect(result[0].text).toBe("Tiếng Việt có dấu: ă â đ ê ô ơ ư");
    });
  });

  describe("transcribe() - Cost Calculation", () => {
    beforeEach(() => {
      service = new WhisperTranscriptionService();
      (fsExtra.pathExists as jest.Mock).mockResolvedValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
    });

    it("should calculate cost at $0.006 per minute", async () => {
      const mockWhisperResponse = {
        text: "Test transcript",
        segments: [{ id: 0, start: 0, end: 600, text: "Ten minute audio" }],
        language: "en"
      };

      // Mock 10-minute audio file (600 seconds * 16 KB/s = 9600 KB ≈ 9.375 MB)
      // Using 9.6 MB to get exactly 10 minutes with 16 KB/s calculation
      const tenMinutesInBytes = 10 * 60 * 16 * 1024; // 9,830,400 bytes
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: tenMinutesInBytes });
      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue(mockWhisperResponse);

      await service.transcribe(testAudioPath, "en", testVideoId);

      // Verify cost calculation: 10 minutes * $0.006 = $0.06
      expect(console.log).toHaveBeenCalledWith("Estimated transcription cost: $0.06");
      expect(console.log).toHaveBeenCalledWith("Transcription complete. Cost: $0.06");
    });
  });

  describe("transcribe() - Error Handling", () => {
    beforeEach(() => {
      service = new WhisperTranscriptionService();
      (fsExtra.pathExists as jest.Mock).mockResolvedValue(false);
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
    });

    it("should throw user-friendly error for authentication failure", async () => {
      const authError: any = new Error("Invalid API key");
      authError.status = 401;

      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 });
      mockOpenAIInstance.audio.transcriptions.create.mockRejectedValue(authError);

      await expect(service.transcribe(testAudioPath, testLanguage, testVideoId)).rejects.toThrow(
        "Authentication failed - check OPENAI_API_KEY"
      );
    });

    it("should throw user-friendly error for rate limit after retries", async () => {
      const rateLimitError: any = new Error("Rate limit exceeded");
      rateLimitError.status = 429;

      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 });
      mockOpenAIInstance.audio.transcriptions.create.mockRejectedValue(rateLimitError);

      // Increase timeout for this test due to retry delays
      await expect(service.transcribe(testAudioPath, testLanguage, testVideoId)).rejects.toThrow(
        "Rate limit exceeded - please wait and try again"
      );
    }, 15000);

    it("should throw user-friendly error for file too large", async () => {
      // Mock 30 MB file (exceeds 25 MB limit)
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 30 * 1024 * 1024 });

      await expect(service.transcribe(testAudioPath, testLanguage, testVideoId)).rejects.toThrow(
        "Audio file too large - maximum 25MB supported"
      );

      expect(mockOpenAIInstance.audio.transcriptions.create).not.toHaveBeenCalled();
    });

    it("should throw user-friendly error for network failures after retries", async () => {
      const networkError: any = new Error("Connection timeout");
      networkError.code = "ETIMEDOUT";

      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 });
      mockOpenAIInstance.audio.transcriptions.create.mockRejectedValue(networkError);

      // Increase timeout for this test due to retry delays
      await expect(service.transcribe(testAudioPath, testLanguage, testVideoId)).rejects.toThrow(
        "Network error - check internet connection"
      );
    }, 15000);
  });

  describe("transcribe() - Cache Writing", () => {
    beforeEach(() => {
      service = new WhisperTranscriptionService();
      (fsExtra.pathExists as jest.Mock).mockResolvedValue(false);
      (fsExtra.stat as jest.Mock).mockResolvedValue({ size: 1024 * 1024 });
      (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fsExtra.writeJson as jest.Mock).mockResolvedValue(undefined);
    });

    it("should save transcript to cache with UTF-8 encoding", async () => {
      const mockWhisperResponse = {
        text: "Full text",
        segments: [
          { id: 0, start: 0, end: 5, text: "Xin chào" },
          { id: 1, start: 5, end: 10, text: "Tạm biệt" }
        ],
        language: "vi"
      };

      mockOpenAIInstance.audio.transcriptions.create.mockResolvedValue(mockWhisperResponse);

      await service.transcribe(testAudioPath, testLanguage, testVideoId);

      const expectedSegments = [
        { startTime: 0, endTime: 5, text: "Xin chào" },
        { startTime: 5, endTime: 10, text: "Tạm biệt" }
      ];

      expect(fsExtra.ensureDir).toHaveBeenCalledWith(testCacheDir);
      expect(fsExtra.writeJson).toHaveBeenCalledWith(
        testCachePath,
        expectedSegments,
        { encoding: "utf-8", spaces: 2 }
      );
    });
  });
});
