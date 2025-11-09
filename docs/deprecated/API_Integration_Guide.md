# API Integration Guide

## Overview

This guide provides instructions for integrating the H5P Compiler with SvelteKit (or other web frameworks) via an API endpoint. The `H5pCompiler` class is designed to work identically for both CLI and API usage, enabling frontend applications to generate H5P packages from JSON input.

## Architecture

The H5P Compiler follows a clean separation between input parsing, content processing, and package assembly:

```
Frontend (JSON) → API Endpoint → H5pCompiler → .h5p Buffer → Response
```

Key components:
- **BookDefinition**: TypeScript interface defining book structure (shared between frontend and backend)
- **H5pCompiler**: Reusable compiler class that accepts BookDefinition and returns .h5p Buffer
- **HandlerRegistry**: Plugin system for content types (text, image, audio, AI-generated quiz, etc.)

## SvelteKit API Endpoint Implementation

### Example: POST /api/generate-h5p

Create the following file in your SvelteKit project:

**`src/routes/api/generate-h5p/+server.ts`**

```typescript
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { H5pCompiler } from "$lib/compiler/H5pCompiler";
import { HandlerRegistry } from "$lib/handlers/HandlerRegistry";
import { LibraryRegistry } from "$lib/compiler/LibraryRegistry";
import { QuizGenerator } from "$lib/ai/QuizGenerator";
import { TextHandler } from "$lib/handlers/core/TextHandler";
import { ImageHandler } from "$lib/handlers/core/ImageHandler";
import { AudioHandler } from "$lib/handlers/core/AudioHandler";
import { AITextHandler } from "$lib/handlers/core/AITextHandler";
import { QuizHandler } from "$lib/handlers/ai/QuizHandler";
import { FlashcardsHandler } from "$lib/handlers/embedded/FlashcardsHandler";
import { DialogCardsHandler } from "$lib/handlers/embedded/DialogCardsHandler";
import type { BookDefinition, CompilerOptions } from "$lib/compiler/types";

/**
 * POST /api/generate-h5p
 *
 * Generates an H5P Interactive Book package from BookDefinition JSON.
 *
 * Request body:
 * {
 *   "bookDefinition": BookDefinition,
 *   "options"?: CompilerOptions
 * }
 *
 * Response:
 * - Success: Binary .h5p file download (application/zip)
 * - Error: JSON error object with status code
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    // Parse request body
    const { bookDefinition, options } = await request.json();

    // Validate input
    if (!bookDefinition || !bookDefinition.title || !bookDefinition.chapters) {
      throw error(400, {
        message: "Invalid book definition",
        details: ["Missing required fields: title, chapters"]
      });
    }

    // Initialize handler registry and register handlers
    const handlerRegistry = HandlerRegistry.getInstance();
    handlerRegistry.register(new TextHandler());
    handlerRegistry.register(new ImageHandler());
    handlerRegistry.register(new AudioHandler());
    handlerRegistry.register(new AITextHandler());
    handlerRegistry.register(new QuizHandler());
    handlerRegistry.register(new FlashcardsHandler());
    handlerRegistry.register(new DialogCardsHandler());

    // Initialize compiler components
    const libraryRegistry = new LibraryRegistry();
    const quizGenerator = new QuizGenerator();
    const compiler = new H5pCompiler(handlerRegistry, libraryRegistry, quizGenerator);

    // Compile BookDefinition to .h5p buffer
    const h5pBuffer = await compiler.compile(bookDefinition, options || {});

    // Return as downloadable file
    return new Response(h5pBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(bookDefinition.title)}.h5p"`,
        "Content-Length": h5pBuffer.length.toString()
      }
    });
  } catch (err) {
    console.error("H5P generation failed:", err);

    if (err && typeof err === "object" && "status" in err) {
      // SvelteKit error already thrown
      throw err;
    }

    // Wrap other errors
    throw error(500, {
      message: err instanceof Error ? err.message : "Unknown error",
      details: err instanceof Error && err.stack ? [err.stack] : []
    });
  }
};

