import * as dotenv from "dotenv";
import * as path from "path";
import * as yargs from "yargs";

import { YamlInputParser, AnyContentItem } from "../../compiler/YamlInputParser";
import { LibraryRegistry } from "../../compiler/LibraryRegistry";
import { SemanticValidator } from "../../compiler/SemanticValidator";
import { ContentBuilder } from "../../compiler/ContentBuilder";
import { ChapterBuilder } from "../../compiler/ChapterBuilder";
import { PackageAssembler } from "../../compiler/PackageAssembler";
import { QuizGenerator } from "../../ai/QuizGenerator";

// Load environment variables
dotenv.config();

/**
 * Yargs module for AI-powered Interactive Book content type.
 * Handles YAML input with AI-generated content (text and quizzes).
 *
 * This module uses the template-free H5P compiler infrastructure:
 * - YamlInputParser: Parse YAML book definitions
 * - LibraryRegistry: Fetch and cache H5P libraries
 * - ContentBuilder: Build content programmatically
 * - PackageAssembler: Generate .h5p packages without templates
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

      // Step 2: Fetch H5P libraries
      if (verbose) console.log("Step 2: Fetching H5P libraries...");
      const registry = new LibraryRegistry();

      await registry.fetchLibrary("H5P.InteractiveBook");
      let dependencies = await registry.resolveDependencies("H5P.InteractiveBook");

      if (verbose) {
        console.log(`  - Base libraries: ${dependencies.length}`);
      }

      // Step 3: Check for quiz content and fetch H5P.MultiChoice if needed
      const hasQuiz = bookDef.chapters.some(chapter =>
        chapter.content.some(item => item.type === "ai-quiz")
      );

      if (hasQuiz) {
        if (verbose) {
          console.log("Step 3: Detected AI quiz content, fetching H5P.MultiChoice...");
        }

        await registry.fetchLibrary("H5P.MultiChoice");
        const quizDeps = await registry.resolveDependencies("H5P.MultiChoice");

        // Merge dependencies (avoid duplicates)
        const allDeps = new Map<string, any>();
        [...dependencies, ...quizDeps].forEach(dep => {
          const key = `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`;
          allDeps.set(key, dep);
        });
        dependencies = Array.from(allDeps.values());

        if (verbose) {
          console.log(`  - Total libraries with quiz support: ${dependencies.length}`);
          console.log();
        }
      } else if (verbose) {
        console.log("Step 3: No quiz content detected, skipping H5P.MultiChoice");
        console.log();
      }

      // Step 4: Initialize AI components
      if (verbose) console.log("Step 4: Initializing AI components...");
      const quizGenerator = new QuizGenerator();

      if (verbose) {
        const provider = process.env.GOOGLE_API_KEY ? "Google Gemini 2.5 Flash" : "Anthropic Claude Sonnet 4";
        console.log(`  - AI Provider: ${provider}`);
        console.log();
      }

      // Step 5: Build content
      if (verbose) console.log("Step 5: Building Interactive Book content...");
      const validator = new SemanticValidator();
      const builder = new ContentBuilder(registry, validator);

      builder.createBook(bookDef.title, bookDef.language);
      if (verbose) console.log(`  - Created book: "${bookDef.title}"`);

      // Process each chapter
      for (let i = 0; i < bookDef.chapters.length; i++) {
        const chapter = bookDef.chapters[i];
        if (verbose) console.log(`  - Processing chapter ${i + 1}: "${chapter.title}"`);

        const chapterBuilder = builder.addChapter(chapter.title);

        // Process each content item in the chapter
        for (const item of chapter.content) {
          await this.processContentItem(item, chapterBuilder, quizGenerator, verbose);
        }
      }

      if (verbose) console.log();

      // Step 6: Assemble package
      if (verbose) console.log("Step 6: Assembling .h5p package...");
      const assembler = new PackageAssembler();
      const content = builder.build();
      const mediaFiles = builder.getMediaFiles();

      if (verbose) {
        console.log(`  - Content sections: ${content.chapters.length}`);
        console.log(`  - Media files: ${mediaFiles.length}`);
      }

      const packageZip = await assembler.assemble(
        content,
        dependencies,
        mediaFiles,
        builder.getTitle(),
        builder.getLanguage(),
        registry
      );

      if (verbose) console.log("  - Package assembled successfully");

      // Step 7: Save package
      if (verbose) console.log("Step 7: Saving package to disk...");
      const outputPath = path.resolve(outputFile);
      await assembler.savePackage(packageZip, outputPath);

      console.log();
      console.log("✅ Success!");
      console.log(`📦 Generated: ${outputPath}`);
      console.log(`   - Title: ${bookDef.title}`);
      console.log(`   - Chapters: ${bookDef.chapters.length}`);
      console.log(`   - Libraries: ${dependencies.length}`);
      console.log(`   - Media files: ${mediaFiles.length}`);
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

  /**
   * Process a single content item and add it to the chapter builder.
   * Handles: text, ai-text, image, audio, ai-quiz
   */
  private async processContentItem(
    item: AnyContentItem,
    chapterBuilder: ChapterBuilder,
    quizGenerator: QuizGenerator,
    verbose: boolean
  ): Promise<void> {
    switch (item.type) {
      case "text":
        if (verbose) console.log(`    - Adding text page: "${item.title || 'Untitled'}"`);
        chapterBuilder.addTextPage(item.title || "", item.text);
        break;

      case "ai-text":
        if (verbose) {
          console.log(`    - Generating AI text: "${item.title || 'Untitled'}"`);
          console.log(`      Prompt: "${item.prompt.substring(0, 60)}..."`);
        }

        try {
          let generatedText = "";

          // Use Gemini if available, otherwise Claude
          if (process.env.GOOGLE_API_KEY) {
            if (verbose) console.log(`      Using Gemini 2.5 Flash`);
            const { GoogleGenerativeAI } = await import("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(item.prompt);
            generatedText = result.response.text();
          } else if (process.env.ANTHROPIC_API_KEY) {
            if (verbose) console.log(`      Using Claude Sonnet 4`);
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
          if (verbose) console.log(`      Generated ${generatedText.length} characters`);
        } catch (error) {
          console.warn(`      AI generation failed: ${error}`);
          chapterBuilder.addTextPage(
            item.title || "Content",
            `AI text generation failed. Please check your API key configuration.\n\nPrompt was: ${item.prompt}`
          );
        }
        break;

      case "image":
        if (verbose) {
          console.log(`    - Adding image: "${item.title || item.alt}"`);
          console.log(`      Path: ${item.path}`);
        }
        await chapterBuilder.addImagePage(item.title || item.alt, item.path, item.alt);
        break;

      case "audio":
        if (verbose) {
          console.log(`    - Adding audio: "${item.title || 'Audio'}"`);
          console.log(`      Path: ${item.path}`);
        }
        await chapterBuilder.addAudioPage(item.title || "Audio", item.path);
        break;

      case "ai-quiz":
        if (verbose) {
          console.log(`    - Generating AI quiz: "${item.title || 'Quiz'}"`);
          console.log(`      Source text length: ${item.sourceText.length} characters`);
          console.log(`      Questions: ${item.questionCount || 5}`);
        }

        try {
          const quizContent = await quizGenerator.generateH5pQuiz(
            item.sourceText,
            item.questionCount || 5
          );
          chapterBuilder.addQuizPage(quizContent);
          if (verbose) console.log(`      Generated ${quizContent.length} questions`);
        } catch (error) {
          console.warn(`      AI quiz generation failed: ${error}`);
          // Add a text page explaining the failure instead
          chapterBuilder.addTextPage(
            item.title || "Quiz",
            `Quiz generation failed. Please ensure your AI API key is valid.\n\nError: ${error}`
          );
        }
        break;

      default:
        console.warn(`    - Unknown content type: ${(item as any).type}`);
    }
  }
}
