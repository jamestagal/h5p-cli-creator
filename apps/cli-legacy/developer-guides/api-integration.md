# API Integration Guide

## Overview

The H5P Compiler can be integrated into web applications (SvelteKit, Express, Next.js, etc.) to generate H5P packages from JSON input. This guide covers API integration patterns, TypeScript types, and AI configuration.

## Basic Integration

### Installation

```bash
npm install h5p-cli-creator
```

### TypeScript Example (SvelteKit)

```typescript
// routes/api/generate-h5p/+server.ts
import { H5pCompiler } from "h5p-cli-creator/compiler/H5pCompiler";
import { HandlerRegistry } from "h5p-cli-creator/handlers/HandlerRegistry";
import { LibraryRegistry } from "h5p-cli-creator/compiler/LibraryRegistry";
import { QuizGenerator } from "h5p-cli-creator/ai/QuizGenerator";
import type { BookDefinition } from "h5p-cli-creator/compiler/types";

export async function POST({ request }) {
  const bookDefinition: BookDefinition = await request.json();

  // Initialize dependencies
  const handlerRegistry = new HandlerRegistry();
  const libraryRegistry = new LibraryRegistry();
  const quizGenerator = new QuizGenerator();

  // Create compiler instance
  const compiler = new H5pCompiler(
    handlerRegistry,
    libraryRegistry,
    quizGenerator
  );

  // Generate H5P package
  const h5pBuffer = await compiler.compile(bookDefinition, {
    verbose: true,
    aiProvider: "auto"
  });

  // Return as downloadable file
  return new Response(h5pBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bookDefinition.title}.h5p"`
    }
  });
}
```

## AI Configuration in API Requests

### TypeScript Types

Import AI configuration types from the compiler:

```typescript
import type {
  BookDefinition,
  AIConfiguration,
  ReadingLevel,
  Tone
} from "h5p-cli-creator/compiler/types";
```

### Request with AI Configuration

Include `aiConfig` in your BookDefinition JSON payload:

```typescript
const bookDefinition: BookDefinition = {
  title: "Science Course",
  language: "en",
  aiConfig: {
    targetAudience: "high-school",
    tone: "educational",
    customization: "Focus on practical examples and real-world applications"
  },
  chapters: [
    {
      title: "Introduction",
      content: [
        {
          type: "ai-text",
          prompt: "Explain the scientific method",
          title: "Getting Started"
        }
      ]
    }
  ]
};

// POST to your API endpoint
const response = await fetch("/api/generate-h5p", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(bookDefinition)
});

// Download the generated .h5p file
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `${bookDefinition.title}.h5p`;
a.click();
```

### Configuration Levels

AI configuration can be specified at three levels:

**1. Book Level (applies to all content):**
```typescript
const bookDef: BookDefinition = {
  title: "My Book",
  language: "en",
  aiConfig: {
    targetAudience: "grade-6",  // Default for entire book
    tone: "educational"
  },
  chapters: [...]
};
```

**2. Chapter Level (overrides book config):**
```typescript
const bookDef: BookDefinition = {
  title: "My Book",
  language: "en",
  aiConfig: { targetAudience: "grade-6" },
  chapters: [
    {
      title: "Advanced Chapter",
      aiConfig: { targetAudience: "college" },  // Override for this chapter
      content: [...]
    }
  ]
};
```

**3. Item Level (overrides chapter and book config):**
```typescript
{
  title: "Chapter 1",
  content: [
    {
      type: "ai-text",
      prompt: "Explain the concept",
      aiConfig: {
        targetAudience: "esl-beginner",  // Override for this item
        customization: "Use only present tense"
      }
    }
  ]
}
```

## Reading Levels

Eight predefined reading levels are available:

```typescript
type ReadingLevel =
  | "elementary"       // Grades 1-5
  | "grade-6"          // Ages 11-12 (DEFAULT)
  | "grade-9"          // Ages 14-15
  | "high-school"      // Grades 10-12
  | "college"          // Undergraduate
  | "professional"     // Industry/adult learners
  | "esl-beginner"     // A1-A2 CEFR
  | "esl-intermediate"; // B1-B2 CEFR
```

**Example - ESL Content:**
```typescript
const bookDef: BookDefinition = {
  title: "English for Beginners",
  language: "en",
  aiConfig: {
    targetAudience: "esl-beginner",
    tone: "educational",
    customization: "Use only common high-frequency vocabulary. Avoid idioms."
  },
  chapters: [...]
};
```

## Tone Options

Four tone options control content style:

```typescript
type Tone =
  | "educational"   // Clear, instructional (DEFAULT)
  | "professional"  // Formal, business-like
  | "casual"        // Conversational, friendly
  | "academic";     // Scholarly, research-oriented
