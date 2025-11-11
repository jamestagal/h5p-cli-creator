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
- `truefalse` - Simple true/false questions with optional media
- `singlechoiceset` - Single-choice quiz questions
- `dragtext` - Drag-the-words fill-in-the-blank exercises
- `accordion` - Collapsible FAQ or glossary panels
- `summary` - Summary content with keywords

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

For detailed instructions, see the [Handler Development Guide](docs/developer-guides/Handler_Development_Guide.md).

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

For complete API integration instructions, see the [API Integration Guide](docs/developer-guides/api-integration.md).

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
- ✅ **Reading Level Control** - Choose from 8 reading levels (elementary to professional)
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
node ./dist/index.js interactivebook-ai ./examples/yaml/biology-lesson.yaml ./output.h5p --verbose
```

#### AI Configuration 🎯 NEW!

Control how AI generates content with simple configuration. Set reading level, tone, and customization once for your entire book:

```yaml
title: "Biology Fundamentals"
language: "en"

# AI Configuration - applies to ALL AI content!
aiConfig:
  targetAudience: "grade-6"        # Choose from 8 reading levels
  tone: "educational"              # Choose from 4 tone options
  customization: "Focus on visual learners. Include real-world examples."

chapters:
  - title: "Photosynthesis"
    content:
      - type: ai-text
        prompt: "Explain photosynthesis"  # Simple! No formatting instructions needed
```

**8 Reading Levels Available:**

| Level | Grade/Age | Best For |
|-------|-----------|----------|
| `elementary` | Grades 1-5 | Young students, basic concepts |
| `grade-6` | Ages 11-12 | **DEFAULT** - Middle school |
| `grade-9` | Ages 14-15 | High school freshmen/sophomores |
| `high-school` | Grades 10-12 | College prep, AP courses |
| `college` | Undergraduate | University students |
| `professional` | Adult | Workplace training |
| `esl-beginner` | A1-A2 CEFR | English learners (beginner) |
| `esl-intermediate` | B1-B2 CEFR | English learners (intermediate) |

**Before (the old way):**
```yaml
- type: ai-text
  prompt: "Explain photosynthesis for 6th grade students. Use simple sentences. No markdown formatting. Use plain text only."
```

**After (the new way):**
```yaml
aiConfig:
  targetAudience: "grade-6"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain photosynthesis"  # Clean and simple!
```

**Benefits:**
- ✅ Write simple, focused prompts
- ✅ Consistent reading level across all AI content
- ✅ No more formatting instructions in prompts
- ✅ Easy to change reading level for entire book
- ✅ Optional customization for specific teaching approaches

**Configuration Hierarchy:**

You can set aiConfig at three levels with increasing specificity:

```yaml
# Book level - applies to everything
aiConfig:
  targetAudience: "grade-6"

chapters:
  # Chapter level - overrides book setting for this chapter
  - title: "Advanced Topics"
    aiConfig:
      targetAudience: "high-school"
    content:
      # Item level - overrides chapter and book settings
      - type: ai-text
        aiConfig:
          targetAudience: "college"
        prompt: "Explain quantum photosynthesis"
