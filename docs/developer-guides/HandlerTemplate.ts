import { ContentHandler } from "../handlers/ContentHandler";
import { HandlerContext } from "../handlers/HandlerContext";
import { AIPromptBuilder } from "../ai/AIPromptBuilder";

/**
 * ===============================================================================
 * HANDLER TEMPLATE FOR H5P CLI CREATOR
 * ===============================================================================
 *
 * This template provides comprehensive guidance for creating new content handlers.
 * It includes patterns learned from production implementations (Accordion, Quiz, etc.)
 *
 * KEY ARCHITECTURAL DECISIONS:
 *
 * 1. **STANDALONE FIRST FOR RUNNABLE CONTENT**
 *    - If your content type can be a standalone H5P package (not just embedded):
 *      a) Create the standalone handler FIRST
 *      b) Then create the embedded version for Interactive Book
 *    - Examples of runnable content: Accordion, Quiz, Flashcards, Dialog Cards
 *    - Examples of embedded-only: Text, Image, Audio (can't run standalone)
 *
 * 2. **YAML/JSON OVER CSV**
 *    - This project is designed for SvelteKit frontend integration
 *    - All new handlers should be designed for YAML/JSON input
 *    - CSV modules are legacy and should not be used for new content types
 *
 * 3. **HANDLER ORGANIZATION**
 *    - Core handlers (text, image, audio): src/handlers/core/
 *    - AI handlers (ai-text, ai-quiz, ai-accordion): src/handlers/ai/
 *    - Embedded handlers (dialogcards, accordion): src/handlers/embedded/
 *
 * 4. **AI INTEGRATION PATTERN**
 *    - Use AIPromptBuilder.resolveConfig() for hierarchical config
 *    - Use AIPromptBuilder.buildSystemPrompt() for formatting instructions
 *    - Keep user prompts focused on content requirements
 *    - Add HTML stripping as safety net
 *
 * 5. **CONTENT STRUCTURE vs AI BEHAVIOR**
 *    - Content structure parameters (e.g., "style", "hTag") are separate from aiConfig
 *    - aiConfig controls AI behavior (reading level, tone, customization)
 *    - Content structure parameters will be configurable in SvelteKit UI dropdowns
 *
 * ===============================================================================
 */

/**
 * TODO: Define your content type interface
 *
 * This interface describes the structure of your content items
 * in the YAML/JSON input.
 *
 * IMPORTANT CONSIDERATIONS:
 * - Include the "type" field matching your content type identifier
 * - Mark optional fields with "?"
 * - For AI handlers, include optional "aiConfig" for Universal AI Configuration
 * - For content structure options, add parameters like "style", "hTag", etc.
 *
 * Example for manual content:
 * export interface AccordionContent {
 *   type: "accordion";
 *   title?: string;
 *   panels: Array<{
 *     title: string;
 *     content: string;
 *   }>;
 *   hTag?: "h2" | "h3" | "h4";  // Content structure parameter
 * }
 *
 * Example for AI-generated content:
 * export interface AIAccordionContent {
 *   type: "ai-accordion";
 *   title?: string;
 *   prompt: string;
 *   panelCount?: number;
 *   style?: "faq" | "glossary" | "general";  // Content structure parameter
 *   aiConfig?: {
 *     targetAudience?: string;
 *     tone?: string;
 *     customization?: string;
 *   };
 * }
 */
export interface TemplateContent {
  type: "template";  // TODO: Replace with your content type identifier
  // TODO: Add required fields
  requiredField: string;
  // TODO: Add optional fields
  optionalField?: string;
}

