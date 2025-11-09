# YAML Format Reference

## Overview

The Interactive Book AI module uses YAML format to define book structure and content. YAML is a human-readable data serialization format that's easier to read and write than JSON, especially for multi-line content.

## Basic Structure

```yaml
title: "Your Book Title"
language: "en"
description: "Optional book description"

chapters:
  - title: "Chapter 1"
    content:
      - type: text
        title: "Section Title"
        text: "Your content here"
```

## Top-Level Fields

### Required Fields

- **title** (string) - The title of your Interactive Book
- **language** (string) - Language code (e.g., "en", "de", "fr", "es")
- **chapters** (array) - Array of chapter definitions

### Optional Fields

- **description** (string) - Book description/subtitle
- **aiConfig** (object) - AI configuration for all AI-generated content in the book

## AI Configuration

Control how AI-generated content (ai-text and ai-quiz) is created with the `aiConfig` field. This system eliminates the need to include formatting instructions in every prompt, provides grade-appropriate content automatically, and ensures consistent AI output across your entire book.

### Book-Level Configuration

Apply configuration to all AI content in the book:

```yaml
title: "Biology Fundamentals"
language: "en"
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: "Focus on visual learners. Include real-world examples."

chapters:
  - title: "Photosynthesis"
    content:
      - type: ai-text
        prompt: "Explain photosynthesis"  # Clean and simple!
```

### Reading Levels

Choose from 8 predefined reading levels that control vocabulary complexity, sentence structure, and content style:

| Level | Grade/Age | Sentence Length | Best For |
|-------|-----------|----------------|----------|
| **elementary** | Grades 1-5 | 8-12 words | Young students, basic concepts |
| **grade-6** | Ages 11-12 | 12-15 words | **DEFAULT** - Middle school |
| **grade-9** | Ages 14-15 | 15-20 words | High school freshmen/sophomores |
| **high-school** | Grades 10-12 | 18-25 words | College prep, advanced topics |
| **college** | Undergraduate | Varies | University students, academic content |
| **professional** | Adult | Concise | Workplace training, industry content |
| **esl-beginner** | A1-A2 CEFR | 5-8 words | English learners (beginner) |
| **esl-intermediate** | B1-B2 CEFR | 10-15 words | English learners (intermediate) |

**Example - Elementary Level:**
```yaml
aiConfig:
  targetAudience: "elementary"
```
AI will use very simple vocabulary, short sentences, and concrete examples from everyday life.

**Example - College Level:**
```yaml
aiConfig:
  targetAudience: "college"
```
AI will use discipline-specific language, complex sentences, and assume background knowledge.

### Tone Options

Control the style and voice of generated content:

| Tone | Description | Best For |
|------|-------------|----------|
| **educational** | Clear, instructional, approachable | **DEFAULT** - Teaching content |
| **professional** | Formal, business-like, concise | Corporate training, professional development |
| **casual** | Conversational, friendly, relatable | Informal learning, social content |
| **academic** | Scholarly, research-oriented, precise | Research papers, scientific content |

**Example:**
```yaml
aiConfig:
  targetAudience: "high-school"
  tone: "academic"
```

### Customization Field

Add specific instructions for your unique teaching requirements using the free-text `customization` field:

```yaml
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: |
    Focus on visual learners
    Use analogies to explain complex concepts
    Include hands-on experiment ideas
    Connect to real-world environmental issues
```

**Common Customization Examples:**
- "Focus on visual learners"
- "Include real-world examples from medicine"
- "Use sports analogies when possible"
- "Emphasize practical application over theory"
- "Include mnemonics for memorization"
- "Connect concepts to AP Biology curriculum"

### Configuration Hierarchy

More specific configurations override general ones. This allows you to set defaults at the book level and customize for specific chapters or items:

```
System Defaults (grade-6, educational)
  ↓ (override)
Book-Level aiConfig
  ↓ (override)
Chapter-Level aiConfig
  ↓ (override)
Item-Level aiConfig
```

**Example - Chapter-Level Override:**
```yaml
title: "Mixed Difficulty Course"
language: "en"
aiConfig:
  targetAudience: "grade-6"  # Default for most chapters
  tone: "educational"

chapters:
  - title: "Introduction"
    content:
      - type: ai-text
        prompt: "Introduce quantum physics to beginners"
        # Uses book default: grade-6

  - title: "Advanced Topics"
    aiConfig:
      targetAudience: "college"  # Override for this chapter only
      tone: "academic"
    content:
      - type: ai-text
        prompt: "Explain quantum entanglement and Bell's theorem"
        # Uses chapter override: college, academic
```