```

**See Documentation:**
- [Teacher's Guide: AI Configuration](docs/user-guides/teacher-guide-ai-config.md) - Choosing reading levels, customization tips
- [YAML Format Reference](docs/user-guides/yaml-format.md) - Complete YAML syntax with aiConfig examples
- [API Integration Guide](docs/developer-guides/api-integration.md) - Using aiConfig in web applications
- [Prompt Engineering Reference](docs/developer-guides/prompt-engineering.md) - How system prompts work (technical)

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
| `ai-text` | AI-generated educational text | `prompt` | `title`, `aiConfig` |
| `image` | Image content | `path` | `title`, `alt` |
| `audio` | Audio narration | `path` | `title` |
| `ai-quiz` | AI-generated multiple choice quiz | `sourceText`, `questionCount` | `title`, `aiConfig` |
| `flashcards` | Flashcard deck | `cards` (array) | `title`, `description` |
| `dialogcards` | Dialog cards | `cards` (array) | `title`, `mode` |
| `accordion` (or `accordions`) | Collapsible FAQ or glossary panels | `panels` (array with `title` and `content`) | `title`, `style` |
| `ai-accordion` | AI-generated collapsible panels | `prompt` | `title`, `panelCount`, `style`, `difficulty`, `aiConfig` |
| `summary` | Summary content with keywords | `text` | `title`, `keywords` (array) |
| `ai-summary` | AI-generated summary with keywords | `prompt` | `title`, `keywordCount`, `difficulty`, `aiConfig` |
| `dragtext` (or `drag-the-words`) | Drag-the-words fill-in-the-blank exercises | `sentences` (array), `distractors` (array) | `title`, `taskDescription`, `behaviour`, `labels` |
| `ai-dragtext` (or `ai-drag-the-words`) | AI-generated drag-the-words exercises | `prompt` | `title`, `sentenceCount`, `blanksPerSentence`, `difficulty`, `includeDistractors`, `distractorCount`, `aiConfig` |
| `singlechoiceset` (or `single-choice-set`) | Single-choice quiz questions (only one correct answer) | `questions` (array) | `title`, `behaviour`, `labels`, `feedback` |
| `ai-singlechoiceset` (or `ai-single-choice-set`) | AI-generated single-choice questions | `prompt` | `title`, `questionCount`, `distractorsPerQuestion`, `difficulty`, `aiConfig` |
| `blanks` (or `fill-in-the-blanks`) | Fill-in-the-blank exercises with typed answers | `sentences` OR `questions` (array) | `title`, `taskDescription`, `media`, `behaviour`, `labels`, `feedback` |
| `ai-blanks` (or `ai-fill-in-the-blanks`) | AI-generated fill-in-the-blank exercises | `prompt` | `title`, `sentenceCount`, `blanksPerSentence`, `difficulty`, `aiConfig` |
| `truefalse` (or `true-false`) | Simple true/false questions | `question`, `correct` (boolean) | `title`, `media`, `behaviour`, `labels` |
| `ai-truefalse` (or `ai-true-false`) | AI-generated true/false questions | `prompt` | `title`, `questionCount`, `difficulty`, `aiConfig` |
| `essay` | Essay questions with keyword-based automatic scoring | `taskDescription`, `keywords` (array) | `title`, `placeholderText`, `solution`, `media`, `behaviour`, `overallFeedback`, `labels` |
| `ai-essay` | AI-generated essay questions | `prompt` | `title`, `keywordCount`, `includeAlternatives`, `includeSampleSolution`, `difficulty`, `minimumLength`, `maximumLength`, `aiConfig` |

**TrueFalse Questions - YAML Examples:**

```yaml
# Basic manual true/false question
- type: truefalse
  question: "The Sun is a star"
  correct: true

# With custom feedback
- type: truefalse
  title: "Solar System Size"
  question: "Earth is the largest planet in our solar system"
  correct: false
  behaviour:
    feedbackOnWrong: "Jupiter is actually the largest planet!"

# With media
- type: truefalse
  title: "Geography Question"
  question: "This image shows Earth from space"
  correct: true
  media:
    path: "./images/earth.jpg"
    type: "image"
    alt: "Photo of Earth from space"

# AI-generated questions
- type: ai-truefalse
  title: "Solar System Quiz"
  prompt: "Create true/false questions about planets in our solar system"
  questionCount: 5
  difficulty: "medium"