/**
 * TODO: Handler for H5P.YourLibrary content type
 *
 * Replace "Template" with your handler name and update the description.
 *
 * This handler processes [CONTENT_TYPE_NAME] content items and generates
 * H5P.[LIBRARY_NAME] sub-content for Interactive Books.
 *
 * IMPLEMENTATION CHECKLIST:
 *
 * FOR RUNNABLE CONTENT (can be standalone H5P):
 * [ ] 1. Create standalone handler first (if not embedded-only)
 * [ ] 2. Then create embedded version for Interactive Book
 * [ ] 3. Consider if AI-generated version is needed
 *
 * FOR ALL HANDLERS:
 * [ ] Define TypeScript interface with all fields
 * [ ] Implement getContentType() returning unique identifier
 * [ ] Implement comprehensive validation in validate()
 * [ ] Implement processing logic in process()
 * [ ] Declare required H5P libraries in getRequiredLibraries()
 * [ ] Add to YamlInputParser ContentType union
 * [ ] Export interface from YamlInputParser
 * [ ] Add to AnyContentItem union in YamlInputParser
 * [ ] Register handler in InteractiveBookAIModule
 * [ ] Create unit tests with 100% coverage
 * [ ] Test in comprehensive-demo.yaml
 * [ ] Update README.md with example
 *
 * Example usage in YAML:
 * ```yaml
 * - type: template
 *   requiredField: "value"
 *   optionalField: "optional value"
 * ```
 */
export class TemplateHandler implements ContentHandler {
  /**
   * Returns the unique content type identifier
   *
   * TODO: Replace "template" with your content type identifier.
   * This must match the `type` field in your content interface.
   *
   * @returns Content type string (e.g., "video", "timeline", "accordion")
   */
  public getContentType(): string {
    return "template";  // TODO: Replace with your content type
  }

  /**
   * Validates the content item structure
   *
   * TODO: Add validation logic for your required and optional fields.
   * Check for:
   * - Required fields are present
   * - Field types are correct (string, number, array, etc.)
   * - Valid value ranges (if applicable)
   * - File path existence (if applicable)
   * - Array lengths (if applicable)
   * - Enum values (if applicable)
   *
   * BEST PRACTICES:
   * - Validate ALL required fields
   * - Check types explicitly (typeof, Array.isArray)
   * - Provide clear, actionable error messages
   * - Validate nested structures (arrays, objects)
   * - Check for empty arrays if they shouldn't be empty
   *
   * @param item Content item to validate
   * @returns Validation result with error message if invalid
   */
  public validate(item: any): { valid: boolean; error?: string } {
    // TODO: Add validation for required fields
    if (!item.requiredField) {
      return {
        valid: false,
        error: "Missing required field 'requiredField'. Please provide a value."
      };
    }

    // TODO: Add type checking if needed
    if (typeof item.requiredField !== "string") {
      return {
        valid: false,
        error: "Field 'requiredField' must be a string"
      };
    }

    // TODO: Add validation for arrays
    // Example from AccordionHandler:
    // if (!Array.isArray(item.panels)) {
    //   return { valid: false, error: "Accordion requires 'panels' array" };
    // }
    // if (item.panels.length === 0) {
    //   return { valid: false, error: "Accordion must have at least one panel" };
    // }

    // TODO: Add validation for enum values
    // Example from AccordionHandler:
    // if (item.hTag && !["h2", "h3", "h4"].includes(item.hTag)) {
    //   return { valid: false, error: "hTag must be one of: h2, h3, h4" };
    // }

    // TODO: Add any additional validation (e.g., field length, valid URLs, etc.)

    return { valid: true };
  }

  /**
   * Processes the content item and adds it to the chapter
   *
   * TODO: Implement content processing logic.
   * Steps:
   * 1. Extract data from the item
   * 2. Build H5P content structure (see content/content.json from sample .h5p)
   * 3. Add to chapter using chapterBuilder methods
   *
   * Available chapterBuilder methods:
   * - addTextPage(title, text) - For simple text
   * - addImagePage(title, path, alt) - For images
   * - addAudioPage(title, path) - For audio
   * - addQuizPage(quizContent) - For quizzes
   * - addCustomContent(h5pContent) - For complex H5P structures
   *
   * BEST PRACTICES:
   * - Use verbose logging to help users debug
   * - Handle errors gracefully with try/catch
   * - Use escapeHtml() for user-provided text content
   * - Generate unique subContentIds for nested content
   * - Provide fallback behavior for AI generation failures
   *
   * @param context Handler execution context with utilities
   * @param item Content item to process
   */
  public async process(context: HandlerContext, item: TemplateContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    // TODO: Add verbose logging if enabled
    if (options.verbose) {
      logger.log(`    - Adding template content: "${item.requiredField}"`);
    }

    // TODO: Build H5P content structure
    // Reference: Study content/content.json from a sample .h5p file to understand the structure
    const h5pContent = {
      library: "H5P.YourLibrary 1.0",  // TODO: Replace with actual library name and version
      params: {
        // TODO: Map your content fields to H5P structure
        // Example:
        // text: item.requiredField,
        // options: {
        //   setting1: true,
        //   setting2: item.optionalField || "default"
        // }
      },
      metadata: {
        title: item.requiredField,  // TODO: Use appropriate title field
        license: "U",
        contentType: "YourContentType"  // TODO: Replace with H5P content type name
      },
      subContentId: this.generateSubContentId()
    };

    // TODO: Choose appropriate chapterBuilder method
    // For complex H5P types, use addCustomContent():
    chapterBuilder.addCustomContent(h5pContent);

    // For simple text, use addTextPage():
    // chapterBuilder.addTextPage(item.title || "", item.requiredField);

    // For images, use addImagePage():
    // chapterBuilder.addImagePage(item.title || "", item.imagePath, item.alt);
  }

