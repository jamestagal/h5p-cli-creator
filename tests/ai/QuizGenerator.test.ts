import { QuizGenerator } from "../../src/ai/QuizGenerator";
import { QuizQuestion } from "../../src/ai/types";

// Mock the Anthropic SDK
jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn()
      }
    }))
  };
});

describe("QuizGenerator", () => {
  let generator: QuizGenerator;

  beforeEach(() => {
    generator = new QuizGenerator("test-api-key");
  });

  describe("parseAIResponse", () => {
    it("should parse valid JSON response with quiz questions", () => {
      const response = JSON.stringify([
        {
          question: "What is photosynthesis?",
          answers: [
            { text: "Process plants use to make food", correct: true },
            { text: "Animal respiration", correct: false },
            { text: "Water absorption", correct: false },
            { text: "Cellular division", correct: false }
          ]
        }
      ]);

      const questions = generator.parseAIResponse(response);

      expect(questions).toHaveLength(1);
      expect(questions[0].question).toBe("What is photosynthesis?");
      expect(questions[0].answers).toHaveLength(4);
      expect(questions[0].answers[0].correct).toBe(true);
      expect(questions[0].answers[1].correct).toBe(false);
    });

    it("should extract JSON from response with extra text", () => {
      const response = `Here are the quiz questions:

[
  {
    "question": "What is the main concept?",
    "answers": [
      { "text": "Correct answer", "correct": true },
      { "text": "Wrong answer", "correct": false }
    ]
  }
]

Hope this helps!`;

      const questions = generator.parseAIResponse(response);

      expect(questions).toHaveLength(1);
      expect(questions[0].question).toBe("What is the main concept?");
    });

    it("should throw error for invalid JSON", () => {
      const response = "This is not valid JSON";

      expect(() => generator.parseAIResponse(response)).toThrow(
        "Failed to parse AI response"
      );
    });

    it("should throw error for questions without correct answer", () => {
      const response = JSON.stringify([
        {
          question: "What is this?",
          answers: [
            { text: "Answer 1", correct: false },
            { text: "Answer 2", correct: false }
          ]
        }
      ]);

      expect(() => generator.parseAIResponse(response)).toThrow(
        "has no correct answer"
      );
    });
  });

  describe("toH5pFormat", () => {
    it("should convert quiz questions to H5P.MultipleChoice structures", () => {
      const questions: QuizQuestion[] = [
        {
          question: "What is photosynthesis?",
          answers: [
            { text: "Process plants use to make food", correct: true },
            { text: "Animal respiration", correct: false },
            { text: "Water absorption", correct: false }
          ]
        },
        {
          question: "What do plants need for photosynthesis?",
          answers: [
            { text: "Light, water, CO2", correct: true },
            { text: "Darkness and heat", correct: false }
          ]
        }
      ];

      const h5pContent = generator.toH5pFormat(questions);

      // Check structure
      expect(h5pContent).toHaveLength(2);

      // Verify first question
      expect(h5pContent[0].library).toBe("H5P.MultipleChoice 1.16");
      expect(h5pContent[0].params.question).toBe("What is photosynthesis?");
      expect(h5pContent[0].params.answers).toHaveLength(3);
      expect(h5pContent[0].params.answers[0].correct).toBe(true);
      expect(h5pContent[0].params.answers[0].tipsAndFeedback?.chosenFeedback).toBe(
        "Correct! Well done."
      );
      expect(h5pContent[0].params.answers[1].correct).toBe(false);
      expect(h5pContent[0].params.answers[1].tipsAndFeedback?.chosenFeedback).toBe(
        "Incorrect. Try again."
      );

      // Verify behaviour settings
      expect(h5pContent[0].params.behaviour?.enableRetry).toBe(true);
      expect(h5pContent[0].params.behaviour?.enableSolutionsButton).toBe(true);
      expect(h5pContent[0].params.behaviour?.randomAnswers).toBe(true);

      // Verify metadata
      expect(h5pContent[0].metadata.contentType).toBe("Multiple Choice");
      expect(h5pContent[0].metadata.license).toBe("U");
      expect(h5pContent[0].metadata.title).toBe("Quiz Question 1");

      // Verify second question
      expect(h5pContent[1].params.question).toBe(
        "What do plants need for photosynthesis?"
      );
      expect(h5pContent[1].metadata.title).toBe("Quiz Question 2");
    });

    it("should handle empty questions array", () => {
      const h5pContent = generator.toH5pFormat([]);

      expect(h5pContent).toHaveLength(0);
    });
  });

  describe("generateQuiz integration", () => {
    it("should handle API errors gracefully", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = Anthropic.mock.results[0].value.messages.create;

      mockCreate.mockRejectedValueOnce(new Error("API connection failed"));

      await expect(
        generator.generateQuiz("Test text about biology")
      ).rejects.toThrow("Quiz generation failed: API connection failed");
    });

    it("should successfully generate quiz from valid API response", async () => {
      const Anthropic = require("@anthropic-ai/sdk").default;
      const mockCreate = Anthropic.mock.results[0].value.messages.create;

      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify([
              {
                question: "What is the process by which plants make food?",
                answers: [
                  { text: "Photosynthesis", correct: true },
                  { text: "Respiration", correct: false },
                  { text: "Transpiration", correct: false },
                  { text: "Digestion", correct: false }
                ]
              }
            ])
          }
        ]
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await generator.generateQuiz(
        "Photosynthesis is the process by which plants convert light energy into chemical energy."
      );

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].question).toBe(
        "What is the process by which plants make food?"
      );
      expect(result.questions[0].answers).toHaveLength(4);
      expect(result.questions[0].answers[0].correct).toBe(true);
    });
  });
});