```

**Note about boolean-to-string conversion:** The TrueFalse handler automatically converts your boolean `correct` field (true/false) to the string format ("true"/"false") required by H5P.TrueFalse. You always use booleans in YAML, and the handler handles the conversion internally.

**See Complete Example:** Check out [examples/yaml/truefalse-example.yaml](examples/yaml/truefalse-example.yaml) for comprehensive TrueFalse examples including media support, behaviour customization, label localization, and AI generation.


#### Essay Questions

Create essay questions that assess deeper understanding through written responses. The system automatically scores essays by checking for important keywords and can provide immediate feedback to students.

**Key Features:**
- **Keyword-Based Scoring** - Automatically score essays based on presence of important terms
- **Wildcard Matching** - Use `*` for partial matching (e.g., `*photo*` matches "photograph", "photosynthesis")
- **Keyword Alternatives** - Accept synonyms for fair scoring (e.g., "rocky" or "terrestrial")
- **Per-Keyword Feedback** - Provide specific feedback when keywords are found or missed
- **Sample Solutions** - Show example answers to help students learn
- **Character Length Constraints** - Set minimum and maximum essay lengths
- **Media Support** - Add images, videos, or audio for context
- **AI Generation** - Automatically create essay questions with relevant keywords and sample solutions

**Manual Essay Examples:**

```yaml
# Basic essay with keywords
- type: essay
  title: "The Sun's Importance"
  taskDescription: "Write a short paragraph explaining why the Sun is important to Earth."
  placeholderText: "The Sun is important because..."
  keywords:
    - keyword: "light"
      points: 10
      feedbackMissed: "Don't forget to mention how the Sun provides light."
    - keyword: "heat"
      points: 10
    - keyword: "*photosyn*"
      points: 15
      feedbackIncluded: "Great! You mentioned photosynthesis."
  behaviour:
    minimumLength: 50
    maximumLength: 300

# Essay with keyword alternatives
- type: essay
  title: "Planet Classification"
  taskDescription: "Explain the difference between inner planets and outer planets."
  keywords:
    - keyword: "rocky"
      alternatives: ["terrestrial", "solid", "earth-like"]
      points: 10
      feedbackIncluded: "Excellent! You correctly identified the inner planets."
    - keyword: "gas"
      alternatives: ["gaseous", "gas giant"]
      points: 10
      feedbackIncluded: "Good! You mentioned the gaseous nature of outer planets."
  behaviour:
    minimumLength: 100
    maximumLength: 400

# Essay with sample solution
- type: essay
  title: "Describe Jupiter"
  taskDescription: "Write a description of Jupiter, including its key characteristics."
  keywords:
    - keyword: "largest"
      alternatives: ["biggest", "giant"]
      points: 10
    - keyword: "*Great Red Spot*"
      points: 20
      feedbackIncluded: "Excellent! You mentioned the Great Red Spot."
    - keyword: "moon*"
      points: 10
  solution:
    introduction: "A strong answer should include Jupiter's size, composition, distinctive features, and moons."
    sample: "Jupiter is the largest planet in our solar system. It's a gas giant composed mainly of hydrogen and helium. Its most famous feature is the Great Red Spot, a massive storm that has been raging for centuries."
  behaviour:
    minimumLength: 80
    maximumLength: 500

# Essay with media
- type: essay
  title: "Saturn's Rings"
  taskDescription: "Look at the image above and describe Saturn's ring system."
  media:
    path: "./images/saturn.jpg"
    type: "image"
    alt: "Saturn showing its ring system"
  keywords:
    - keyword: "ice"
      points: 15
      feedbackIncluded: "Correct! The rings contain ice particles."
    - keyword: "rock"
      alternatives: ["rocks", "particles", "debris"]
      points: 10
  behaviour:
    minimumLength: 60
    maximumLength: 300
```

**Keyword Features:**

**Wildcards** - Use `*` for flexible matching:
- `*photo*` matches "photograph", "photosynthesis", "photon"
- `mitochondri*` matches "mitochondria", "mitochondrion", "mitochondrial"
- `*respir*` matches "respiration", "respiratory", "respirate"

**Alternatives** - Accept multiple ways to express the same concept:
```yaml
keywords:
  - keyword: "evaporation"
    alternatives: ["evaporate", "evaporates", "vaporization"]
    points: 15
  - keyword: "precipitation"
    alternatives: ["rain", "rainfall", "snow", "hail"]
    points: 15
```

**Per-Keyword Points and Occurrences:**
```yaml
keywords:
  - keyword: "example"
    alternatives: ["for example", "such as"]
    points: 20
    occurrences: 3  # Award points up to 3 times
    feedbackMissed: "Try to provide examples for each point."
```

**Per-Keyword Feedback:**
```yaml
keywords:
  - keyword: "greenhouse gas*"
    alternatives: ["carbon dioxide", "CO2", "methane"]
    points: 20
    feedbackIncluded: "Excellent! You identified greenhouse gases."
    feedbackMissed: "Remember to mention which gases cause the greenhouse effect."