```

**Example - Professional Training:**
```typescript
const bookDef: BookDefinition = {
  title: "Corporate Compliance Training",
  language: "en",
  aiConfig: {
    targetAudience: "professional",
    tone: "professional",
    customization: "Focus on legal requirements and best practices. Include case studies."
  },
  chapters: [...]
};
```

## Complete Request Example

```typescript
// Type-safe request body
interface GenerateH5PRequest {
  bookDefinition: BookDefinition;
  options?: {
    verbose?: boolean;
    aiProvider?: "gemini" | "claude" | "auto";
  };
}

// Request
const request: GenerateH5PRequest = {
  bookDefinition: {
    title: "Biology Fundamentals",
    language: "en",
    description: "Introduction to cellular biology",
    aiConfig: {
      targetAudience: "grade-9",
      tone: "educational",
      customization: "Use medical examples. Include diagrams where helpful."
    },
    chapters: [
      {
        title: "Cell Structure",
        content: [
          {
            type: "ai-text",
            prompt: "Explain the parts of a cell and their functions",
            title: "Introduction to Cells"
          },
          {
            type: "image",
            path: "https://example.com/cell-diagram.jpg",
            alt: "Diagram of a typical animal cell",
            title: "Cell Structure"
          },
          {
            type: "ai-quiz",
            title: "Cell Structure Quiz",
            sourceText: "A cell has three main parts: the cell membrane, cytoplasm, and nucleus...",
            questionCount: 5
          }
        ]
      },
      {
        title: "Advanced Topics",
        aiConfig: {
          targetAudience: "college",  // Override for advanced chapter
          tone: "academic"
        },
        content: [
          {
            type: "ai-text",
            prompt: "Explain cellular respiration and the Krebs cycle",
            title: "Energy Production"
          }
        ]
      }
    ]
  },
  options: {
    verbose: true,
    aiProvider: "auto"
  }
};

// API call
const response = await fetch("/api/generate-h5p", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(request)
});
```

## Response Handling

### Success Response

```typescript
// HTTP 200 OK
// Headers:
//   Content-Type: application/zip
//   Content-Disposition: attachment; filename="Biology Fundamentals.h5p"
// Body: Binary .h5p file (ZIP format)

const blob = await response.blob();
// Download or save the .h5p file
```

### Error Responses

#### Validation Error

```typescript
// HTTP 400 Bad Request
{
  "error": "Validation failed",
  "details": [
    "Invalid targetAudience: 'advanced'. Valid options: elementary, grade-6, grade-9, high-school, college, professional, esl-beginner, esl-intermediate"
  ]
}
```

#### Missing API Key

```typescript
// HTTP 500 Internal Server Error
{
  "error": "AI generation failed",
  "details": [
    "No API key found. Set GOOGLE_API_KEY or ANTHROPIC_API_KEY environment variable"
  ]
}
```

#### Invalid Content Type

```typescript
// HTTP 400 Bad Request
{
  "error": "Invalid content type",
  "details": [
    "Content type 'unknown-type' is not supported. Valid types: text, ai-text, image, audio, ai-quiz, flashcards, dialogcards"
  ]
}
```

## Frontend UI Components

### Svelte Example - AI Config Form

```svelte
<script lang="ts">
  import type { AIConfiguration, ReadingLevel, Tone } from "h5p-cli-creator/compiler/types";

  let aiConfig: AIConfiguration = {
    targetAudience: "grade-6",
    tone: "educational",
    customization: ""
  };

  const readingLevels: ReadingLevel[] = [
    "elementary",
    "grade-6",
    "grade-9",
    "high-school",
    "college",
    "professional",
    "esl-beginner",
    "esl-intermediate"
  ];

  const tones: Tone[] = ["educational", "professional", "casual", "academic"];
</script>

<form>
  <label>
    Reading Level
    <select bind:value={aiConfig.targetAudience}>
      <option value="elementary">Elementary (Grades 1-5)</option>
      <option value="grade-6">6th Grade (Ages 11-12)</option>
      <option value="grade-9">9th Grade (Ages 14-15)</option>
      <option value="high-school">High School (Grades 10-12)</option>
      <option value="college">College</option>
      <option value="professional">Professional/Adult</option>
      <option value="esl-beginner">ESL Beginner (A1-A2)</option>
      <option value="esl-intermediate">ESL Intermediate (B1-B2)</option>
    </select>
  </label>

  <label>
    Tone
    <select bind:value={aiConfig.tone}>
      <option value="educational">Educational</option>
      <option value="professional">Professional</option>
      <option value="casual">Casual</option>
      <option value="academic">Academic</option>
    </select>
  </label>

  <label>
    Customization (Optional)
    <textarea
      bind:value={aiConfig.customization}
      placeholder="E.g., 'Focus on visual learners. Include real-world examples.'"
      rows="3"
    ></textarea>
  </label>