  /**
   * Returns the list of H5P libraries required by this handler
   *
   * TODO: Replace with your H5P library name(s).
   * The compiler uses this to:
   * 1. Fetch libraries from the H5P Hub
   * 2. Resolve dependencies automatically
   * 3. Bundle libraries into the .h5p package
   *
   * Library name format: "H5P.LibraryName" (without version)
   * Example: ["H5P.Video", "H5P.Audio"]
   *
   * IMPORTANT: Include ALL libraries your handler uses:
   * - Main library (e.g., "H5P.Accordion")
   * - Nested libraries (e.g., "H5P.AdvancedText" for accordion panels)
   *
   * The LibraryRegistry will automatically resolve transitive dependencies.
   *
   * @returns Array of H5P library identifiers
   */
  public getRequiredLibraries(): string[] {
    return [
      "H5P.YourLibrary"  // TODO: Replace with actual H5P library name
    ];
  }

  /**
   * Generates a unique sub-content ID for H5P content
   * @private
   */
  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Escapes HTML special characters to prevent XSS
   * Use this for any user-provided text content
   * @private
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return text.replace(/[&<>\"']/g, m => map[m]);
  }
}

/**
 * ===============================================================================
 * AI HANDLER TEMPLATE
 * ===============================================================================
 *
 * Use this template for AI-powered content generation handlers.
 *
 * CRITICAL PATTERNS:
 *
 * 1. **AIPromptBuilder Integration**
 *    - Use AIPromptBuilder.resolveConfig() to merge config hierarchy
 *    - Use AIPromptBuilder.buildSystemPrompt() for formatting instructions
 *    - System prompt handles reading level, tone, and output format
 *    - User prompt focuses on content requirements
 *
 * 2. **QuizGenerator.generateRawContent()**
 *    - Public method for generating custom AI content
 *    - Takes systemPrompt and userPrompt as parameters
 *    - Returns raw AI response as string
 *    - Handles both Anthropic and Google providers
 *
 * 3. **HTML Safety Net**
 *    - AI responses may contain HTML despite system prompt
 *    - Always strip HTML tags before wrapping in proper tags
 *    - Use regex to remove <p>, <br>, and other tags
 *
 * 4. **Fallback Behavior**
 *    - Always provide fallback content if AI generation fails
 *    - Log warnings with try/catch, don't crash the build
 *    - Fallback should be minimal but functional
 *
 * 5. **Style Parameters**
 *    - Content structure parameters (style, format) are separate from aiConfig
 *    - Use style to customize system prompt instructions
 *    - Example: "faq" style → "Generate question-and-answer pairs"
 *
 * Example implementation from AIAccordionHandler:
 */

export interface AITemplateContent {
  type: "ai-template";
  prompt: string;
  title?: string;
  // TODO: Add content structure parameters
  style?: "option1" | "option2" | "option3";
  // TODO: Add AI configuration (Universal AI Configuration)
  aiConfig?: {
    targetAudience?: string;
    tone?: string;
    customization?: string;
  };
}

export class AITemplateHandler implements ContentHandler {
  public getContentType(): string {
    return "ai-template";
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.prompt || typeof item.prompt !== "string") {
      return {
        valid: false,
        error: "AI template requires 'prompt' field (string)"
      };
    }