```

**Sample Solutions:**
```yaml
solution:
  introduction: "A good answer should explain the inputs, process, and outputs of photosynthesis."
  sample: "Photosynthesis is the process by which plants convert light energy into chemical energy. Plants use sunlight, absorbed by chlorophyll in their leaves, along with carbon dioxide from the air and water from their roots..."
```

**Behavior Settings:**
```yaml
behaviour:
  minimumLength: 100          # Minimum characters required
  maximumLength: 500          # Maximum characters allowed
  percentagePassing: 60       # Score needed to pass (0-100)
  percentageMastering: 85     # Score needed to master (0-100)
  enableRetry: true           # Allow retry after checking
```

**AI-Generated Essay Questions:**

Generate essay questions automatically with relevant keywords, alternatives, and sample solutions:

```yaml
# AI essay - Medium difficulty (default)
- type: ai-essay
  title: "Photosynthesis Process"
  prompt: "Create an essay question about the process of photosynthesis, including the inputs, outputs, and where it occurs"
  keywordCount: 7
  difficulty: "medium"
  includeAlternatives: true
  includeSampleSolution: true
  minimumLength: 150
  maximumLength: 500

# AI essay - Easy difficulty
- type: ai-essay
  title: "Basic Biology"
  prompt: "Create an essay question about the basic parts of a plant (roots, stem, leaves, flowers) and their functions"
  keywordCount: 5
  difficulty: "easy"
  includeAlternatives: true
  includeSampleSolution: true

# AI essay - Hard difficulty
- type: ai-essay
  title: "Cellular Respiration"
  prompt: "Create a challenging essay question about cellular respiration, including glycolysis, the Krebs cycle, and the electron transport chain"
  keywordCount: 10
  difficulty: "hard"
  includeAlternatives: true
  includeSampleSolution: true
  minimumLength: 250
  maximumLength: 800

# AI essay with custom configuration
- type: ai-essay
  title: "DNA Structure"
  prompt: "Create an essay question about DNA structure and function"
  keywordCount: 8
  difficulty: "hard"
  minimumLength: 200
  maximumLength: 700
  aiConfig:
    targetAudience: "high-school"
    tone: "educational"
    customization: "Use precise scientific terminology."
```

**AI Parameters:**
- `prompt` (required) - Description of the essay topic
- `keywordCount` (default: 5) - Number of keywords to generate (1-20)
- `difficulty` - "easy", "medium", or "hard"
- `includeAlternatives` (default: true) - Generate synonyms for keywords
- `includeSampleSolution` (default: true) - Generate example answer
- `minimumLength` / `maximumLength` - Override difficulty defaults
- `aiConfig` - Control reading level and tone

**Difficulty Levels:**
- **Easy**: 3-5 keywords, 50-200 characters, simple vocabulary, common terms, basic sentences
- **Medium**: 5-7 keywords, 100-500 characters, moderate vocabulary, subject-specific terms, analytical thinking
- **Hard**: 7-10 keywords, 200-1000 characters, advanced vocabulary, technical terms, complex analysis

**Complete Example:**

See [examples/yaml/essay-example.yaml](examples/yaml/essay-example.yaml) for comprehensive examples including:
- Basic essays with simple keywords
- Essays with keyword alternatives
- Essays with per-keyword points, occurrences, and feedback
- Essays with sample solutions
- Essays with media (images, videos, audio)
- Essays with character length constraints
- AI-generated essays at different difficulty levels
- All features combined in complex examples



#### Crossword Puzzles

Create interactive crossword puzzles for vocabulary building, educational review, and language learning. H5P.Crossword automatically generates the puzzle grid layout from word/clue pairs - no manual positioning needed.

**Key Features:**
- **Automatic Grid Generation** - H5P library automatically places words in crossword grid
- **Extra Clues** - Optional text hints displayed in modal overlay
- **Theme Customization** - Customize colors for grid, cells, and backgrounds
- **Behavior Settings** - Configure instant feedback, scoring, penalties, and retry options
- **Overall Feedback** - Score-based messages to encourage learning
- **AI Generation** - Automatically create crosswords from topic prompts

**Manual Crossword Examples:**

```yaml
# Basic crossword
- type: crossword
  title: "Geography Quiz"
  taskDescription: "Famous landmarks around the world"
  words:
    - clue: "Statue of Liberty is located in?"
      answer: "NewYork"

    - clue: "Taj Mahal is located in which city?"
      answer: "Agra"

    - clue: "Eiffel Tower is located in?"
      answer: "Paris"

