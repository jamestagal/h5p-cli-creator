# h5p-cli-creator

This is a command line utility that allows you to mass create H5P content from input files using the command line. It is written in TypeScript and runs on NodeJS, meaning it's platform independent. Currently, it supports the **Flashcards**, **Dialog Cards**, and **Interactive Book** content types, but you can use the infrastructure provided here to add functionality for other content types. Pull requests are welcomed!

## Handler-Based Architecture

This project uses a **handler-based plugin architecture** that makes it easy to add new content types without modifying core compiler code. Each content type is implemented as a self-contained handler that:

- **Validates** content items (ensures required fields are present)
- **Processes** content using the ChapterBuilder API
- **Declares** required H5P libraries for dependency resolution

### Available Handlers

**Core Content Types:**
- `text` - Static text content with HTML formatting
- `image` - Image content with alt text for accessibility
- `audio` - Audio narration files

**AI-Powered Types:**
- `ai-text` - AI-generated educational text from prompts
- `ai-quiz` - AI-generated multiple choice quizzes

**Embedded Types:**
- `flashcards` - Flashcard decks for memorization
- `dialogcards` - Dialog cards for language learning

### Creating Custom Handlers

Want to add a new content type? It's easy! Each handler is a TypeScript class implementing the `ContentHandler` interface:

```typescript
import { ContentHandler, HandlerContext } from "./ContentHandler";

export class MyCustomHandler implements ContentHandler {
  // Unique identifier for this content type
  getContentType(): string {
    return "my-custom-type";
  }

  // Validate content item structure
  validate(item: any): { valid: boolean; error?: string } {
    if (!item.requiredField) {
      return { valid: false, error: "Missing required field" };
    }
    return { valid: true };
  }

  // Process content and add to chapter
  async process(context: HandlerContext, item: any): Promise<void> {
    context.chapterBuilder.addTextPage(item.title, item.content);
  }

  // Declare required H5P libraries
  getRequiredLibraries(): string[] {
    return ["H5P.CustomLibrary"];
  }
}
```

**Benefits of the Handler Architecture:**
- Add new content types in ~30-60 minutes (vs 4-8 hours with old approach)
- No need to modify core compiler code
- Automatic library dependency resolution
- Clean separation of concerns
- Easy to test and maintain

For detailed instructions, see the [Handler Development Guide](docs/Handler_Development_Guide.md).

### API Integration

The H5P Compiler can be used as a library in SvelteKit (or other web frameworks) to generate H5P packages from JSON input:

```typescript
// API endpoint example
import { H5pCompiler } from "$lib/compiler/H5pCompiler";
import type { BookDefinition } from "$lib/compiler/types";

const compiler = new H5pCompiler(handlerRegistry, libraryRegistry, quizGenerator);
const h5pBuffer = await compiler.compile(bookDefinition);

// Return as downloadable file
return new Response(h5pBuffer, {
  headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${bookDef.title}.h5p"`
  }
});
```

For complete API integration instructions, see the [API Integration Guide](docs/API_Integration_Guide.md).

## Run
* Install [NodeJS](https://nodejs.org/)
* [clone this repository](https://help.github.com/articles/cloning-a-repository/) into a directory on your computer
* Execute these commands from the command line at the directory you've cloned into:
* `npm install` to install dependencies
* `npm run build` to transpile typescript to javascript
* `node ./dist/index.js --help` to get help
* `node ./dist/index.js flashcards --help` to get help for creating flashcards
* `node ./dist/index.js dialogcards --help` to get help for creating dialog cards
* `node ./dist/index.js interactivebook --help` to get help for creating interactive books
* `node ./dist/index.js interactivebook-ai --help` to get help for creating AI-powered interactive books

## Supported Content Types

### Flashcards
Create flashcard decks for learning and memorization.

**Example:**
```bash
node ./dist/index.js flashcards ./tests/flash1.csv ./outputfile.h5p -l=de -t="Meine Karteikarten" --description="Schreibe die Übersetzungen in das Eingabefeld."
```

Reads the file `flash1.csv` in the `tests` directory and outputs a h5p file with the filename `outputfile.h5p` in the current directory. The language strings will be set to German, the title 'Meine Karteikarten' and the description displayed when studying the flashcards will be 'Schreibe die Übersetzungen in das Eingabefeld.'

### Dialog Cards
Create dialog cards with audio and images for language learning.

**Example:**
```bash
node ./dist/index.js dialogcards ./tests/dialog1.csv ./outputfile.h5p -l=de -n="Meine Karteikarten" -m="repetition"
```

Reads the file `dialog1.csv` in the `tests` directory and outputs a h5p file with the filename `outputfile.h5p` in the current directory. The language strings will be set to German and the title to 'Meine Karteikarten'.

### Interactive Book
Create interactive digital storybooks with text, images, and audio narration.

**Example:**
```bash
node ./dist/index.js interactivebook ./tests/book1.csv ./outputfile.h5p -l=en -t="My Story Book"
```

Reads the file `book1.csv` and creates an Interactive Book H5P package with English language settings and the title "My Story Book".

**CSV Format:**

Required columns:
- `bookTitle` - Title of the entire book (used from first row)
- `pageTitle` - Title for each page/chapter
- `pageText` - Main text content for the page (supports multiple paragraphs with double newlines)

Optional columns:
- `imagePath` - Path to image file (local or URL starting with http:// or https://)
- `imageAlt` - Alt text for accessibility
- `audioPath` - Path to audio narration file (local or URL)
- `coverDescription` - Book cover description (from first row only)

**CSV Example:**
```csv
bookTitle,pageTitle,pageText,imagePath,imageAlt,audioPath,coverDescription
"My Story","Introduction","Welcome to my story.