    // TODO: Validate style parameter if present
    // if (item.style && !["option1", "option2", "option3"].includes(item.style)) {
    //   return { valid: false, error: "style must be one of: option1, option2, option3" };
    // }

    return { valid: true };
  }

  public async process(context: HandlerContext, item: AITemplateContent): Promise<void> {
    const { chapterBuilder, quizGenerator, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Generating AI content: "${item.title || 'Untitled'}"`);
    }

    try {
      // CRITICAL: Use AIPromptBuilder for config resolution and system prompt
      const resolvedConfig = AIPromptBuilder.resolveConfig(
        item.aiConfig as any,
        context.chapterConfig,
        context.bookConfig
      );
      const systemPrompt = AIPromptBuilder.buildSystemPrompt(resolvedConfig);

      // Build user prompt with style-specific instructions
      let styleInstructions = "";
      if (item.style === "option1") {
        styleInstructions = "Focus on X...";
      } else if (item.style === "option2") {
        styleInstructions = "Focus on Y...";
      } else {
        styleInstructions = "Focus on Z...";
      }

      const userPrompt = `${item.prompt}\n\n${styleInstructions}`;

      // Generate content using QuizGenerator.generateRawContent()
      const response = await quizGenerator.generateRawContent(systemPrompt, userPrompt);

      // Parse JSON response (strip code fences if present)
      const cleaned = response.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      const generatedData = JSON.parse(cleaned);

      // CRITICAL: Strip HTML as safety net
      const cleanedContent = this.stripHtml(generatedData.content);

      // Build H5P structure
      const h5pContent = {
        library: "H5P.YourLibrary 1.0",
        params: {
          // Map generated data to H5P structure
          content: `<p>${this.escapeHtml(cleanedContent)}</p>`
        },
        metadata: {
          title: item.title || "AI Generated Content",
          license: "U",
          contentType: "YourContentType"
        },
        subContentId: this.generateSubContentId()
      };

      chapterBuilder.addCustomContent(h5pContent);

      if (options.verbose) {
        logger.log(`      AI generation successful`);
      }
    } catch (error) {
      logger.warn(`      AI generation failed: ${error}`);

      // Provide fallback content
      const fallbackContent = this.getFallbackContent(item.prompt);
      chapterBuilder.addCustomContent(fallbackContent);
    }
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.YourLibrary"];
  }

  /**
   * Strips HTML tags from AI-generated content
   * Use this as safety net before wrapping in proper HTML tags
   */
  private stripHtml(text: string): string {
    return text
      .replace(/<\/?p>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  /**
   * Provides fallback content when AI generation fails
   */
  private getFallbackContent(prompt: string): any {
    return {
      library: "H5P.AdvancedText 1.1",
      params: {
        text: `<p>AI generation failed for: ${this.escapeHtml(prompt)}</p>`
      },
      metadata: {
        title: "Fallback Content",
        license: "U",
        contentType: "Text"
      },
      subContentId: this.generateSubContentId()
    };
  }

  private generateSubContentId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return text.replace(/[&<>\"']/g, m => map[m]);
  }
}

/**
 * ===============================================================================
 * TESTING YOUR HANDLER
 * ===============================================================================
 *
 * Create a test file at: tests/unit/handlers/[category]/TemplateHandler.test.ts
 *
 * COMPREHENSIVE TEST CHECKLIST:
 * [ ] getContentType() returns correct identifier
 * [ ] validate() accepts valid content
 * [ ] validate() rejects missing required fields
 * [ ] validate() rejects invalid field types
 * [ ] validate() rejects invalid enum values
 * [ ] validate() rejects empty arrays (if applicable)
 * [ ] process() calls chapterBuilder methods correctly
 * [ ] process() logs when verbose is enabled
 * [ ] process() doesn't log when verbose is disabled
 * [ ] getRequiredLibraries() returns correct libraries
 * [ ] AI generation succeeds with valid input (AI handlers)
 * [ ] AI generation uses fallback on failure (AI handlers)
 * [ ] HTML is properly escaped in output
 * [ ] Nested content structures are built correctly
 *
 * Example test structure:
 * ```typescript
 * import { TemplateHandler } from "../../../../src/handlers/your-category/TemplateHandler";
 * import { HandlerContext } from "../../../../src/handlers/HandlerContext";
 *
 * describe("TemplateHandler", () => {
 *   let handler: TemplateHandler;
 *   let mockContext: HandlerContext;
 *   let mockChapterBuilder: any;
 *   let mockLogger: any;
 *
 *   beforeEach(() => {
 *     handler = new TemplateHandler();
 *     mockChapterBuilder = {
 *       addCustomContent: jest.fn(),
 *       addTextPage: jest.fn()
 *     };
 *     mockLogger = {
 *       log: jest.fn(),
 *       warn: jest.fn(),
 *       error: jest.fn()
 *     };
 *     mockContext = {
 *       chapterBuilder: mockChapterBuilder,
 *       logger: mockLogger,
 *       options: { verbose: false }
 *     } as any;
 *   });
 *
 *   describe("getContentType", () => {
 *     it("should return 'template'", () => {
 *       expect(handler.getContentType()).toBe("template");
 *     });
 *   });
 *
 *   describe("validate", () => {
 *     it("should accept valid content", () => {
 *       const item = { type: "template", requiredField: "value" };
 *       expect(handler.validate(item).valid).toBe(true);
 *     });
 *
 *     it("should reject missing required field", () => {
 *       const item = { type: "template" };
 *       const result = handler.validate(item);
 *       expect(result.valid).toBe(false);
 *       expect(result.error).toContain("requiredField");
 *     });
 *   });
 *
 *   describe("process", () => {
 *     it("should add content to chapter", async () => {
 *       const item = { type: "template", requiredField: "value" };
 *       await handler.process(mockContext, item);
 *       expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
 *     });
 *
 *     it("should log when verbose is enabled", async () => {
 *       mockContext.options.verbose = true;
 *       const item = { type: "template", requiredField: "value" };
 *       await handler.process(mockContext, item);
 *       expect(mockLogger.log).toHaveBeenCalled();
 *     });
 *   });
 *
 *   describe("getRequiredLibraries", () => {
 *     it("should return correct libraries", () => {
 *       expect(handler.getRequiredLibraries()).toEqual(["H5P.YourLibrary"]);
 *     });
 *   });
 * });
 * ```
 */

/**
 * ===============================================================================
 * REGISTERING YOUR HANDLER
 * ===============================================================================
 *
 * Add to src/modules/ai/interactive-book-ai-module.ts:
 *
 * ```typescript
 * import { TemplateHandler } from "../../handlers/your-category/TemplateHandler";
 * import { AITemplateHandler } from "../../handlers/ai/AITemplateHandler";
 *
 * // In runInteractiveBookAI method:
 * handlerRegistry.register(new TemplateHandler());
 * handlerRegistry.register(new AITemplateHandler());
 * ```
 *
 * REGISTRATION ORDER (for consistency):
 * 1. Core handlers (text, image, audio)
 * 2. AI handlers (ai-text, ai-quiz, ai-accordion, ai-template)
 * 3. Embedded handlers (dialogcards, accordion, template)
 */

/**
 * ===============================================================================
 * UPDATING TYPESCRIPT TYPES
 * ===============================================================================
 *
 * Add to src/compiler/YamlInputParser.ts:
 *
 * 1. Add to ContentType union:
 *    ```typescript
 *    export type ContentType = "text" | "image" | "template" | "ai-template" | ...;
 *    ```
 *
 * 2. Export your interfaces:
 *    ```typescript
 *    export { TemplateContent } from "../handlers/your-category/TemplateHandler";
 *    export { AITemplateContent } from "../handlers/ai/AITemplateHandler";
 *    ```
 *
 * 3. Add to AnyContentItem union:
 *    ```typescript
 *    export type AnyContentItem =
 *      | TextContent
 *      | ImageContent
 *      | import("../handlers/your-category/TemplateHandler").TemplateContent
 *      | import("../handlers/ai/AITemplateHandler").AITemplateContent
 *      | ...;
 *    ```
 *
 * 4. Add validation cases in validateContentItem():
 *    ```typescript
 *    case "template":
 *      if (!item.requiredField || typeof item.requiredField !== "string") {
 *        throw new Error(`${prefix} (template) must have a 'requiredField' field (string)`);
 *      }
 *      break;
 *
 *    case "ai-template":
 *      if (!item.prompt || typeof item.prompt !== "string") {
 *        throw new Error(`${prefix} (ai-template) must have a 'prompt' field (string)`);
 *      }
 *      break;
 *    ```
 */

/**
 * ===============================================================================
 * DOCUMENTATION
 * ===============================================================================
 *
 * 1. Update README.md:
 *    - Add to "Supported Content Types" table
 *    - Add example YAML showing usage
 *    - Describe content type capabilities
 *
 * 2. Create example YAML file in examples/yaml/:
 *    examples/yaml/template-example.yaml
 *
 * 3. Add to comprehensive-demo.yaml for testing:
 *    ```yaml
 *    - type: template
 *      requiredField: "example value"
 *      optionalField: "optional"
 *
 *    - type: ai-template
 *      prompt: "Generate content about X"
 *      style: "option1"
 *      aiConfig:
 *        targetAudience: "grade-6"
 *        tone: "educational"
 *    ```
 *
 * 4. Update docs/developer-guides/Handler_Development_Guide.md:
 *    - Add your handler as an example (optional)
 */

/**
 * ===============================================================================
 * MANUAL TESTING
 * ===============================================================================
 *
 * 1. Build the project:
 *    ```bash
 *    npm run build
 *    ```
 *
 * 2. Create a test YAML file:
 *    ```yaml
 *    title: "Test Template Handler"
 *    language: "en"
 *    chapters:
 *      - title: "Chapter 1"
 *        content:
 *          - type: template
 *            requiredField: "test value"
 *
 *          - type: ai-template
 *            prompt: "Generate test content"
 *            style: "option1"
 *            aiConfig:
 *              targetAudience: "grade-6"
 *              tone: "educational"
 *    ```
 *
 * 3. Generate .h5p package:
 *    ```bash
 *    node ./dist/index.js interactivebook-ai ./test.yaml ./output.h5p --verbose
 *    ```
 *
 * 4. Upload to h5p.com or your H5P platform to verify
 *
 * 5. TESTING CHECKLIST:
 *    [ ] Package uploads successfully without errors
 *    [ ] Content displays correctly in Interactive Book
 *    [ ] Interactive elements work as expected
 *    [ ] No console errors in browser
 *    [ ] AI-generated content matches expected reading level
 *    [ ] Style parameters produce different output
 *    [ ] Fallback works when AI generation fails
 *    [ ] Media files (if any) load correctly
 *    [ ] Nested content structures render properly
 */

/**
 * ===============================================================================
 * TROUBLESHOOTING COMMON ISSUES
 * ===============================================================================
 *
 * 1. **"Property does not exist on type 'AIPromptBuilder'"**
 *    - AIPromptBuilder methods are STATIC
 *    - Use: AIPromptBuilder.resolveConfig() NOT aiPromptBuilder.resolveConfig()
 *
 * 2. **"AI generation not working, using fallback"**
 *    - Check if generateRawContent() is public in QuizGenerator
 *    - Verify AI API keys are set (ANTHROPIC_API_KEY or GOOGLE_API_KEY)
 *    - Check console logs for detailed error messages
 *
 * 3. **"HTML tags appearing in content"**
 *    - Add HTML stripping before wrapping in proper tags
 *    - Use stripHtml() method before escapeHtml()
 *
 * 4. **"Handler file in wrong location"**
 *    - AI handlers go in src/handlers/ai/
 *    - Embedded handlers go in src/handlers/embedded/
 *    - Core handlers go in src/handlers/core/
 *    - Check old compiled files in dist/ after moving
 *
 * 5. **"YAML parser doesn't recognize content type"**
 *    - Add to ContentType union in YamlInputParser.ts
 *    - Add to validTypes array in validateContentItem()
 *    - Add validation case for your content type
 *
 * 6. **"Missing aiPromptBuilder in HandlerContext"**
 *    - HandlerContext should include aiPromptBuilder field
 *    - H5pCompiler should create AIPromptBuilder instance
 *    - H5pCompiler should include in context creation
 */
