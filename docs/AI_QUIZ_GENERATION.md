# AI Quiz Generation with Claude

This document describes how to use the AI-powered quiz generation feature to automatically create H5P.MultipleChoice content from educational text.

## Overview

The QuizGenerator uses Claude AI to analyze educational content and generate well-formed multiple-choice quiz questions. These questions are automatically formatted as H5P.MultipleChoice content and can be integrated into Interactive Books.

## Setup

### 1. Install Dependencies

```bash
npm install
```

This will install `@anthropic-ai/sdk` and other required dependencies.

### 2. Get Anthropic API Key

1. Visit [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key

### 3. Configure API Key

**Option A: Environment Variable**
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

**Option B: .env File**
```bash
# Create .env file in project root
cp .env.example .env

# Edit .env and add your key
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

### 4. Build Project

```bash
npm run build
```

## Basic Usage

### Generate Quiz from Text

```typescript
import { QuizGenerator } from "./src/ai/QuizGenerator";

const generator = new QuizGenerator();

const educationalText = `
Photosynthesis is the process by which plants convert light energy
into chemical energy. It requires sunlight, water, and carbon dioxide,
and produces glucose and oxygen as outputs.
`;

// Generate 5 quiz questions
const quizContent = await generator.generateH5pQuiz(educationalText, 5);

// quizContent is now an array of H5P.MultipleChoice structures
```

### Integrate with ContentBuilder

```typescript
import { LibraryRegistry } from "./src/compiler/LibraryRegistry";
import { SemanticValidator } from "./src/compiler/SemanticValidator";
import { ContentBuilder } from "./src/compiler/ContentBuilder";
import { QuizGenerator } from "./src/ai/QuizGenerator";

// Initialize components
const registry = new LibraryRegistry();
const validator = new SemanticValidator();
await registry.fetchLibrary("H5P.InteractiveBook");

// Create book
const builder = new ContentBuilder(registry, validator);
builder.createBook("My Learning Module", "en");

// Add educational content chapter
const chapter1 = builder.addChapter("Lesson Content");
chapter1.addTextPage("Introduction", educationalText);

// Generate and add quiz chapter
const generator = new QuizGenerator();
const quizContent = await generator.generateH5pQuiz(educationalText, 5);

const chapter2 = builder.addChapter("Test Your Knowledge");
chapter2.addTextPage("Quiz", "Answer these questions to check your understanding.");
chapter2.addQuizPage(quizContent);

// Build and validate
const bookContent = builder.build();
const validation = builder.validate();

if (!validation.valid) {
  console.error("Validation errors:", validation.errors);
}
```

## Complete Example

See `examples/ai-quiz-demo.ts` for a complete working example that:
1. Generates quiz questions from sample text
2. Builds an Interactive Book with quiz content
3. Assembles a complete .h5p package
4. Saves to file system

Run the demo:
```bash
npm run build
node dist/examples/ai-quiz-demo.js
```

## API Reference

### QuizGenerator

#### Constructor
```typescript
new QuizGenerator(apiKey?: string)
```
- `apiKey`: Optional API key (defaults to `process.env.ANTHROPIC_API_KEY`)

#### Methods

##### generateQuiz()
```typescript
async generateQuiz(sourceText: string, questionCount?: number): Promise<QuizContent>
```
Generates quiz questions from source text.

**Parameters:**
- `sourceText`: Educational text to generate questions from
- `questionCount`: Number of questions to generate (default: 5)

**Returns:** `QuizContent` with questions array

##### parseAIResponse()
```typescript
parseAIResponse(response: string): QuizQuestion[]
```
Parses Claude API response into structured quiz questions.

**Parameters:**
- `response`: Raw text response from Claude API

**Returns:** Array of `QuizQuestion` objects

##### toH5pFormat()
```typescript
toH5pFormat(questions: QuizQuestion[]): H5pMultipleChoiceContent[]
```
Converts quiz questions to H5P.MultipleChoice format.

**Parameters:**
- `questions`: Array of quiz questions

**Returns:** Array of H5P.MultipleChoice content structures

##### generateH5pQuiz()
```typescript
async generateH5pQuiz(sourceText: string, questionCount?: number): Promise<H5pMultipleChoiceContent[]>
```
Convenience method combining generation and formatting.

**Parameters:**
- `sourceText`: Educational text to generate questions from
- `questionCount`: Number of questions to generate (default: 5)

**Returns:** Array of H5P.MultipleChoice content structures ready for ContentBuilder

### ChapterBuilder

#### addQuizPage()
```typescript
addQuizPage(quizContent: H5pMultipleChoiceContent[]): this
```
Adds AI-generated quiz questions to a chapter.

**Parameters:**
- `quizContent`: Array of H5P.MultipleChoice structures from QuizGenerator

**Returns:** ChapterBuilder for method chaining

## Generated Quiz Structure

Each quiz question includes:
- **Question text**: Clear, concise question
- **4 answer options**: One correct, three incorrect
- **Feedback**: Custom messages for correct/incorrect answers
- **Behavior settings**: Retry enabled, show solutions, randomize answers
- **UI strings**: Fully localized interface text

Example structure:
```typescript
{
  library: "H5P.MultipleChoice 1.16",
  params: {
    question: "What is photosynthesis?",
    answers: [
      { text: "Correct answer", correct: true, ... },
      { text: "Incorrect answer 1", correct: false, ... },
      { text: "Incorrect answer 2", correct: false, ... },
      { text: "Incorrect answer 3", correct: false, ... }
    ],
    behaviour: {
      enableRetry: true,
      enableSolutionsButton: true,
      randomAnswers: true,
      ...
    }
  },
  metadata: {
    contentType: "Multiple Choice",
    license: "U",
    title: "Quiz Question 1"
  }
}
```

## Error Handling

### API Connection Errors
```typescript
try {
  const quizContent = await generator.generateQuiz(text);
} catch (error) {
  console.error("Quiz generation failed:", error.message);
  // Provide fallback quiz or inform user
}
```

### Invalid Responses
The QuizGenerator will throw errors for:
- Malformed JSON in AI response
- Questions missing correct answers
- Invalid answer structures

Handle these gracefully:
```typescript
try {
  const questions = generator.parseAIResponse(response);
} catch (error) {
  console.error("Failed to parse AI response:", error.message);
  // Retry or use manual quiz
}
```

## Best Practices

### Source Text Quality
- **Length**: 100-1000 words optimal
- **Clarity**: Well-written, educational content
- **Structure**: Clear concepts and facts
- **Topic**: Focused on single subject

### Question Count
- **Short text** (100-300 words): 3-5 questions
- **Medium text** (300-600 words): 5-8 questions
- **Long text** (600+ words): 8-12 questions

### Integration
- Add quiz chapter AFTER educational content
- Provide intro text before quiz
- Consider adding summary after quiz
- Validate before assembling package

### API Usage
- Cache generated quizzes when possible
- Handle API failures gracefully
- Monitor API usage and costs
- Implement retry logic for production

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
Set the environment variable or pass API key to constructor:
```typescript
const generator = new QuizGenerator("sk-ant-...");
```

### "Quiz generation failed"
- Check internet connection
- Verify API key is valid
- Check Anthropic API status
- Review source text quality

### Questions seem low quality
- Improve source text clarity
- Increase text length
- Try regenerating with same text
- Adjust prompt template (advanced)

### Quiz not displaying in H5P
- Verify ContentBuilder.validate() passes
- Check H5P.MultipleChoice library version
- Ensure all dependencies resolved
- Inspect content.json structure

## Limitations

- **Content Type**: Only H5P.MultipleChoice currently supported
- **Language**: English optimized (other languages work but not tuned)
- **Question Types**: Multiple choice only (4 options)
- **Validation**: Basic structural validation only
- **Caching**: Not implemented (regenerates each time)

## Future Enhancements

- Support for True/False questions
- Fill-in-the-blank questions
- Image-based questions
- Multi-language optimization
- Answer quality scoring
- Difficulty level control
- Quiz caching

## Resources

- [Anthropic API Documentation](https://docs.anthropic.com/)
- [H5P.MultipleChoice Documentation](https://h5p.org/documentation/content-authors/multiple-choice)
- [Example Script](../examples/ai-quiz-demo.ts)
- [Phase 5 Implementation Summary](../agent-os/specs/template-free-h5p-compiler-poc/phase5-implementation-summary.md)

## Support

For issues or questions:
1. Check this documentation
2. Review examples/ai-quiz-demo.ts
3. Check error messages and troubleshooting section
4. Verify API key and setup
5. Test with simple example first