# Crossword with extra clues (hints)
- type: crossword
  title: "Solar System"
  taskDescription: "Planets and celestial bodies"
  words:
    - clue: "The red planet"
      answer: "Mars"
      extraClue:
        type: text
        content: "Fourth planet from the Sun, known for its rusty color caused by iron oxide."

    - clue: "Largest planet in our solar system"
      answer: "Jupiter"
      extraClue:
        type: text
        content: "A gas giant with a Great Red Spot storm."

# Crossword with custom theme
- type: crossword
  title: "Ocean Life"
  taskDescription: "Marine creatures and ocean features"
  theme:
    backgroundColor: "#0077BE"
    gridColor: "#004080"
    cellBackgroundColor: "#E0F7FF"
    cellColor: "#003366"
  words:
    - clue: "Largest animal on Earth"
      answer: "BlueWhale"

    - clue: "Eight-armed sea creature"
      answer: "Octopus"

# Crossword with behavior settings
- type: crossword
  title: "Mathematics Terms"
  taskDescription: "Complete this crossword about mathematical concepts"
  behaviour:
    enableInstantFeedback: true
    scoreWords: true
    applyPenalties: true
    enableRetry: true
    enableSolutionsButton: true
  words:
    - clue: "Result of addition"
      answer: "Sum"

    - clue: "Result of subtraction"
      answer: "Difference"

# Crossword with overall feedback ranges
- type: crossword
  title: "Literary Terms"
  taskDescription: "Test your knowledge of literary terms"
  overallFeedback:
    - from: 0
      to: 49
      feedback: "Keep practicing! Review the terms and try again."
    - from: 50
      to: 79
      feedback: "Good job! A bit more study will get you to mastery."
    - from: 80
      to: 100
      feedback: "Excellent work! You've mastered these terms!"
  words:
    - clue: "The main character in a story"
      answer: "Protagonist"

    - clue: "Central idea or message of a work"
      answer: "Theme"
```

**AI-Generated Crosswords:**

Generate complete crosswords from a single topic prompt:

```yaml
# Basic AI crossword
- type: ai-crossword
  title: "Solar System Crossword"
  prompt: "Create a crossword puzzle about planets in our solar system"
  wordCount: 8
  difficulty: "medium"

# AI crossword with extra clues
- type: ai-crossword
  title: "World Geography"
  prompt: "Create a crossword about world geography including countries, capitals, and landmarks"
  wordCount: 10
  difficulty: "medium"
  includeExtraClues: true

# AI crossword with custom configuration
- type: ai-crossword
  title: "Simple Machines"
  prompt: "Create a crossword about simple machines in physics"
  wordCount: 8
  difficulty: "easy"
  aiConfig:
    targetAudience: "grade-6"
    tone: "educational"
    customization: "Use clear, simple language with real-world examples"
```

**AI Parameters:**
- `prompt` (required) - Topic for crossword generation
- `wordCount` (default: 10) - Number of words to generate (2-20)
- `difficulty` - "easy" (5-8 letters), "medium" (6-12 letters), or "hard" (8-15 letters)
- `includeExtraClues` (default: false) - Generate hint text for each word
- `aiConfig` - Control reading level and tone

**Behavior Settings:**
- `enableInstantFeedback` (default: false) - Show feedback immediately vs on submit
- `scoreWords` (default: true) - Score by complete words vs individual characters
- `applyPenalties` (default: false) - Deduct points for wrong answers
- `enableRetry` (default: true) - Allow retry after submission
- `enableSolutionsButton` (default: true) - Show solutions button

**Theme Properties:**
- `backgroundColor` - Background color (hex format: #RRGGBB)
- `gridColor` - Grid border color
- `cellBackgroundColor` - Cell background color
- `cellColor` - Cell text color

**Important Notes:**
- **Single-word answers only** - Answers must be single words (no spaces). Hyphens are permitted.
- **Minimum 2 words** - At least 2 words required for crossword generation
- **Automatic grid layout** - H5P.Crossword automatically fits words into grid client-side
- **Extra clues** - Text hints appear in modal overlay when clicking info icon

**Complete Examples:**

See example files for comprehensive demonstrations:
- [examples/crossword-example.yaml](examples/crossword-example.yaml) - Manual crosswords with all features
- [examples/crossword-ai-example.yaml](examples/crossword-ai-example.yaml) - AI-generated crosswords
- [examples/crossword-production-demo.yaml](examples/crossword-production-demo.yaml) - Ready-to-upload demo


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
2. **Use aiConfig for reading level** - Don't embed reading level in prompts
3. **Keep prompts focused** - Trust the system to handle formatting and style
4. **Provide context** - Give enough background for the AI to generate accurate content

**Example with AI Configuration:**
```yaml
aiConfig:
  targetAudience: "grade-9"
  customization: "Use medical examples. Include diagrams where helpful."