**Example - Item-Level Override:**
```yaml
title: "ESL Science Course"
language: "en"
aiConfig:
  targetAudience: "esl-intermediate"  # Default for the book

chapters:
  - title: "The Water Cycle"
    content:
      - type: ai-text
        aiConfig:
          targetAudience: "esl-beginner"  # Simpler for intro
        prompt: "Explain what the water cycle is"
        title: "Introduction"

      - type: ai-text
        prompt: "Explain the stages of the water cycle in detail"
        title: "The Process"
        # Uses book default: esl-intermediate

      - type: ai-quiz
        aiConfig:
          targetAudience: "esl-beginner"  # Simpler quiz
          customization: "Use only present tense. Avoid idioms."
        sourceText: "The water cycle includes evaporation..."
        questionCount: 3
```

## Chapter Structure

Each chapter in the `chapters` array must have:

### Required Fields

- **title** (string) - Chapter title
- **content** (array) - Array of content items

### Optional Fields

- **aiConfig** (object) - Override book-level AI configuration for this chapter

## Content Types

### Static Content Types

#### Text Content

Manual text content with HTML formatting:

```yaml
- type: text
  title: "Section Title"
  text: |
    Your content here. Use multiple paragraphs by separating
    them with blank lines.

    This is a second paragraph.
```

**Fields:**
- `type: text` (required)
- `text` (string, required) - Content text (supports HTML: `<p>`, `<h2>`, `<strong>`, `<em>`, `<ul>`, `<li>`)
- `title` (string, optional) - Section title

#### Image Content

Images from local files or URLs:

```yaml
- type: image
  path: "./images/diagram.jpg"
  alt: "A diagram showing the process"
  title: "Cell Structure Diagram"
```

