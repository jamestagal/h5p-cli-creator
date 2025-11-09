import * as dotenv from "dotenv";
import * as path from "path";
import * as yargs from "yargs";
import * as fsExtra from "fs-extra";

import { YamlInputParser } from "../../compiler/YamlInputParser";
import { LibraryRegistry } from "../../compiler/LibraryRegistry";
import { QuizGenerator } from "../../ai/QuizGenerator";
import { HandlerRegistry } from "../../handlers/HandlerRegistry";
import { TextHandler } from "../../handlers/core/TextHandler";
import { ImageHandler } from "../../handlers/core/ImageHandler";
import { AudioHandler } from "../../handlers/core/AudioHandler";
import { AITextHandler } from "../../handlers/core/AITextHandler";
import { QuizHandler } from "../../handlers/ai/QuizHandler";
import { FlashcardsHandler } from "../../handlers/embedded/FlashcardsHandler";
import { DialogCardsHandler } from "../../handlers/embedded/DialogCardsHandler";
import { H5pCompiler } from "../../compiler/H5pCompiler";

// Load environment variables
dotenv.config();

/**
 * Yargs module for AI-powered Interactive Book content type.
 * Handles YAML input with AI-generated content (text and quizzes).
 *
 * This module uses the handler-based H5P compiler infrastructure:
 * - YamlInputParser: Parse YAML book definitions
 * - HandlerRegistry: Dynamic handler lookup and library resolution
 * - H5pCompiler: Reusable compiler for CLI and API usage
 * - QuizGenerator: AI-powered quiz generation (Gemini or Claude)
 */
export class InteractiveBookAIModule implements yargs.CommandModule {
  public command = "interactivebook-ai <input> <output>";
  public describe =
    "Creates H5P Interactive Book from YAML with AI-generated content. \
    Supports ai-text (AI-generated explanations) and ai-quiz (AI-generated questions). \
    Requires GOOGLE_API_KEY or ANTHROPIC_API_KEY environment variable.";

  public builder = (y: yargs.Argv) =>
    y
      .positional("input", {
        describe: "YAML input file defining book structure",
        type: "string"
      })
      .positional("output", {
        describe: "h5p output file including .h5p extension",
        type: "string"
      })
      .option("ai-provider", {
        describe: "AI provider to use (gemini or claude)",
        choices: ["gemini", "claude", "auto"],
        default: "auto",
        type: "string",
      })
      .option("api-key", {
        describe: "API key for AI provider (overrides environment variable)",
        type: "string",
      })
      .option("verbose", {
        describe: "Show detailed AI generation logs",
        default: false,
        type: "boolean",
      })
      .example(
        "$0 interactivebook-ai ./biology-lesson.yaml ./output.h5p",
        "Generate Interactive Book with AI content"
      )
      .example(
        "$0 interactivebook-ai ./lesson.yaml ./output.h5p --ai-provider=gemini",
        "Use Google Gemini for AI generation"
      )
      .example(
        "$0 interactivebook-ai ./lesson.yaml ./output.h5p --verbose",
        "Show detailed generation logs"
      );

  public handler = async (argv) => {
    await this.runInteractiveBookAI(
      argv.input,
      argv.output,
      argv.aiProvider,
      argv.apiKey,
      argv.verbose
    );
  };

  private async runInteractiveBookAI(
    yamlFile: string,
    outputFile: string,
    aiProvider: "gemini" | "claude" | "auto",
    apiKey: string | undefined,
    verbose: boolean
  ): Promise<void> {
    console.log("=== AI-Powered Interactive Book Generator ===\n");

    try {
      // Register handlers at startup
      const handlerRegistry = HandlerRegistry.getInstance();
      handlerRegistry.register(new TextHandler());
      handlerRegistry.register(new ImageHandler());
      handlerRegistry.register(new AudioHandler());
      handlerRegistry.register(new AITextHandler());
      handlerRegistry.register(new QuizHandler());
      handlerRegistry.register(new FlashcardsHandler());
      handlerRegistry.register(new DialogCardsHandler());

      // Override API key if provided
      if (apiKey) {
        if (aiProvider === "gemini" || aiProvider === "auto") {
          process.env.GOOGLE_API_KEY = apiKey;
        } else if (aiProvider === "claude") {
          process.env.ANTHROPIC_API_KEY = apiKey;
        }
      }

      // Validate API keys
      if (!process.env.GOOGLE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          "No AI API key found. Please set GOOGLE_API_KEY or ANTHROPIC_API_KEY environment variable, " +
          "or use --api-key option."
        );
      }

      // Step 1: Parse YAML input
      if (verbose) console.log("Step 1: Parsing YAML input...");
      const parser = new YamlInputParser();
      const bookDef = await parser.parse(path.resolve(yamlFile));

      if (verbose) {
        console.log(`  - Parsed book: "${bookDef.title}" (${bookDef.language})`);
        console.log(`  - Chapters: ${bookDef.chapters.length}`);
        console.log();
      }

      // Step 2: Initialize compiler components
      if (verbose) console.log("Step 2: Initializing compiler...");
      const libraryRegistry = new LibraryRegistry();
      const quizGenerator = new QuizGenerator();
      const compiler = new H5pCompiler(handlerRegistry, libraryRegistry, quizGenerator);

      if (verbose) {
        const provider = process.env.GOOGLE_API_KEY ? "Google Gemini 2.5 Flash" : "Anthropic Claude Sonnet 4";
        console.log(`  - AI Provider: ${provider}`);
        console.log();
      }

      // Step 3: Compile book to .h5p buffer
      if (verbose) console.log("Step 3: Compiling book to .h5p package...");
      const h5pBuffer = await compiler.compile(bookDef, {
        verbose,
        aiProvider,
        basePath: path.dirname(path.resolve(yamlFile))
      });

      if (verbose) console.log();

      // Step 4: Save package to disk
      if (verbose) console.log("Step 4: Saving package to disk...");
      const outputPath = path.resolve(outputFile);
      await fsExtra.writeFile(outputPath, h5pBuffer);

      console.log();
      console.log("✅ Success!");
      console.log(`📦 Generated: ${outputPath}`);
      console.log(`   - Title: ${bookDef.title}`);
      console.log(`   - Chapters: ${bookDef.chapters.length}`);
      console.log();

    } catch (error) {
      console.error("\n❌ Generation failed:");
      if (error instanceof Error) {
        console.error(`   ${error.message}`);
        if (verbose && error.stack) {
          console.error("\nStack trace:");
          console.error(error.stack);
        }
      } else {
        console.error(`   ${error}`);
      }
      process.exit(1);
    }
  }
}