chapters:
  - content:
      - type: ai-text
        prompt: "Explain mitosis"  # Simple and focused!
```

**AI Quiz Generation Best Practices:**

1. **Provide comprehensive source text** - Include all key concepts you want tested
2. **Adjust question count** - 5 questions per topic is usually ideal
3. **Include definitions** - AI generates better questions when terms are defined
4. **Add context** - Background information helps create better distractors
5. **Use aiConfig for difficulty** - Control question complexity with targetAudience

**Example Quiz with AI Configuration:**
```yaml
aiConfig:
  targetAudience: "high-school"

chapters:
  - content:
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

#### Fill in the Blanks

Create fill-in-the-blank exercises where students type answers into input fields. Supports both a simplified format with `{blank}` markers and native H5P syntax with `*answer*` markers.

**Dual Format Support:**

**Option 1: Simplified Format (Recommended)**

Use `{blank}` placeholders in your text for easy authoring:

```yaml
- type: blanks
  title: "Solar System Facts"
  taskDescription: "Fill in the missing words"
  sentences:
    - text: "The Sun is a {blank}."
      blanks:
        - answer: "star"
          tip: "Not a planet!"

    - text: "Earth has {blank} moon(s)."
      blanks:
        - answer: ["one", "1"]  # Multiple correct answers

    - text: "The largest planet is {blank}."
      blanks:
        - answer: "Jupiter"
```

**Option 2: Native H5P Format (Advanced)**

Use H5P's native `*answer*` syntax for full control:

```yaml
- type: blanks
  title: "Solar System Facts"
  taskDescription: "Fill in the missing words"
  questions:
    - "The Sun is a *star:Not a planet!*."
    - "Earth has *one/1* moon(s)."
    - "The largest planet is *Jupiter*."
```

**Native Syntax Features:**
- `*answer*` - Basic blank
- `*answer1/answer2*` - Alternative correct answers
- `*answer:tip text*` - Answer with hint
- `*answer1/answer2:tip text*` - Combined alternatives and tip

**When to Use Each Format:**
- **Simplified Format**: Best for most users, easier to read and maintain, supports all features through structured YAML
- **Native Format**: Advanced users who prefer H5P's syntax, useful when copying from existing H5P content

**Alternative Answers:**

Accept multiple correct answers for the same blank:

```yaml
- type: blanks
  title: "Flexible Answers"
  sentences:
    - text: "Water freezes at {blank} degrees Celsius."
      blanks:
        - answer: ["zero", "0", "0.0"]

    - text: "The color of the sky is {blank}."
      blanks:
        - answer: ["blue", "light blue", "azure"]
```

**Tips and Hints:**

Provide helpful hints that appear when students click the hint icon:

```yaml
- type: blanks
  title: "Science Quiz with Hints"
  sentences:
    - text: "Photosynthesis requires {blank}, water, and carbon dioxide."
      blanks:
        - answer: "sunlight"
          tip: "Think about what plants need from above"

    - text: "The speed of light is approximately {blank} km/s."
      blanks:
        - answer: "300000"
          tip: "About 300 thousand kilometers per second"
```

**Multiple Blanks Per Sentence:**