/**
 * Sanitize filename for Content-Disposition header
 */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}
```

### Handler Registration Pattern

For production use, you may want to extract handler registration into a separate initialization function:

```typescript
// src/lib/compiler/initializeHandlers.ts
import { HandlerRegistry } from "$lib/handlers/HandlerRegistry";
import { TextHandler } from "$lib/handlers/core/TextHandler";
import { ImageHandler } from "$lib/handlers/core/ImageHandler";
import { AudioHandler } from "$lib/handlers/core/AudioHandler";
import { AITextHandler } from "$lib/handlers/core/AITextHandler";
import { QuizHandler } from "$lib/handlers/ai/QuizHandler";
import { FlashcardsHandler } from "$lib/handlers/embedded/FlashcardsHandler";
import { DialogCardsHandler } from "$lib/handlers/embedded/DialogCardsHandler";

let initialized = false;

export function initializeHandlers(): void {
  if (initialized) return;

  const registry = HandlerRegistry.getInstance();
  registry.register(new TextHandler());
  registry.register(new ImageHandler());
  registry.register(new AudioHandler());
  registry.register(new AITextHandler());
  registry.register(new QuizHandler());
  registry.register(new FlashcardsHandler());
  registry.register(new DialogCardsHandler());

  initialized = true;
}
```

Then use in your endpoint:

```typescript
import { initializeHandlers } from "$lib/compiler/initializeHandlers";

export const POST: RequestHandler = async ({ request }) => {
  initializeHandlers();
  // ... rest of handler
};
```

## Request/Response Format

### Request Body

```typescript
{
  "bookDefinition": {
    "title": "My Interactive Book",
    "language": "en",
    "description": "Optional description",
    "chapters": [
      {
        "title": "Chapter 1",
        "content": [
          {
            "type": "text",
            "title": "Introduction",
            "text": "This is the introduction text..."
          },
          {
            "type": "image",
            "title": "Diagram",
            "path": "/uploads/diagram.png",
            "alt": "Architecture diagram"
          },
          {
            "type": "ai-quiz",
            "title": "Knowledge Check",
            "sourceText": "The mitochondria is the powerhouse of the cell...",
            "questionCount": 5
          }
        ]
      }
    ]
  },
  "options": {
    "verbose": false,
    "aiProvider": "gemini",
    "basePath": "/app/uploads"
  }
}
```

### Response: Success (200 OK)

```
Content-Type: application/zip
Content-Disposition: attachment; filename="my_interactive_book.h5p"
Content-Length: 123456

[Binary .h5p file data]
```

### Response: Error (400 Bad Request)

```json
{
  "message": "Invalid book definition",
  "details": ["Missing required fields: title, chapters"]
}
```

### Response: Error (500 Internal Server Error)

```json
{
  "message": "Validation failed: Text content must have a 'text' field",
  "details": []
}
```

## TypeScript Types for Frontend

### Shared Type Definitions

All types are exported from `src/compiler/types.ts` for use in both backend and frontend:

```typescript
// Frontend code (Svelte component, for example)
import type {
  BookDefinition,
  ChapterDefinition,
  TextContent,
  ImageContent,
  AIQuizContent,
  CompilerOptions
} from "$lib/compiler/types";

// Build BookDefinition from form data
const bookDef: BookDefinition = {
  title: formData.title,
  language: formData.language,
  chapters: formData.chapters.map(ch => ({
    title: ch.title,
    content: ch.content.map(item => {
      if (item.type === "text") {
        return {
          type: "text",
          title: item.title,
          text: item.text
        } as TextContent;
      }
      // ... handle other types
    })
  }))
};