**Fields:**
- `type: image` (required)
- `path` (string, required) - Local file path or URL (http://, https://)
- `alt` (string, optional) - Alt text for accessibility
- `title` (string, optional) - Image caption

**Supported formats:** JPG, PNG, GIF, SVG

#### Audio Content

Audio files from local paths or URLs:

```yaml
- type: audio
  path: "./audio/narration.mp3"
  title: "Chapter Narration"
```

**Fields:**
- `type: audio` (required)
- `path` (string, required) - Local file path or URL
- `title` (string, optional) - Audio title/description

**Supported formats:** MP3, WAV, OGG

### AI-Powered Content Types

#### AI Text Generation

AI-generated educational text from prompts:

```yaml
- type: ai-text
  prompt: "Explain photosynthesis for middle school students"
  title: "What is Photosynthesis?"
  aiConfig:  # Optional: override book/chapter config
    targetAudience: "grade-6"
    tone: "educational"
```

**Fields:**
- `type: ai-text` (required)
- `prompt` (string, required) - Content prompt for AI (keep it simple!)
- `title` (string, optional) - Section title
- `aiConfig` (object, optional) - Override AI configuration for this item

**Best Practices:**
- ✅ Keep prompts simple and focused: "Explain photosynthesis"
- ✅ Use aiConfig for reading level instead of embedding it in prompt
- ✅ Trust the system to handle formatting automatically
- ❌ Don't include formatting instructions in prompts
- ❌ Don't specify sentence length or vocabulary (aiConfig does this)

**Before (Old Way):**
```yaml
- type: ai-text
  prompt: "Write about photosynthesis for 6th graders. Use simple sentences. No markdown. Use HTML tags. Include examples."
```

**After (New Way):**
```yaml
aiConfig:
  targetAudience: "grade-6"
  customization: "Include examples from everyday life"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain photosynthesis"  # Clean and simple!
```

#### AI Quiz Generation

AI-generated multiple choice questions from source text:

```yaml
- type: ai-quiz
  title: "Test Your Knowledge"
  questionCount: 5
  sourceText: |
    Photosynthesis is the process by which plants use sunlight,
    water and carbon dioxide to create oxygen and energy in the
    form of sugar (glucose).

    This process occurs in the chloroplasts of plant cells.
  aiConfig:  # Optional: override book/chapter config
    targetAudience: "grade-6"
```

**Fields:**
- `type: ai-quiz` (required)
- `sourceText` (string, required) - Content to generate questions about
- `questionCount` (number, optional) - Number of questions (default: 5)
- `title` (string, optional) - Quiz title
- `aiConfig` (object, optional) - Override AI configuration for quiz difficulty

**Best Practices:**
- Provide comprehensive source text with all key concepts
- Include definitions of important terms
- 5 questions per topic is usually ideal
- Source text should be 200-500 words for good question variety

### Embedded Content Types

#### Flashcards

Embedded flashcard decks for memorization:

```yaml
- type: flashcards
  title: "Vocabulary Review"
  description: "Learn these key terms"
  cards:
    - question: "What is photosynthesis?"
      answer: "The process plants use to convert sunlight into energy"
      tip: "Think about how plants eat"

    - question: "What is chlorophyll?"
      answer: "The green pigment in plants that captures sunlight"
```

**Fields:**
- `type: flashcards` (required)
- `cards` (array, required) - Array of flashcard objects
  - `question` (string, required) - Front of card
  - `answer` (string, required) - Back of card
  - `tip` (string, optional) - Hint text
- `title` (string, optional) - Flashcard deck title
- `description` (string, optional) - Instructions for students

#### Dialog Cards

Dialog cards for language learning and Q&A:

```yaml
- type: dialogcards
  title: "Planet Facts"
  mode: "normal"
  cards:
    - front: "Jupiter"
      back: "The largest planet in our solar system"

    - front: "Saturn"
      back: "Famous for its beautiful ring system"
```

**Fields:**
- `type: dialogcards` (required)
- `cards` (array, required) - Array of dialog card objects
  - `front` (string, required) - Front text
  - `back` (string, required) - Back text
- `title` (string, optional) - Dialog cards title
- `mode` (string, optional) - Display mode: "normal" or "repetition" (default: "normal")

## Complete Example

```yaml
title: "Introduction to Biology"
language: "en"
description: "A comprehensive introduction to fundamental biological concepts"

# Book-level AI configuration
aiConfig:
  targetAudience: "grade-9"
  tone: "educational"
  customization: |
    Focus on visual learners
    Include real-world medical examples
    Use analogies to explain complex processes

chapters:
  # Chapter 1: Introduction (uses book-level config)
  - title: "What is Biology?"
    content:
      - type: ai-text
        prompt: "Explain what biology is and why it matters"
        title: "Welcome to Biology"

      - type: image
        path: "./images/cell-structure.jpg"
        alt: "Diagram of a typical plant cell"
        title: "Basic Cell Structure"

  # Chapter 2: Advanced topic (override to college level)
  - title: "Cellular Respiration"
    aiConfig:
      targetAudience: "college"  # More advanced for this chapter
      tone: "academic"
    content:
      - type: ai-text
        prompt: "Explain the Krebs cycle and electron transport chain"
        title: "Energy Production in Cells"

      - type: ai-quiz
        title: "Cellular Respiration Quiz"
        questionCount: 8
        sourceText: |
          Cellular respiration is the process by which cells convert
          glucose into ATP (adenosine triphosphate), the energy currency
          of the cell. This process occurs in three main stages...

  # Chapter 3: Review (simplified for ESL students)
  - title: "Review and Summary"
    content:
      - type: ai-text
        aiConfig:
          targetAudience: "esl-intermediate"  # Item-level override
          customization: "Use simple present tense. Avoid idioms."
        prompt: "Summarize the key concepts we've learned"
        title: "What We've Learned"

      - type: flashcards
        title: "Key Terms Review"
        cards:
          - question: "What is ATP?"
            answer: "The energy molecule cells use for fuel"
            tip: "Think of it as the battery of the cell"
```

## YAML Tips

### Multiline Strings

Use the pipe `|` syntax for multi-paragraph text:

```yaml
text: |
  This is the first paragraph.
  It continues on this line.

  This is a second paragraph after a blank line.
```

### Quoting

Quotes are optional but recommended for strings with special characters:

```yaml
title: "Biology: The Study of Life"  # Has colon, needs quotes
prompt: Explain photosynthesis  # No special chars, quotes optional
```

### Comments

Use `#` for comments:

```yaml
# This is a comment
title: "My Book"  # Inline comment
```

### Arrays

Two formats are supported:

```yaml
# Flow style (inline)
tags: [biology, science, education]

# Block style (recommended for complex items)
chapters:
  - title: "Chapter 1"
    content:
      - type: text
        text: "Content here"
```

## Validation

The system validates your YAML and provides clear error messages:

**Invalid reading level:**
```
Error: Invalid targetAudience: 'advanced'.
Valid options: elementary, grade-6, grade-9, high-school, college, professional, esl-beginner, esl-intermediate
```

**Invalid tone:**
```
Error: Invalid tone: 'funny'.
Valid options: educational, professional, casual, academic
```

**Missing required field:**
```
Error: AI-text content must have a 'prompt' field (string)
```

## Migration from Old Format

If you have existing YAML files with formatting instructions embedded in prompts, they still work! The aiConfig system is optional and backward compatible.

**Old format (still works):**
```yaml
- type: ai-text
  prompt: "Explain photosynthesis. Use simple sentences for 6th graders. No markdown."
```

**New format (recommended):**
```yaml
aiConfig:
  targetAudience: "grade-6"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain photosynthesis"
```

Benefits of migrating:
- ✅ Cleaner, more readable prompts
- ✅ Consistent reading level across all content
- ✅ Easier to change reading level for entire book
- ✅ Better AI output quality with system-managed prompts

See [AI Configuration Migration Guide](ai-config-migration-guide.md) for detailed migration instructions.

## See Also

- [AI Configuration Migration Guide](ai-config-migration-guide.md) - Step-by-step migration from old to new format
- [Teacher's Guide: AI Configuration](teacher-guide-ai-config.md) - Choosing reading levels and using customization
- [Prompt Engineering Reference](prompt-engineering.md) - How system prompts work internally
- [API Integration Guide](api-integration.md) - Using AI configuration in JSON API requests
- [Reading Level Guide](reading-level-guide.md) - Detailed explanation of each reading level
