/**
 * Simple test to verify Gemini AI integration works
 */

import * as dotenv from "dotenv";
import { QuizGenerator } from "./src/ai/QuizGenerator";

// Load .env file
dotenv.config();

async function testGemini() {
  console.log("Testing Gemini 2.5 Flash integration...\n");

  const quizGen = new QuizGenerator();

  const sampleText = `
Photosynthesis is the process by which plants convert light energy into chemical energy.
Plants use sunlight, water, and carbon dioxide to produce glucose and oxygen.
The process occurs in chloroplasts, specifically in the thylakoid membranes and stroma.
Chlorophyll, the green pigment in plants, captures light energy.
The light-dependent reactions occur in the thylakoid membranes, while the Calvin cycle
(light-independent reactions) occurs in the stroma.
  `.trim();

  try {
    console.log("Generating quiz from sample text about photosynthesis...");
    const quiz = await quizGen.generateQuiz(sampleText, 3);

    console.log("\n✅ Quiz generated successfully!\n");
    console.log(`Generated ${quiz.questions.length} questions:\n`);

    quiz.questions.forEach((q, i) => {
      console.log(`Question ${i + 1}: ${q.question}`);
      q.answers.forEach((a, j) => {
        const marker = a.correct ? "✓" : " ";
        console.log(`  [${marker}] ${a.text}`);
      });
      console.log();
    });

    console.log("\n🎉 Gemini 2.5 Flash is working correctly!");
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  }
}

testGemini();
