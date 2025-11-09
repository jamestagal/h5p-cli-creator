/**
 * AI-Powered POC Demo: Template-Free H5P with AI-Generated Content
 *
 * This demonstrates:
 * 1. AI-generated educational text (using Gemini or Claude)
 * 2. Real media files (image and audio)
 * 3. Template-free package assembly
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { LibraryRegistry } from "../src/compiler/LibraryRegistry";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

// Load environment variables
dotenv.config();
import { ContentBuilder } from "../src/compiler/ContentBuilder";
import { SemanticValidator } from "../src/compiler/SemanticValidator";
import { PackageAssembler } from "../src/compiler/PackageAssembler";

async function runAIPOC() {
  console.log("=== AI-Powered H5P Compiler Demo ===\n");

  try {
    // Step 1: Initialize AI
    console.log("Step 1: Initializing AI provider...");
    let aiText = "";

    if (process.env.GOOGLE_API_KEY) {
      console.log("  - Using Google Gemini 2.5 Flash");
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = "Write a clear, educational summary of photosynthesis for high school students. " +
        "Include information about the process, inputs (sunlight, water, carbon dioxide), " +
        "outputs (oxygen, glucose), and where it occurs in plant cells (chloroplasts). " +
        "Make it about 150-200 words. Format it as plain text with paragraphs separated by double newlines.";

      const result = await model.generateContent(prompt);
      aiText = result.response.text();
      console.log(`  - Generated ${aiText.length} characters\n`);
    } else if (process.env.ANTHROPIC_API_KEY) {
      console.log("  - Using Claude Sonnet 4");
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: "Write a clear, educational summary of photosynthesis for high school students. " +
            "Include information about the process, inputs (sunlight, water, carbon dioxide), " +
            "outputs (oxygen, glucose), and where it occurs in plant cells (chloroplasts). " +
            "Make it about 150-200 words. Format it as plain text with paragraphs separated by double newlines."
        }]
      });

      aiText = message.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");
      console.log(`  - Generated ${aiText.length} characters\n`);
    } else {
      throw new Error("No API key found. Set GOOGLE_API_KEY or ANTHROPIC_API_KEY environment variable.");
    }

    // Step 2: Fetch libraries
    console.log("Step 2: Fetching H5P libraries from cache...");
    const registry = new LibraryRegistry();
    const bookLibrary = await registry.fetchLibrary("H5P.InteractiveBook");

    console.log("  - Resolving dependency tree...");
    const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");
    console.log(`  - Total libraries resolved: ${dependencies.length}`);
    console.log(`  - Libraries: ${dependencies.map(d => d.machineName).join(", ")}\n`);

    // Step 3: Build content
    console.log("Step 3: Building Interactive Book with AI content...");
    const validator = new SemanticValidator();
    const builder = new ContentBuilder(registry, validator);

    builder.createBook("AI-Generated Biology Lesson", "en");

    // Chapter 1: AI-Generated Introduction
    builder.addChapter("Introduction to Photosynthesis")
      .addTextPage(
        "What is Photosynthesis?",
        aiText
      );

    // Chapter 2: Manual content about the process
    builder.addChapter("How Photosynthesis Works")
      .addTextPage(
        "Light-Dependent Reactions",
        "The light-dependent reactions occur in the thylakoid membranes of chloroplasts.\n\n" +
        "Chlorophyll captures light energy, which is then used to split water molecules."
      )
      .addTextPage(
        "Calvin Cycle",
        "The Calvin cycle (light-independent reactions) occurs in the stroma.\n\n" +
        "Carbon dioxide is converted into glucose using the energy from the light reactions."
      );

    // Chapter 3: Visual Content
    const testImagePath = path.resolve(__dirname, "../tests/images/test-image.jpg");
    const imageChapter = builder.addChapter("Chloroplast Structure");
    await imageChapter.addImagePage(
      "Inside a Chloroplast",
      testImagePath,
      "Diagram showing the structure of a chloroplast"
    );

    // Chapter 4: Audio Content
    const testAudioPath = path.resolve(__dirname, "../tests/audios/test-audio.mp3");
    const audioChapter = builder.addChapter("Photosynthesis Summary");
    await audioChapter.addAudioPage(
      "Listen to Summary",
      testAudioPath
    );

    const content = builder.build();
    const mediaFiles = builder.getMediaFiles();

    console.log("  - Book created: AI-Generated Biology Lesson");
    console.log(`  - Chapters: ${content.chapters.length}`);
    console.log(`  - Media files: ${mediaFiles.length}`);
    console.log(`  - AI-generated content: Chapter 1\n`);

    // Step 4: Assemble package
    console.log("Step 4: Assembling .h5p package...");
    const assembler = new PackageAssembler();
    const packageZip = await assembler.assemble(
      content,
      dependencies,
      mediaFiles,
      "AI-Generated Biology Lesson",
      "en",
      registry
    );

    // Step 5: Save package
    const outputPath = path.resolve(__dirname, "biology-lesson-ai.h5p");
    console.log(`Step 5: Saving package to ${outputPath}...`);
    await assembler.savePackage(packageZip, outputPath);

    console.log("\n✅ AI-POWERED POC COMPLETE!\n");
    console.log(`📦 Generated: biology-lesson-ai.h5p\n`);
    console.log("Features demonstrated:");
    console.log("  ✓ AI-generated educational content (Chapter 1)");
    console.log("  ✓ Real media files (image and audio)");
    console.log("  ✓ Template-free H5P compilation");
    console.log("  ✓ Zero template files used\n");
    console.log("Next steps:");
    console.log("1. Upload to h5p.com to test");
    console.log("2. Verify AI-generated text displays correctly");
    console.log("3. Verify image and audio work");

  } catch (error) {
    console.error("\nPOC FAILED:");
    console.error("  " + (error as Error).message);
    console.error("\nStack trace:");
    console.error((error as Error).stack);
    process.exit(1);
  }
}

runAIPOC();