</form>
```

### React Example - AI Config Form

```tsx
import { useState } from "react";
import type { AIConfiguration, ReadingLevel, Tone } from "h5p-cli-creator/compiler/types";

function AIConfigForm() {
  const [aiConfig, setAIConfig] = useState<AIConfiguration>({
    targetAudience: "grade-6",
    tone: "educational",
    customization: ""
  });

  return (
    <form>
      <label>
        Reading Level
        <select
          value={aiConfig.targetAudience}
          onChange={(e) => setAIConfig({
            ...aiConfig,
            targetAudience: e.target.value as ReadingLevel
          })}
        >
          <option value="elementary">Elementary (Grades 1-5)</option>
          <option value="grade-6">6th Grade (Ages 11-12)</option>
          <option value="grade-9">9th Grade (Ages 14-15)</option>
          <option value="high-school">High School (Grades 10-12)</option>
          <option value="college">College</option>
          <option value="professional">Professional/Adult</option>
          <option value="esl-beginner">ESL Beginner (A1-A2)</option>
          <option value="esl-intermediate">ESL Intermediate (B1-B2)</option>
        </select>
      </label>

      <label>
        Tone
        <select
          value={aiConfig.tone}
          onChange={(e) => setAIConfig({
            ...aiConfig,
            tone: e.target.value as Tone
          })}
        >
          <option value="educational">Educational</option>
          <option value="professional">Professional</option>
          <option value="casual">Casual</option>
          <option value="academic">Academic</option>
        </select>
      </label>

      <label>
        Customization (Optional)
        <textarea
          value={aiConfig.customization}
          onChange={(e) => setAIConfig({
            ...aiConfig,
            customization: e.target.value
          })}
          placeholder="E.g., 'Focus on visual learners. Include real-world examples.'"
          rows={3}
        />
      </label>
    </form>
  );
}
```

## Validation

The compiler validates AI configuration at the API boundary:

```typescript
// In your API endpoint
try {
  const h5pBuffer = await compiler.compile(bookDefinition, options);
  return new Response(h5pBuffer, { ... });
} catch (error) {
  if (error.message.includes("Invalid targetAudience")) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: [error.message]
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // Other error handling...
}
```

### Client-Side Validation

```typescript
function validateAIConfig(config: AIConfiguration): string[] {
  const errors: string[] = [];

  const validLevels: ReadingLevel[] = [
    "elementary", "grade-6", "grade-9", "high-school",
    "college", "professional", "esl-beginner", "esl-intermediate"
  ];

  const validTones: Tone[] = ["educational", "professional", "casual", "academic"];

  if (config.targetAudience && !validLevels.includes(config.targetAudience)) {
    errors.push(`Invalid reading level: ${config.targetAudience}`);
  }

  if (config.tone && !validTones.includes(config.tone)) {
    errors.push(`Invalid tone: ${config.tone}`);
  }

  if (config.customization && config.customization.length > 1000) {
    errors.push("Customization text must be less than 1000 characters");
  }

  return errors;
}
```

## Environment Variables

Set AI provider API keys in your deployment environment:

```bash
# Google Gemini
GOOGLE_API_KEY=your_gemini_api_key_here

# OR Anthropic Claude
ANTHROPIC_API_KEY=your_claude_api_key_here
```

**Vercel:**
```bash
vercel env add GOOGLE_API_KEY
```

**Netlify:**
```bash
netlify env:set GOOGLE_API_KEY your_key_here
```

**Docker:**
```dockerfile
ENV GOOGLE_API_KEY=your_key_here
```

## Performance Considerations

### Caching

The compiler caches H5P library packages in `content-type-cache/`:

```typescript
// Libraries are downloaded once and reused
// Cache directory structure:
content-type-cache/
├── H5P.InteractiveBook-1.11.h5p
├── H5P.AdvancedText-1.1.h5p
└── H5P.MultiChoice-1.16.h5p
```

### AI API Rate Limits

**Google Gemini:**
- Free tier: 60 requests per minute
- Consider rate limiting your API endpoint

**Anthropic Claude:**
- Tier-based rate limits
- Implement request queuing for high traffic

### Example Rate Limiting (SvelteKit)

```typescript
import { RateLimiter } from "limiter";

