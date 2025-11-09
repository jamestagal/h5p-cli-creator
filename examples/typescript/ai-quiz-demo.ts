/**
 * AI Quiz Generation Demo
 *
 * Demonstrates the complete pipeline:
 * 1. Source text -> QuizGenerator -> H5P.MultipleChoice structures
 * 2. ContentBuilder integration with quiz content
 * 3. PackageAssembler -> final .h5p package
 *
 * Prerequisites:
 * - Set ANTHROPIC_API_KEY environment variable
 * - Run: npm install && npm run build
 * - Execute: node dist/examples/ai-quiz-demo.js
 */

import { LibraryRegistry } from "../compiler/LibraryRegistry";
import { SemanticValidator } from "../compiler/SemanticValidator";
import { ContentBuilder } from "../compiler/ContentBuilder";
import { PackageAssembler } from "../compiler/PackageAssembler";
import { QuizGenerator } from "../ai/QuizGenerator";
import * as path from "path";

async function generateAIQuizBook() {
  console.log("=== AI Quiz Generation Demo ===\n");

  // Step 1: Initialize components
  console.log("1. Initializing library registry and validator...");
  const registry = new LibraryRegistry();
  const validator = new SemanticValidator();

  console.log("2. Fetching H5P.InteractiveBook library...");
  await registry.fetchLibrary("H5P.InteractiveBook");

  // Step 2: Prepare source content
  const photosynthesisText = `
Photosynthesis is the process by which plants, algae, and some bacteria convert light energy
into chemical energy stored in glucose. This process occurs primarily in the chloroplasts of
plant cells, which contain the green pigment chlorophyll.

The process requires three main inputs: sunlight, water (H2O), and carbon dioxide (CO2).
Through a series of complex chemical reactions, these inputs are converted into glucose (C6H12O6)
and oxygen (O2). The overall equation for photosynthesis is:

6CO2 + 6H2O + light energy → C6H12O6 + 6O2

Photosynthesis occurs in two main stages: the light-dependent reactions and the light-independent
reactions (Calvin cycle). The light-dependent reactions occur in the thylakoid membranes and
produce ATP and NADPH. These energy carriers are then used in the Calvin cycle, which occurs
in the stroma, to fix carbon dioxide and produce glucose.

This process is essential for life on Earth as it produces oxygen and forms the base of most
food chains. Plants use some of the glucose for their own energy needs and convert the rest
into starch for storage.
  `.trim();

  // Step 3: Generate quiz using AI
  console.log("3. Generating quiz questions using Claude AI...");
  const quizGenerator = new QuizGenerator();

  let quizContent;
  try {
    quizContent = await quizGenerator.generateH5pQuiz(photosynthesisText, 5);
    console.log(`   Generated ${quizContent.length} quiz questions`);
  } catch (error) {
    console.error("   ERROR: Failed to generate quiz. Make sure ANTHROPIC_API_KEY is set.");
    console.error(`   ${error instanceof Error ? error.message : error}`);
    console.log("\n   Falling back to manual quiz content for demo purposes...");

    // Fallback to manual quiz for demo
    quizContent = [
      {
        library: "H5P.MultipleChoice 1.16",
        params: {
          question: "What is the primary function of photosynthesis?",
          answers: [
            {
              text: "Converting light energy into chemical energy",
              correct: true,
              tipsAndFeedback: {
                tip: "",
                chosenFeedback: "Correct! Photosynthesis converts light energy into glucose."
              }
            },
            {
              text: "Breaking down glucose for energy",
              correct: false,
              tipsAndFeedback: {
                tip: "",
                chosenFeedback: "Incorrect. That's respiration, not photosynthesis."
              }
            },
            {
              text: "Producing carbon dioxide",
              correct: false,
              tipsAndFeedback: {
                tip: "",
                chosenFeedback: "Incorrect. Photosynthesis consumes CO2, not produces it."
              }
            }
          ],
          behaviour: {
            enableRetry: true,
            enableSolutionsButton: true,
            type: "auto"
          }
        },
        metadata: {
          contentType: "Multiple Choice",
          license: "U",
          title: "Photosynthesis Quiz Question 1"
        }
      }
    ];
  }

  // Step 4: Build book content with AI-generated quiz
  console.log("4. Building Interactive Book with ContentBuilder...");
  const builder = new ContentBuilder(registry, validator);

  builder.createBook("Photosynthesis Learning Module", "en");

  // Chapter 1: Educational content
  const chapter1 = builder.addChapter("Introduction to Photosynthesis");
  chapter1.addTextPage(
    "What is Photosynthesis?",
    photosynthesisText
  );

  // Chapter 2: AI-generated quiz
  const chapter2 = builder.addChapter("Test Your Knowledge");
  chapter2.addTextPage(
    "Quiz Time",
    "Answer the following questions to test your understanding of photosynthesis."
  );
  chapter2.addQuizPage(quizContent);

  const bookContent = builder.build();
  console.log(`   Created book with ${bookContent.chapters.length} chapters`);

  // Step 5: Validate content
  console.log("5. Validating content structure...");
  const validationResult = builder.validate();
  if (validationResult.valid) {
    console.log("   ✓ Content validation passed");
  } else {
    console.log("   ✗ Content validation failed:");
    validationResult.errors.forEach(err => {
      console.log(`     - ${err.fieldPath}: ${err.message}`);
    });
  }

  // Step 6: Resolve dependencies
  console.log("6. Resolving library dependencies...");
  const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");
  console.log(`   Resolved ${dependencies.length} library dependencies`);

  // Step 7: Assemble package
  console.log("7. Assembling .h5p package...");
  const assembler = new PackageAssembler();
  const zip = await assembler.assemble(
    bookContent,
    dependencies,
    builder.getMediaFiles(),
    builder.getTitle(),
    builder.getLanguage(),
    registry
  );

  // Step 8: Save package
  const outputPath = path.join(__dirname, "../../examples/ai-quiz-book.h5p");
  console.log(`8. Saving package to: ${outputPath}`);
  await assembler.savePackage(zip, outputPath);

  console.log("\n=== Demo Complete ===");
  console.log("✓ Successfully generated Interactive Book with AI quiz");
  console.log(`✓ Output: ${outputPath}`);
  console.log("\nNext steps:");
  console.log("1. Upload ai-quiz-book.h5p to h5p.com or Lumi to test");
  console.log("2. Verify quiz questions are well-formed and functional");
  console.log("3. Check that content displays correctly in H5P player");
}

// Run demo
if (require.main === module) {
  generateAIQuizBook()
    .then(() => {
      console.log("\nDemo finished successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\nDemo failed with error:");
      console.error(error);
      process.exit(1);
    });
}

export { generateAIQuizBook };