This is a great adventure.",,,,"A wonderful tale"
"My Story","Chapter 1","Once upon a time...",images/chapter1.jpg,An illustration,audios/narration1.mp3,
"My Story","Chapter 2","The adventure continues...",images/chapter2.jpg,Another scene,,
```

**CLI Options:**
- `-l, --language <code>` - Language code (default: "en")
- `-t, --title <title>` - Override book title from CSV
- `-d, --delimiter <char>` - CSV delimiter (default: ",")
- `-e, --encoding <enc>` - File encoding (default: "UTF-8")

**Media File Handling:**
- **Local files**: Paths are resolved relative to the CSV file location
  - Example: `images/chapter1.jpg` looks for file in same directory as CSV
- **URLs**: Images and audio can be downloaded from the web
  - Example: `https://example.com/image.jpg`
- Supported image formats: JPG, PNG, GIF, SVG
- Supported audio formats: MP3, WAV, OGG

**Known Limitations:**
- One image per page maximum
- One audio file per page maximum
- No video support
- No interactive elements (quizzes, drag-drop, etc.)
- Basic HTML formatting only (h2 for titles, p for paragraphs)
- Text formatting uses automatic paragraph detection (double newlines create new paragraphs)

### Interactive Book (AI-Powered) 🤖 NEW!
Create interactive digital books with **AI-generated content** including text, quizzes, flashcards, and more. This command uses a **template-free approach** and supports AI content generation via Google Gemini or Anthropic Claude.

**Features:**
- ✅ **AI Text Generation** - Automatically generate educational content from prompts
- ✅ **AI Quiz Generation** - Create multiple choice questions from source text
- ✅ **Template-Free** - No template files required, all content built programmatically
- ✅ **Dual AI Providers** - Supports both Google Gemini 2.5 Flash and Anthropic Claude Sonnet 4
- ✅ **Mixed Content** - Combine manual text, AI text, images, audio, and quizzes
- ✅ **Automatic Library Management** - Fetches and bundles all required H5P libraries automatically

**Requirements:**
- Set `GOOGLE_API_KEY` environment variable (for Gemini) OR
- Set `ANTHROPIC_API_KEY` environment variable (for Claude)
- Create a `.env` file in the project root (see `.env.example`)

**Example:**
```bash
# Set up environment (one time)
echo "GOOGLE_API_KEY=your_api_key_here" > .env

# Generate AI-powered book
node ./dist/index.js interactivebook-ai ./examples/biology-lesson.yaml ./output.h5p --verbose
```

**YAML Input Format:**

Instead of CSV, this command uses YAML files that define book structure with AI directives:

```yaml
title: "AI-Generated Biology Lesson"
language: "en"
description: "Interactive book with AI-generated content"

chapters:
  - title: "Introduction"
    content:
      # AI-generated educational text
      - type: ai-text
        title: "What is Photosynthesis?"
        prompt: "Write a clear, educational summary of photosynthesis for high school students. Include information about the process, inputs, outputs, and where it occurs. Make it about 150-200 words. Use plain text only - no markdown formatting."

  - title: "Visual Content"
    content:
      # Manual text
      - type: text
        title: "Cell Structure"
        text: "This diagram shows the cell structures involved in photosynthesis."

      # Images (local or URL)
      - type: image
        title: "Plant Cell Diagram"
        path: "./images/plant-cell.jpg"
        alt: "Microscopic view of plant cells"

  - title: "Audio Narration"
    content:
      # Audio files (local or URL)
      - type: audio
        title: "Photosynthesis Explanation"
        path: "./audio/narration.mp3"

  - title: "Test Your Knowledge"
    content:
      # AI-generated quiz questions
      - type: ai-quiz
        title: "Photosynthesis Quiz"
        questionCount: 5
        sourceText: |
          Photosynthesis is the process by which plants use sunlight, water and carbon dioxide
          to create oxygen and energy in the form of sugar (glucose).

          This process occurs in the chloroplasts of plant cells.
```