```yaml
- type: blanks
  title: "Complex Sentences"
  sentences:
    - text: "The {blank} is the {blank} planet from the Sun."
      blanks:
        - answer: "Earth"
          tip: "Our home planet"
        - answer: "third"
          tip: "Count from the Sun outward"

    - text: "{blank} is the capital of {blank}."
      blanks:
        - answer: "London"
        - answer: ["England", "United Kingdom", "UK"]
```

**Behavior Settings:**

Customize how the exercise behaves:

```yaml
- type: blanks
  title: "Customized Blanks"
  sentences:
    - text: "The capital of France is {blank}."
      blanks:
        - answer: "Paris"
  behaviour:
    caseSensitive: false           # Accept "paris", "PARIS", "Paris"
    acceptSpellingErrors: true     # Accept minor typos like "Parus"
    enableRetry: true              # Allow retry after checking
    enableSolutionsButton: true    # Show solution button
    autoCheck: false               # Manual check (not automatic)
    confirmRetryDialog: true       # Confirm before retry
```

**Key Settings:**
- `caseSensitive` (default: `true`) - Whether answers must match case exactly
- `acceptSpellingErrors` (default: `false`) - Allow minor spelling mistakes
- `enableRetry` (default: `true`) - Let students retry after checking
- `enableSolutionsButton` (default: `true`) - Show correct answers button
- `autoCheck` (default: `false`) - Check answers automatically as typed

**Media Support:**

Add images, videos, or audio above the exercise:

```yaml
- type: blanks
  title: "Visual Learning"
  taskDescription: "Answer questions about the image above"
  media:
    path: "./images/solar-system.jpg"
    type: "image"
    alt: "Diagram of the solar system"
  sentences:
    - text: "The planet closest to the Sun is {blank}."
      blanks:
        - answer: "Mercury"
```

**AI-Generated Fill in the Blanks:**

Generate exercises automatically from a prompt:

```yaml
- type: ai-blanks
  title: "Solar System Quiz"
  prompt: "Create fill-in-the-blank sentences about planets in our solar system"
  sentenceCount: 8
  blanksPerSentence: 1
  difficulty: "medium"
  aiConfig:
    targetAudience: "grade-6"
    tone: "educational"
```

**AI Parameters:**
- `prompt` (required) - What content to generate
- `sentenceCount` (default: 5) - Number of sentences to create
- `blanksPerSentence` (default: 1) - Blanks per sentence (1-3)
- `difficulty` - "easy", "medium", or "hard"
- `aiConfig` - Control reading level and tone

**Difficulty Levels:**
- `"easy"` - Simple vocabulary, 1 blank per sentence, straightforward answers
- `"medium"` - Moderate complexity, 1-2 blanks per sentence, requires thinking
- `"hard"` - Complex sentences, 2-3 blanks per sentence, academic terminology

**Example AI Blanks:**

```yaml
# Easy difficulty for elementary students
- type: ai-blanks
  title: "Animal Facts"
  prompt: "Create simple fill-in-the-blank sentences about common animals like dogs, cats, birds, and fish"
  sentenceCount: 5
  blanksPerSentence: 1
  difficulty: "easy"
  aiConfig:
    targetAudience: "elementary"
    tone: "playful"

# Hard difficulty for high school
- type: ai-blanks
  title: "Advanced Biology"
  prompt: "Create challenging fill-in-the-blank sentences about photosynthesis, cellular respiration, and energy transfer"
  sentenceCount: 6
  blanksPerSentence: 2
  difficulty: "hard"
  aiConfig:
    targetAudience: "high-school"
    tone: "technical"
```

**Complete Example:**

See [examples/yaml/blanks-example.yaml](examples/yaml/blanks-example.yaml) for comprehensive examples including:
- Simplified format with single and multiple blanks
- Native H5P format examples
- Alternative answers and tips
- Behavior customization
- Media integration
- AI-generated content at different difficulty levels

**What Gets Generated:**
- **2.2MB .h5p package** with 12 automatically bundled H5P libraries
- **Fully functional content** validated on h5p.com
- **AI-generated text** (typically 800-1500 characters per prompt)
- **AI-generated quizzes** with correct/incorrect feedback and retry functionality
- **Media files embedded** (images and audio)

**See Example:**
Check out [examples/yaml/biology-lesson.yaml](examples/yaml/biology-lesson.yaml) for a complete working example with AI text generation, images, audio, and quizzes.

