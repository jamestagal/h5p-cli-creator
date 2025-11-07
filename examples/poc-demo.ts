/**
 * POC Demonstration: Template-Free H5P Content Compiler with AI Integration
 *
 * This script demonstrates the complete end-to-end workflow:
 * 1. Parse YAML input file describing book structure
 * 2. Use LibraryRegistry to fetch and cache H5P libraries (including H5P.MultipleChoice automatically)
 * 3. Use QuizGenerator to generate AI-powered quiz content
 * 4. Use ContentBuilder to build Interactive Book structure
 * 5. Use PackageAssembler to create .h5p package from scratch (no templates)
 * 6. Output biology-lesson.h5p ready for upload to H5P platforms
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { LibraryRegistry } from "../src/compiler/LibraryRegistry";

// Load environment variables from .env file
dotenv.config();
import { SemanticValidator } from "../src/compiler/SemanticValidator";
import { ContentBuilder } from "../src/compiler/ContentBuilder";
import { PackageAssembler } from "../src/compiler/PackageAssembler";
import { QuizGenerator } from "../src/ai/QuizGenerator";
import { YamlInputParser } from "../src/compiler/YamlInputParser";
import {
  BookDefinition,
  ChapterDefinition,
  AnyContentItem
} from "../src/compiler/YamlInputParser";

/**
 * Main POC execution function
 */
async function runPOC() {
  console.log("=== Template-Free H5P Compiler POC ===\n");

  try {
    // Step 1: Parse YAML input
    console.log("Step 1: Parsing YAML input...");
    const yamlPath = path.resolve(__dirname, "biology-lesson.yaml");
    const parser = new YamlInputParser();
    const bookDef = await parser.parse(yamlPath);
    console.log(`  - Parsed book: "${bookDef.title}" (${bookDef.language})`);
    console.log(`  - Chapters: ${bookDef.chapters.length}`);
    console.log();

    // Step 2: Initialize library registry and fetch dependencies
    console.log("Step 2: Fetching H5P libraries from Hub...");
    const registry = new LibraryRegistry();

    // Fetch H5P.InteractiveBook and all dependencies (including H5P.MultipleChoice)
    console.log("  - Fetching H5P.InteractiveBook...");
    await registry.fetchLibrary("H5P.InteractiveBook");

    console.log("  - Resolving dependency tree...");
    const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");
    console.log(`  - Total libraries resolved: ${dependencies.length}`);
    console.log(`  - Libraries: ${dependencies.map(d => d.machineName).join(", ")}`);
    console.log();

    // Step 3: Check if we need H5P.MultipleChoice and fetch it
    console.log("Step 3: Checking for quiz content...");
    const hasQuiz = bookDef.chapters.some(chapter =>
      chapter.content.some(item => item.type === "ai-quiz")
    );

    if (hasQuiz) {
      console.log("  - AI quiz content detected");
      console.log("  - Fetching H5P.MultiChoice library...");
      await registry.fetchLibrary("H5P.MultiChoice");
      const quizDeps = await registry.resolveDependencies("H5P.MultiChoice");

      // Merge dependencies (avoid duplicates)
      const allDeps = new Map<string, any>();
      [...dependencies, ...quizDeps].forEach(dep => {
        const key = `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`;
        allDeps.set(key, dep);
      });
      dependencies.length = 0;
      dependencies.push(...Array.from(allDeps.values()));

      console.log(`  - Total libraries with quiz support: ${dependencies.length}`);
    }
    console.log();

    // Step 4: Initialize AI quiz generator
    console.log("Step 4: Initializing AI components...");
    const quizGenerator = new QuizGenerator();
    console.log("  - QuizGenerator initialized (using ANTHROPIC_API_KEY from environment)");
    console.log();

    // Step 5: Build content using ContentBuilder
    console.log("Step 5: Building book content...");
    const validator = new SemanticValidator();
    const builder = new ContentBuilder(registry, validator);

    builder.createBook(bookDef.title, bookDef.language);
    console.log(`  - Created book: "${bookDef.title}"`);

    // Process each chapter
    for (let i = 0; i < bookDef.chapters.length; i++) {
      const chapter = bookDef.chapters[i];
      console.log(`  - Processing chapter ${i + 1}: "${chapter.title}"`);

      const chapterBuilder = builder.addChapter(chapter.title);

      // Process each content item in the chapter
      for (const item of chapter.content) {
        await processContentItem(item, chapterBuilder, quizGenerator);
      }
    }
    console.log();

    // Step 6: Validate content (skipped - validation not critical for POC)
    console.log("Step 6: Skipping validation (not critical for POC)...\n");

    // Step 7: Assemble package
    console.log("Step 7: Assembling .h5p package...");
    const assembler = new PackageAssembler();
    const content = builder.build();
    const mediaFiles = builder.getMediaFiles();

    console.log(`  - Content sections: ${content.chapters.length}`);
    console.log(`  - Media files: ${mediaFiles.length}`);

    const packageZip = await assembler.assemble(
      content,
      dependencies,
      mediaFiles,
      builder.getTitle(),
      builder.getLanguage(),
      registry
    );
    console.log("  - Package assembled successfully");
    console.log();

    // Step 8: Save package
    console.log("Step 8: Saving package to disk...");
    const outputPath = path.resolve(__dirname, "biology-lesson.h5p");
    await assembler.savePackage(packageZip, outputPath);
    console.log(`  - Saved to: ${outputPath}`);
    console.log();

    // Step 9: Summary
    console.log("=== POC Complete ===");
    console.log();
    console.log("Summary:");
    console.log(`  - Input: biology-lesson.yaml`);
    console.log(`  - Output: biology-lesson.h5p`);
    console.log(`  - Libraries: ${dependencies.length} (fetched from H5P Hub, no templates used)`);
    console.log(`  - Chapters: ${bookDef.chapters.length}`);
    console.log(`  - Media files: ${mediaFiles.length}`);
    console.log();
    console.log("Next steps:");
    console.log("  1. Upload biology-lesson.h5p to h5p.com for validation");
    console.log("  2. Test in Lumi H5P editor");
    console.log("  3. Verify all content displays correctly");
    console.log("  4. Document results in poc-results.md");
    console.log();

  } catch (error) {
    console.error("\nPOC FAILED:");
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
      if (error.stack) {
        console.error("\nStack trace:");
        console.error(error.stack);
      }
    } else {
      console.error(`  ${error}`);
    }
    process.exit(1);
  }
}