// Send to API
const response = await fetch("/api/generate-h5p", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bookDefinition: bookDef })
});
```

### Content Type Reference

#### Text Content
```typescript
{
  type: "text",
  title?: string,
  text: string  // Required: HTML or plain text
}
```

#### Image Content
```typescript
{
  type: "image",
  title?: string,
  path: string,  // Required: Local file path or URL
  alt: string    // Required: Alt text for accessibility
}
```

#### Audio Content
```typescript
{
  type: "audio",
  title?: string,
  path: string   // Required: Local file path or URL
}
```

#### AI-Generated Text
```typescript
{
  type: "ai-text",
  title?: string,
  prompt: string  // Required: AI prompt for content generation
}
```

#### AI-Generated Quiz
```typescript
{
  type: "ai-quiz",
  title?: string,
  sourceText: string,     // Required: Source material for questions
  questionCount?: number  // Optional: Default 5
}
```

#### Flashcards
```typescript
{
  type: "flashcards",
  title?: string,
  description?: string,
  cards: [
    {
      question: string,
      answer: string,
      tip?: string,
      image?: string
    }
  ]
}
```

#### Dialog Cards
```typescript
{
  type: "dialogcards",
  title?: string,
  mode?: "normal" | "repetition",
  cards: [
    {
      front: string,
      back: string,
      image?: string,
      audio?: string
    }
  ]
}
```

## Compiler Options

```typescript
interface CompilerOptions {
  verbose?: boolean;           // Enable detailed logging
  aiProvider?: "gemini" | "claude" | "auto";  // AI provider selection
  basePath?: string;           // Base path for resolving relative file paths
}
```

## Error Handling

### Validation Errors

The compiler validates all content items before processing. Common validation errors:

- **Missing required fields**: "Text content must have a 'text' field"
- **Unknown content type**: "No handler registered for content type: xyz"
- **Invalid field type**: "Expected string, got number"

Handle these in your frontend:

```typescript
try {
  const response = await fetch("/api/generate-h5p", {
    method: "POST",
    body: JSON.stringify({ bookDefinition })
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("Generation failed:", errorData.message);
    console.error("Details:", errorData.details);
    // Show user-friendly error message
  } else {
    // Download .h5p file
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bookDefinition.title}.h5p`;
    a.click();
  }
} catch (err) {
  console.error("Network error:", err);
}
```

### AI API Errors

If using AI-powered content types (ai-text, ai-quiz), ensure environment variables are set:

- `GOOGLE_API_KEY` for Gemini
- `ANTHROPIC_API_KEY` for Claude

If no API key is set, the compiler will throw an error. Handle this gracefully:

```typescript
// In your API endpoint
try {
  const h5pBuffer = await compiler.compile(bookDefinition, options);
} catch (err) {
  if (err.message.includes("API key")) {
    throw error(503, {
      message: "AI service unavailable",
      details: ["Please configure GOOGLE_API_KEY or ANTHROPIC_API_KEY"]
    });
  }
  throw err;
}
```

## Authentication & Authorization

This guide does not cover authentication or authorization. For production use, you should:

1. **Require authentication**: Verify user identity before accepting requests
2. **Rate limiting**: Prevent abuse by limiting requests per user/IP
3. **Validate permissions**: Ensure user has permission to create content
4. **Sanitize file paths**: Prevent directory traversal attacks in image/audio paths
5. **Virus scanning**: Scan uploaded media files before processing

Example with SvelteKit hooks:

```typescript
// src/hooks.server.ts
export const handle = sequence(authenticate, authorize);
```

## File Upload Handling

For image and audio content, you'll need to handle file uploads separately:

1. **Upload endpoint**: Create `/api/upload` endpoint for media files
2. **Store files**: Save to disk or cloud storage
3. **Return path**: Return file path to frontend
4. **Reference in BookDefinition**: Use returned path in `path` field

Example upload flow:

```typescript
// Step 1: Upload image
const formData = new FormData();
formData.append("file", imageFile);
const uploadResponse = await fetch("/api/upload", {
  method: "POST",
  body: formData
});
const { path } = await uploadResponse.json();

// Step 2: Add to BookDefinition
const imageContent: ImageContent = {
  type: "image",
  path: path,  // e.g., "/uploads/abc123.png"
  alt: "User-provided alt text"
};
```

## Performance Considerations

### Caching Libraries

The `LibraryRegistry` caches H5P libraries in the `content-type-cache/` directory. Ensure this directory is:

- **Writable**: The API process must have write permissions
- **Persistent**: Don't clear cache between deployments
- **Shared**: If running multiple API instances, use shared storage

### Concurrent Requests

The `H5pCompiler` is stateless and can handle concurrent requests safely. Each request:

- Creates new `ContentBuilder` instance
- Builds independent content structure
- Generates separate .h5p package

For high-traffic scenarios:

- Use load balancer to distribute requests
- Consider request queuing to prevent resource exhaustion
- Monitor memory usage (large books can consume significant memory)

### Streaming Response

For very large .h5p packages, consider streaming the response:

```typescript
// Instead of buffering entire package in memory
const packageZip = await assembler.assemble(/* ... */);
const stream = packageZip.generateNodeStream({ type: "nodebuffer", streamFiles: true });

return new Response(stream, {
  headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${title}.h5p"`
  }
});
```

## Testing the API Endpoint

### Manual Testing with curl

```bash
curl -X POST http://localhost:5173/api/generate-h5p \
  -H "Content-Type: application/json" \
  -d '{
    "bookDefinition": {
      "title": "Test Book",
      "language": "en",
      "chapters": [
        {
          "title": "Chapter 1",
          "content": [
            {
              "type": "text",
              "title": "Hello",
              "text": "This is a test."
            }
          ]
        }
      ]
    }
  }' \
  --output test-book.h5p