## Contributing

We welcome contributions! To add a new content type or fix bugs:

1. **Fork the repository** and create a feature branch
2. **Follow the handler pattern** - See [Handler Development Guide](docs/developer-guides/Handler_Development_Guide.md)
3. **Write tests** - Ensure your handler has unit tests
4. **Update documentation** - Add examples and update this README
5. **Submit a pull request** - We'll review and provide feedback

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## ⚠️ Critical: H5P Library Versioning

**IMPORTANT:** H5P platforms are **strict about library versions**. If your generated package declares a library version that doesn't match what the platform expects, the content **will not render**.

### The Version Matching Problem

When you upload an H5P package to a platform (h5p.com, Moodle, WordPress, etc.), the platform validates that:
1. All declared library versions in `h5p.json` match the bundled libraries
2. All library references in `content.json` match the declared versions
3. The library versions are compatible with the platform's H5P core version

**Example of the issue:**
- Your package declares `H5P.Dialogcards 1.8` in h5p.json
- Your package bundles `H5P.Dialogcards-1.8` library files
- But the platform expects/requires `H5P.Dialogcards 1.9`
- **Result:** Content appears in editor but shows "Empty column" and doesn't render

### How to Fix Version Mismatches

**Step 1: Identify the Expected Version**
- Create sample content manually on the target platform
- Download the .h5p file
- Extract and check `h5p.json` to see which versions the platform uses

**Step 2: Update Your Cache**
- Place the correct version in `content-type-cache/`
- Use versioned filenames: `H5P.Dialogcards-1.9.h5p` (not just `H5P.Dialogcards.h5p`)
- The LibraryRegistry will automatically select the latest version in cache

**Step 3: Update Handler Code**
- Modify the handler to reference the correct version
- Example: Change `library: "H5P.Dialogcards 1.8"` to `library: "H5P.Dialogcards 1.9"`
- Located in: `src/handlers/embedded/DialogCardsHandler.ts` (or similar)

**Step 4: Rebuild and Verify**
```bash
# Rebuild package
npm run build
node ./dist/index.js interactivebook-ai ./examples/your-file.yaml ./output.h5p

# Verify versions in h5p.json
unzip -q -c output.h5p "h5p.json" | python3 -m json.tool | grep -A 3 "Dialogcards"

# Verify library files are bundled
unzip -l output.h5p | grep "H5P.Dialogcards"
```

### Debugging Version Issues

If content isn't rendering after upload:

1. **Check h5p.json dependencies** - Extract and verify all `preloadedDependencies` versions
2. **Check content.json library references** - Search for all `"library":` declarations
3. **Compare with working package** - Download a manually-created package from the same platform
4. **Verify library files** - Ensure the correct version directory is in the .h5p (e.g., `H5P.Dialogcards-1.9/`)
5. **Check library.json** - Inside the library directory, verify `majorVersion`, `minorVersion`, `patchVersion`

### Library Cache Management

The `content-type-cache/` directory stores H5P library packages:

```
content-type-cache/
├── H5P.InteractiveBook-1.11.h5p    ✅ Versioned (preferred)
├── H5P.Dialogcards-1.9.h5p         ✅ Versioned (preferred)
├── H5P.MultiChoice-1.16.h5p        ✅ Versioned (preferred)
└── H5P.Image.h5p                   ⚠️  Non-versioned (legacy)
```

**Best practices:**
- Always use versioned filenames when adding to cache
- Keep working packages from your target platform for reference
- Test generated packages on the same platform where they'll be deployed
- When updating a library, remove old versions from cache to avoid conflicts

### Common Version Pitfalls

❌ **Don't:**
- Mix library versions from different sources
- Assume version compatibility (1.8 ≠ 1.9)
- Use non-versioned cache filenames
- Skip testing on the target platform

✅ **Do:**
- Match versions to your target platform exactly
- Use versioned cache filenames
- Test on the deployment platform before distributing
- Keep working reference packages from the platform
- Document which platform/version combinations work

## Coding conventions
All classes that exist in the actual H5P libraries or content types start with `H5p`, e.g. `H5pImage`. All classes that are part of the creator and don't exist in external libraries or content types don't start with this prefix.