const limiter = new RateLimiter({
  tokensPerInterval: 10,
  interval: "minute"
});

export async function POST({ request }) {
  // Rate limit check
  const allowed = await limiter.removeTokens(1);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      { status: 429 }
    );
  }

  // Process request...
}
```

## Complete Integration Example

```typescript
// lib/h5p-service.ts
import { H5pCompiler } from "h5p-cli-creator/compiler/H5pCompiler";
import { HandlerRegistry } from "h5p-cli-creator/handlers/HandlerRegistry";
import { LibraryRegistry } from "h5p-cli-creator/compiler/LibraryRegistry";
import { QuizGenerator } from "h5p-cli-creator/ai/QuizGenerator";
import type { BookDefinition } from "h5p-cli-creator/compiler/types";

export class H5PService {
  private compiler: H5pCompiler;

  constructor() {
    const handlerRegistry = new HandlerRegistry();
    const libraryRegistry = new LibraryRegistry();
    const quizGenerator = new QuizGenerator();

    this.compiler = new H5pCompiler(
      handlerRegistry,
      libraryRegistry,
      quizGenerator
    );
  }

  async generatePackage(bookDef: BookDefinition): Promise<Buffer> {
    // Validate AI config
    this.validateAIConfig(bookDef.aiConfig);

    // Generate package
    return await this.compiler.compile(bookDef, {
      verbose: process.env.NODE_ENV === "development",
      aiProvider: "auto"
    });
  }

  private validateAIConfig(config?: any): void {
    if (!config) return;

    const validLevels = [
      "elementary", "grade-6", "grade-9", "high-school",
      "college", "professional", "esl-beginner", "esl-intermediate"
    ];

    const validTones = ["educational", "professional", "casual", "academic"];

    if (config.targetAudience && !validLevels.includes(config.targetAudience)) {
      throw new Error(
        `Invalid targetAudience: ${config.targetAudience}. ` +
        `Valid options: ${validLevels.join(", ")}`
      );
    }

    if (config.tone && !validTones.includes(config.tone)) {
      throw new Error(
        `Invalid tone: ${config.tone}. ` +
        `Valid options: ${validTones.join(", ")}`
      );
    }
  }
}

// routes/api/generate/+server.ts
import { H5PService } from "$lib/h5p-service";
import type { RequestHandler } from "./$types";

const h5pService = new H5PService();

export const POST: RequestHandler = async ({ request }) => {
  try {
    const bookDefinition = await request.json();
    const buffer = await h5pService.generatePackage(bookDefinition);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${bookDefinition.title}.h5p"`
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        details: [error.stack]
      }),
      {
        status: error.message.includes("Invalid") ? 400 : 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
```

## TypeScript Type Definitions

Full type definitions are exported from `h5p-cli-creator/compiler/types`:

```typescript
export interface BookDefinition {
  title: string;
  language: string;
  description?: string;
  aiConfig?: AIConfiguration;
  chapters: ChapterDefinition[];
}

export interface ChapterDefinition {
  title: string;
  aiConfig?: AIConfiguration;
  content: AnyContentItem[];
}

export interface AIConfiguration {
  targetAudience?: ReadingLevel;
  tone?: Tone;
  outputStyle?: OutputStyle;
  customization?: string;
}

export type ReadingLevel =
  | "elementary"
  | "grade-6"
  | "grade-9"
  | "high-school"
  | "college"
  | "professional"
  | "esl-beginner"
  | "esl-intermediate";

export type Tone =
  | "educational"
  | "professional"
  | "casual"
  | "academic";

export type OutputStyle =
  | "plain-html"
  | "rich-html"
  | "markdown";

// Content item types
export interface AITextContent {
  type: "ai-text";
  prompt: string;
  title?: string;
  aiConfig?: AIConfiguration;
}

export interface AIQuizContent {
  type: "ai-quiz";
  sourceText: string;
  questionCount?: number;
  title?: string;
  aiConfig?: AIConfiguration;
}

// ... other content types
```

## See Also

- [YAML Format Reference](yaml-format.md) - YAML input format documentation
- [Teacher's Guide: AI Configuration](teacher-guide-ai-config.md) - Choosing reading levels
- [Prompt Engineering Reference](prompt-engineering.md) - How system prompts work
- [Smart Import API](smart-import-api.md) - Smart Import integration pattern (Phase 6)
