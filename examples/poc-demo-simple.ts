/**
 * Simplified POC Demonstration: Template-Free H5P Content Compiler
 *
 * This demonstrates the complete workflow WITHOUT quiz (since H5P.MultipleChoice
 * download from Hub requires browser context).
 *
 * Demonstrates:
 * 1. Library management with cached H5P.InteractiveBook
 * 2. ContentBuilder fluent API
 * 3. Template-free package assembly
 * 4. Text, image, and audio content
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { LibraryRegistry } from "../src/compiler/LibraryRegistry";

// Load environment variables
dotenv.config();
import { ContentBuilder } from "../src/compiler/ContentBuilder";
import { SemanticValidator } from "../src/compiler/SemanticValidator";
import { PackageAssembler } from "../src/compiler/PackageAssembler";

async function runSimplePOC() {
  console.log("=== Template-Free H5P Compiler - Simple Demo ===\n");

  try {
    // Step 1: Fetch libraries
    console.log("Step 1: Fetching H5P libraries from cache...");
    const registry = new LibraryRegistry();
    const bookLibrary = await registry.fetchLibrary("H5P.InteractiveBook");

    console.log("  - Resolving dependency tree...");
    const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");
    console.log(`  - Total libraries resolved: ${dependencies.length}`);
    console.log(`  - Libraries: ${dependencies.map(d => d.machineName).join(", ")}\n`);

    // Step 2: Build content
    console.log("Step 2: Building Interactive Book content...");
    const validator = new SemanticValidator();
    const builder = new ContentBuilder(registry, validator);

    builder.createBook("Simple Biology Lesson", "en");

    // Chapter 1: Introduction
    builder.addChapter("Introduction to Photosynthesis")
      .addTextPage(
        "What is Photosynthesis?",
        "Photosynthesis is the process by which plants convert light energy into chemical energy.\n\n" +
        "Plants use sunlight, water, and carbon dioxide to produce glucose and oxygen."
      );

    // Chapter 2: The Process
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

    console.log("  - Book created: Simple Biology Lesson");
    console.log(`  - Chapters: ${content.chapters.length}`);
    console.log(`  - Media files: ${mediaFiles.length}\n`);

    // Step 3: Assemble package
    console.log("Step 3: Assembling .h5p package...");
    const assembler = new PackageAssembler();
    const packageZip = await assembler.assemble(
      content,
      dependencies,
      mediaFiles,
      "Simple Biology Lesson",
      "en",
      registry
    );

    // Step 4: Save package
    const outputPath = path.resolve(__dirname, "biology-lesson-simple.h5p");
    console.log(`Step 4: Saving package to ${outputPath}...`);
    await assembler.savePackage(packageZip, outputPath);

    console.log("\n✅ POC COMPLETE!");
    console.log(`\n📦 Generated: biology-lesson-simple.h5p`);
    console.log("\nNext steps:");
    console.log("1. Upload to h5p.com to test");
    console.log("2. Open in Lumi editor");
    console.log("3. Verify all content displays correctly");

    console.log("\n🎉 Template-Free H5P Compilation Successful!");
    console.log("   - Zero template files used");
    console.log("   - All libraries bundled programmatically");
    console.log("   - Content built with fluent API");

  } catch (error) {
    console.error("\nPOC FAILED:");
    console.error("  " + (error as Error).message);
    console.error("\nStack trace:");
    console.error((error as Error).stack);
    process.exit(1);
  }
}

runSimplePOC();
