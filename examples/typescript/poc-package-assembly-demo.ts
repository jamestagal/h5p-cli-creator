/**
 * POC Demonstration: Template-Free H5P Package Assembly
 *
 * This script demonstrates the complete workflow for creating an H5P Interactive Book
 * package from scratch without using any template files:
 *
 * 1. LibraryRegistry fetches and caches libraries from H5P Hub
 * 2. ContentBuilder creates book structure with chapters and pages
 * 3. PackageAssembler bundles everything into a valid .h5p package
 *
 * Run this after building with: node dist/examples/poc-package-assembly-demo.js
 */

import * as path from "path";
import { LibraryRegistry } from "../compiler/LibraryRegistry";
import { SemanticValidator } from "../compiler/SemanticValidator";
import { ContentBuilder } from "../compiler/ContentBuilder";
import { PackageAssembler } from "../compiler/PackageAssembler";

async function main() {
  console.log("=== POC: Template-Free H5P Package Assembly ===\n");

  // Step 1: Initialize components
  console.log("Step 1: Initializing LibraryRegistry, SemanticValidator, and PackageAssembler...");
  const registry = new LibraryRegistry();
  const validator = new SemanticValidator();
  const assembler = new PackageAssembler();

  // Step 2: Resolve all dependencies for H5P.InteractiveBook
  console.log("\nStep 2: Fetching H5P.InteractiveBook and resolving dependencies...");
  const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");
  console.log(`Resolved ${dependencies.length} libraries:`);
  dependencies.forEach(dep => {
    console.log(`  - ${dep.machineName} ${dep.majorVersion}.${dep.minorVersion}.${dep.patchVersion}`);
  });

  // Step 3: Build book content using ContentBuilder
  console.log("\nStep 3: Building book content with ContentBuilder...");
  const builder = new ContentBuilder(registry, validator);
  builder.createBook("Biology Lesson: Photosynthesis", "en");

  // Chapter 1: Introduction
  console.log("  Adding Chapter 1: Introduction");
  const chapter1 = builder.addChapter("Introduction to Photosynthesis");
  chapter1.addTextPage(
    "What is Photosynthesis?",
    "Photosynthesis is the process by which plants convert light energy into chemical energy.\n\n" +
    "This process takes place in the chloroplasts of plant cells and is essential for life on Earth."
  );

  // Chapter 2: Image example (if test image exists)
  const testImagePath = path.join(__dirname, "../tests/test-image.jpg");
  try {
    console.log("  Adding Chapter 2: Visual Content");
    const chapter2 = builder.addChapter("The Chloroplast");
    chapter2.addTextPage("Structure", "The chloroplast contains specialized structures for photosynthesis.");
    await chapter2.addImagePage(
      "Chloroplast Diagram",
      testImagePath,
      "Diagram showing the internal structure of a chloroplast"
    );
  } catch (error) {
    console.log("  Skipping image chapter (test image not found)");
  }

  // Chapter 3: Key concepts
  console.log("  Adding Chapter 3: Key Concepts");
  const chapter3 = builder.addChapter("Key Concepts");
  chapter3.addTextPage(
    "The Photosynthesis Equation",
    "The overall chemical equation for photosynthesis is:\n\n" +
    "6 CO2 + 6 H2O + light energy → C6H12O6 + 6 O2\n\n" +
    "Carbon dioxide and water are converted into glucose and oxygen using light energy."
  );

  const content = builder.build();
  console.log(`Built book with ${content.chapters.length} chapters`);

  // Step 4: Validate content
  console.log("\nStep 4: Validating content against H5P.InteractiveBook semantics...");
  const validationResult = builder.validate();
  if (validationResult.valid) {
    console.log("  ✓ Content is valid");
  } else {
    console.log("  ✗ Validation errors:");
    validationResult.errors.forEach(err => {
      console.log(`    - ${err.fieldPath}: ${err.message}`);
    });
    process.exit(1);
  }

  // Step 5: Assemble package
  console.log("\nStep 5: Assembling H5P package without templates...");
  const zip = await assembler.assemble(
    content,
    dependencies,
    builder.getMediaFiles(),
    builder.getTitle(),
    builder.getLanguage(),
    registry
  );

  console.log("Package structure:");
  const files = Object.keys(zip.files);
  console.log(`  Total files: ${files.length}`);
  console.log(`  - h5p.json: ${files.includes("h5p.json") ? "✓" : "✗"}`);
  console.log(`  - content/content.json: ${files.includes("content/content.json") ? "✓" : "✗"}`);

  const libraryFiles = files.filter(f => f.includes("library.json"));
  console.log(`  - Library directories: ${libraryFiles.length} libraries bundled`);

  const imageFiles = files.filter(f => f.startsWith("content/images/"));
  if (imageFiles.length > 0) {
    console.log(`  - Media files: ${imageFiles.length} images`);
  }

  // Step 6: Save package
  const outputPath = path.join(__dirname, "biology-lesson-poc.h5p");
  console.log(`\nStep 6: Saving package to ${outputPath}...`);
  await assembler.savePackage(zip, outputPath);

  console.log("\n=== POC Complete ===");
  console.log("Package created successfully without any template files!");
  console.log("\nTo validate:");
  console.log("1. Upload to h5p.com platform");
  console.log("2. Open in Lumi H5P editor");
  console.log("3. Test in an LMS system");
}

// Run the demonstration
main().catch(error => {
  console.error("Error during POC demonstration:", error);
  process.exit(1);
});