```

### Automated Testing

Create integration tests for your API endpoint:

```typescript
// tests/api/generate-h5p.test.ts
import { describe, it, expect } from "vitest";

describe("POST /api/generate-h5p", () => {
  it("should generate valid .h5p file", async () => {
    const bookDef = {
      title: "Test",
      language: "en",
      chapters: [
        {
          title: "Chapter 1",
          content: [{ type: "text", text: "Content" }]
        }
      ]
    };

    const response = await fetch("http://localhost:5173/api/generate-h5p", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookDefinition: bookDef })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");

    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);

    // Verify ZIP signature
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4B); // 'K'
  });

  it("should return 400 for invalid input", async () => {
    const response = await fetch("http://localhost:5173/api/generate-h5p", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookDefinition: {} })
    });

    expect(response.status).toBe(400);
    const errorData = await response.json();
    expect(errorData.message).toContain("Invalid");
  });
});
```

## Deployment Considerations

### Environment Variables

Required environment variables:

```bash
# AI providers (at least one required for AI content types)
GOOGLE_API_KEY=your_gemini_api_key
ANTHROPIC_API_KEY=your_claude_api_key

# Optional: Custom cache directory
H5P_CACHE_DIR=/var/cache/h5p
```

### File System Requirements

- **Cache directory**: ~100MB for H5P library cache
- **Temp directory**: Sufficient space for concurrent package generation
- **Upload directory**: For user-uploaded media files (if using file uploads)

### Docker Deployment

Example Dockerfile:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Build SvelteKit app
RUN npm run build

# Create cache directory
RUN mkdir -p /app/content-type-cache

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "build"]
```

## Security Best Practices

1. **Input validation**: Always validate BookDefinition structure
2. **Sanitize file paths**: Prevent directory traversal in image/audio paths
3. **Rate limiting**: Prevent DoS attacks
4. **CORS configuration**: Restrict origins if not public API
5. **Content Security Policy**: Set appropriate CSP headers
6. **Size limits**: Limit request body size and file upload sizes
7. **Timeout configuration**: Prevent long-running requests from exhausting resources

Example rate limiting with SvelteKit:

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: "Too many requests, please try again later"
});

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  // Apply rate limiting
  await limiter(request, getClientAddress());

  // ... rest of handler
};
```

## Next Steps

- Review the [Handler Development Guide](./Handler_Development_Guide.md) to create custom content types
- Explore the [BookDefinition schema](../src/compiler/YamlInputParser.ts) for detailed type definitions
- Check [examples/](../examples/) for sample BookDefinition JSON files

## Support

For issues and questions:
- GitHub Issues: https://github.com/sr258/h5p-cli-creator/issues
- Documentation: https://github.com/sr258/h5p-cli-creator
