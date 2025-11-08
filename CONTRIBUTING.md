# Contributing to h5p-cli-creator

Thank you for your interest in contributing to h5p-cli-creator! This document provides guidelines for contributing new content type handlers, bug fixes, and improvements.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Creating a New Handler](#creating-a-new-handler)
- [Testing Requirements](#testing-requirements)
- [Code Style Guidelines](#code-style-guidelines)
- [Pull Request Process](#pull-request-process)
- [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Git installed
- Familiarity with TypeScript
- Basic understanding of H5P content types

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
```bash
git clone https://github.com/YOUR_USERNAME/h5p-cli-creator.git
cd h5p-cli-creator
```

3. Add upstream remote:
```bash
git remote add upstream https://github.com/sr258/h5p-cli-creator.git
```

4. Install dependencies:
```bash
npm install
```

5. Build the project:
```bash
npm run build
```

### Running Tests

Run all tests:
```bash
npm test
```

Run specific test file:
```bash
npm test -- tests/handlers/core/TextHandler.test.ts
```

Run tests in watch mode:
```bash
npm test -- --watch
```

## Development Workflow

### Create a Feature Branch

Always create a new branch for your work:

```bash
git checkout -b feature/my-new-handler
```

Branch naming conventions:
- `feature/handler-name` - New content type handlers
- `fix/issue-description` - Bug fixes
- `docs/topic` - Documentation updates
- `refactor/component-name` - Code refactoring

### Make Changes

1. Write tests first (test-driven development)
2. Implement your feature or fix
3. Ensure all tests pass
4. Update documentation

### Commit Your Changes

Follow conventional commit messages:

```bash
git commit -m "feat: add VideoHandler for H5P.Video content type"
git commit -m "fix: handle missing alt text in ImageHandler"
git commit -m "docs: update handler development guide"
```

Commit message format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Adding or updating tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### Push to Your Fork

```bash
git push origin feature/my-new-handler
```

## Creating a New Handler

Follow this step-by-step process to create a new content type handler.

### Step 1: Research the H5P Content Type

1. Create sample content manually in the H5P editor
2. Download the .h5p file
3. Unzip and examine `content/content.json`
4. Study the structure and required fields

### Step 2: Write Tests First

Create a test file in `tests/handlers/your-category/YourHandler.test.ts`:

```typescript
import { YourHandler } from "../../../src/handlers/your-category/YourHandler";
import { HandlerContext } from "../../../src/handlers/HandlerContext";

describe("YourHandler", () => {
  let handler: YourHandler;
  let mockContext: HandlerContext;
  let mockChapterBuilder: any;

  beforeEach(() => {
    handler = new YourHandler();

    mockChapterBuilder = {
      addCustomContent: jest.fn()
    };

    mockContext = {
      chapterBuilder: mockChapterBuilder,
      libraryRegistry: {} as any,
      quizGenerator: {} as any,
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      mediaFiles: [],
      basePath: "/test",
      options: { verbose: false }
    };
  });

  test("should return correct content type", () => {
    expect(handler.getContentType()).toBe("your-type");
  });

  test("should validate valid content", () => {
    const item = {
      type: "your-type",
      requiredField: "value"
    };

    const result = handler.validate(item);
    expect(result.valid).toBe(true);
  });

  test("should reject invalid content", () => {
    const item = {
      type: "your-type"
      // Missing required field
    };

    const result = handler.validate(item);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("requiredField");
  });

  test("should process content correctly", async () => {
    const item = {
      type: "your-type",
      requiredField: "value"
    };

    await handler.process(mockContext, item);

    expect(mockChapterBuilder.addCustomContent).toHaveBeenCalled();
  });

  test("should declare required libraries", () => {
    const libs = handler.getRequiredLibraries();
    expect(libs).toContain("H5P.YourLibrary");
  });
});
```

### Step 3: Create the Handler Class

Create `src/handlers/your-category/YourHandler.ts`:

```typescript
import { ContentHandler } from "../ContentHandler";
import { HandlerContext } from "../HandlerContext";

/**
 * Your content type interface
 */
export interface YourContent {
  type: "your-type";
  requiredField: string;
  optionalField?: string;
}

/**
 * Handler for H5P.YourLibrary content type
 */
export class YourHandler implements ContentHandler {
  public getContentType(): string {
    return "your-type";
  }

  public validate(item: any): { valid: boolean; error?: string } {
    if (!item.requiredField) {
      return {
        valid: false,
        error: "Missing required field 'requiredField'"
      };
    }
    return { valid: true };
  }

  public async process(context: HandlerContext, item: YourContent): Promise<void> {
    const { chapterBuilder, logger, options } = context;

    if (options.verbose) {
      logger.log(`    - Adding your-type content: "${item.requiredField}"`);
    }

    // Build H5P content structure
    const h5pContent = {
      library: "H5P.YourLibrary 1.0",
      params: {
        // Map your content to H5P structure
        field: item.requiredField
      },
      metadata: {
        title: item.requiredField
      }
    };

    // Add to chapter
    chapterBuilder.addCustomContent(h5pContent);
  }

  public getRequiredLibraries(): string[] {
    return ["H5P.YourLibrary"];
  }
}
```

### Step 4: Register the Handler

Add your handler to `src/modules/ai/interactive-book-ai-module.ts`:

```typescript
import { YourHandler } from "../../handlers/your-category/YourHandler";

// In the runInteractiveBookAI method:
handlerRegistry.register(new YourHandler());
```

### Step 5: Update TypeScript Types

Add your content type to `src/compiler/YamlInputParser.ts`:

```typescript
export type ContentType = "text" | "image" | "audio" | "your-type" | ...;

export interface YourTypeContent extends ContentItem {
  type: "your-type";
  requiredField: string;
  optionalField?: string;
}

export type AnyContentItem =
  | TextContent
  | ImageContent
  | YourTypeContent
  | ...;
```

### Step 6: Add Documentation

Update the following files:

1. **README.md** - Add your content type to the supported types list
2. **docs/Handler_Development_Guide.md** - Add an example using your handler
3. **examples/** - Create a YAML example demonstrating your handler

### Step 7: Test Your Handler

1. Run your handler tests:
```bash
npm test -- tests/handlers/your-category/YourHandler.test.ts
```

2. Create a test YAML file in `examples/`:
```yaml
title: "Test Your Handler"
language: "en"
chapters:
  - title: "Chapter 1"
    content:
      - type: your-type
        requiredField: "test value"
```

3. Generate an .h5p file:
```bash
npm run build
node ./dist/index.js interactivebook-ai ./examples/your-test.yaml ./test-output.h5p --verbose
```

4. Upload to h5p.com or your H5P platform to verify it works

## Testing Requirements

All contributions must include tests. Aim for:

- **Unit tests**: Test handler methods in isolation
- **Integration tests**: Test handler with real ContentBuilder
- **Edge cases**: Test validation, error handling, missing fields

### Test Coverage Goals

- New handlers: 80%+ coverage
- Bug fixes: Add test that reproduces the bug, then fix it
- Refactoring: Maintain or improve existing coverage

### Running Coverage Report

```bash
npm test -- --coverage
```

## Code Style Guidelines

### TypeScript Conventions

1. **Use explicit types** - Avoid `any` when possible
```typescript
// Good
public validate(item: YourContent): ValidationResult

// Avoid
public validate(item: any): any
```

2. **Follow existing naming conventions**
   - Classes that represent H5P types: Start with `H5p` (e.g., `H5pImage`)
   - Handler classes: End with `Handler` (e.g., `TextHandler`)
   - Interfaces: Use descriptive names (e.g., `HandlerContext`)

3. **Document public methods**
```typescript
/**
 * Validates content item structure
 * @param item Content item to validate
 * @returns Validation result with error message if invalid
 */
public validate(item: any): { valid: boolean; error?: string }
```

### File Organization

```
src/
├── handlers/
│   ├── core/           # Basic content types (text, image, audio)
│   ├── ai/             # AI-powered types (quiz, ai-text)
│   ├── embedded/       # Embedded H5P types (flashcards, dialogcards)
│   └── your-category/  # Your new handlers
tests/
├── handlers/
│   └── your-category/  # Tests mirror src structure
```

### Formatting

We use TypeScript's default formatting. Before committing:

```bash
npm run build
```

This will catch any TypeScript errors.

## Pull Request Process

### Before Submitting

1. ✅ All tests pass: `npm test`
2. ✅ TypeScript compiles: `npm run build`
3. ✅ Documentation updated (README, guides, examples)
4. ✅ Commits follow conventional commit format
5. ✅ Branch is up to date with upstream main

### Update Your Branch

```bash
git fetch upstream
git rebase upstream/main
```

### Submit Pull Request

1. Go to your fork on GitHub
2. Click "New Pull Request"
3. Provide a clear title and description

**Pull Request Template:**

```markdown
## Description
Brief summary of changes (1-2 sentences)

## Type of Change
- [ ] New handler (content type)
- [ ] Bug fix
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Examples added (if applicable)
- [ ] Follows code style guidelines

## Screenshots/Examples
(If applicable, add examples of generated .h5p content)
```

### Review Process

1. **Automated checks** run (tests, build)
2. **Maintainer review** - We'll review your code and provide feedback
3. **Revisions** - Address any requested changes
4. **Merge** - Once approved, we'll merge your PR

## Community Guidelines

### Be Respectful

- Be kind and constructive in code reviews
- Assume good intent
- Focus on the code, not the person

### Ask Questions

- Not sure how something works? Ask!
- Use GitHub Discussions for questions
- Check existing issues before creating new ones

### Help Others

- Review pull requests from other contributors
- Answer questions in discussions
- Share your use cases and examples

## Need Help?

- **Documentation**: Start with [Handler Development Guide](docs/Handler_Development_Guide.md)
- **Examples**: Check [examples/](examples/) directory
- **Issues**: Search [existing issues](https://github.com/sr258/h5p-cli-creator/issues)
- **Discussions**: Ask in [GitHub Discussions](https://github.com/sr258/h5p-cli-creator/discussions)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

Thank you for contributing to h5p-cli-creator! 🎉