**Supported Content Types:**

| Type | Description | Required Fields | Optional Fields |
|------|-------------|-----------------|-----------------|
| `text` | Manual text content | `text` | `title` |
| `ai-text` | AI-generated educational text | `prompt` | `title` |
| `image` | Image content | `path` | `title`, `alt` |
| `audio` | Audio narration | `path` | `title` |
| `ai-quiz` | AI-generated multiple choice quiz | `sourceText`, `questionCount` | `title` |
| `flashcards` | Flashcard deck | `cards` (array) | `title`, `description` |
| `dialogcards` | Dialog cards | `cards` (array) | `title`, `mode` |

**CLI Options:**
- `--ai-provider <gemini|claude|auto>` - Choose AI provider (default: auto-detect)
- `--api-key <key>` - Override API key from environment
- `--verbose` - Show detailed generation logs including character counts and AI responses

**Example Commands:**

```bash
# Use default AI provider (auto-detect)
node ./dist/index.js interactivebook-ai ./lesson.yaml ./output.h5p

# Force Google Gemini
node ./dist/index.js interactivebook-ai ./lesson.yaml ./output.h5p --ai-provider=gemini

# Force Claude with custom API key
node ./dist/index.js interactivebook-ai ./lesson.yaml ./output.h5p --ai-provider=claude --api-key=sk-ant-xxx

# Verbose output for debugging
node ./dist/index.js interactivebook-ai ./lesson.yaml ./output.h5p --verbose
```

**AI Text Generation Best Practices:**

1. **Be specific in prompts** - Include target audience, length, and style
2. **Avoid markdown** - Request plain text only (AI models default to markdown)
3. **Specify paragraph separation** - Ask for "paragraphs separated by blank lines"
4. **Provide context** - Give enough background for the AI to generate accurate content

**Example Prompt:**
```yaml
prompt: "Write a clear, educational summary of mitosis for 9th grade biology students.
Include the four phases (prophase, metaphase, anaphase, telophase) and their key
characteristics. Make it about 200 words. IMPORTANT: Use plain text only - no markdown
formatting, no asterisks for bold, no special characters. Write naturally with proper
paragraphs separated by blank lines."
```

**AI Quiz Generation Best Practices:**

1. **Provide comprehensive source text** - Include all key concepts you want tested
2. **Adjust question count** - 5 questions per topic is usually ideal
3. **Include definitions** - AI generates better questions when terms are defined
4. **Add context** - Background information helps create better distractors

**Example Quiz:**
```yaml
- type: ai-quiz
  title: "Cell Division Quiz"
  questionCount: 5
  sourceText: |
    Mitosis is the process of cell division that results in two identical daughter cells.

    The four phases are:
    1. Prophase: Chromosomes condense and become visible
    2. Metaphase: Chromosomes align at the cell's equator
    3. Anaphase: Sister chromatids separate and move to opposite poles
    4. Telophase: Nuclear envelopes reform around each set of chromosomes

    Mitosis is essential for growth, repair, and asexual reproduction.
```

**What Gets Generated:**
- **2.2MB .h5p package** with 12 automatically bundled H5P libraries
- **Fully functional content** validated on h5p.com
- **AI-generated text** (typically 800-1500 characters per prompt)
- **AI-generated quizzes** with correct/incorrect feedback and retry functionality
- **Media files embedded** (images and audio)

**See Example:**
Check out [examples/biology-lesson.yaml](examples/biology-lesson.yaml) for a complete working example with AI text generation, images, audio, and quizzes.

## Contributing

We welcome contributions! To add a new content type or fix bugs:

1. **Fork the repository** and create a feature branch
2. **Follow the handler pattern** - See [Handler Development Guide](docs/Handler_Development_Guide.md)
3. **Write tests** - Ensure your handler has unit tests
4. **Update documentation** - Add examples and update this README
5. **Submit a pull request** - We'll review and provide feedback

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Coding conventions
All classes that exist in the actual H5P libraries or content types start with `H5p`, e.g. `H5pImage`. All classes that are part of the creator and don't exist in external libraries or content types don't start with this prefix.