/**
 * Processes a single content item and adds it to the chapter builder
 */
async function processContentItem(
  item: AnyContentItem,
  chapterBuilder: any,
  quizGenerator: QuizGenerator
): Promise<void> {
  switch (item.type) {
    case "text":
      console.log(`    - Adding text page: "${item.title || 'Untitled'}"`);
      chapterBuilder.addTextPage(item.title || "", item.text);
      break;

    case "ai-text":
      console.log(`    - Generating AI text: "${item.title || 'Untitled'}"`);
      console.log(`      Prompt: "${item.prompt.substring(0, 60)}..."`);

      try {
        let generatedText = "";

        // Use Gemini if available, otherwise Claude
        if (process.env.GOOGLE_API_KEY) {
          console.log(`      Using Gemini 2.5 Flash`);
          const { GoogleGenerativeAI } = await import("@google/generative-ai");
          const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          const result = await model.generateContent(item.prompt);
          generatedText = result.response.text();
        } else if (process.env.ANTHROPIC_API_KEY) {
          console.log(`      Using Claude Sonnet 4`);
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            messages: [{
              role: "user",
              content: item.prompt
            }]
          });
          generatedText = response.content
            .filter((block: any) => block.type === "text")
            .map((block: any) => block.text)
            .join("");
        } else {
          throw new Error("No API key found. Set GOOGLE_API_KEY or ANTHROPIC_API_KEY");
        }

        chapterBuilder.addTextPage(item.title || "AI-Generated Content", generatedText);
        console.log(`      Generated ${generatedText.length} characters`);
      } catch (error) {
        console.warn(`      AI generation failed: ${error}`);
        chapterBuilder.addTextPage(
          item.title || "Content",
          `AI text generation failed. Please check your API key configuration.\n\nPrompt was: ${item.prompt}`
        );
      }
      break;

    case "image":
      console.log(`    - Adding image: "${item.title || item.alt}"`);
      console.log(`      Path: ${item.path}`);
      await chapterBuilder.addImagePage(item.title || item.alt, item.path, item.alt);
      break;

    case "audio":
      console.log(`    - Adding audio: "${item.title || 'Audio'}"`);
      console.log(`      Path: ${item.path}`);
      await chapterBuilder.addAudioPage(item.title || "Audio", item.path);
      break;

    case "ai-quiz":
      console.log(`    - Generating AI quiz: "${item.title || 'Quiz'}"`);
      console.log(`      Source text length: ${item.sourceText.length} characters`);
      console.log(`      Questions: ${item.questionCount || 5}`);

      try {
        const quizContent = await quizGenerator.generateH5pQuiz(
          item.sourceText,
          item.questionCount || 5
        );
        chapterBuilder.addQuizPage(quizContent);
        console.log(`      Generated ${quizContent.length} questions`);
      } catch (error) {
        console.warn(`      AI quiz generation failed: ${error}`);
        // Add a text page explaining the failure instead
        chapterBuilder.addTextPage(
          item.title || "Quiz",
          `Quiz generation failed. Please ensure ANTHROPIC_API_KEY is set.\n\nError: ${error}`
        );
      }
      break;

    default:
      console.warn(`    - Unknown content type: ${(item as any).type}`);
  }
}

// Run the POC
runPOC().catch(error => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
