# Prompt Engineering Reference

## Overview

This document explains how the AI Configuration System constructs prompts internally. This is technical documentation for developers and advanced users who want to understand the prompt engineering strategy.

**For teachers:** See the [Teacher's Guide](teacher-guide-ai-config.md) instead for practical usage instructions.

## System Architecture

The `AIPromptBuilder` service is a stateless, universal prompt construction utility that works across all AI-generated H5P content types. It centralizes all prompt engineering logic in one place.

### Core Principle

Teachers write **simple content prompts**:
```
"Explain photosynthesis"
```

The system automatically adds **all technical requirements**:
- Non-negotiable HTML formatting rules
- Reading level-specific vocabulary guidance
- Sentence structure specifications
- Tone and style requirements
- Custom instructions (if provided)

## Prompt Structure

Every AI request includes three sections combined in this order:

```
┌─────────────────────────────────────────────────────────┐
│ SECTION 1: System Prompt                                │
│ - Formatting rules (HTML only, no markdown)            │
│ - Reading level guidance (vocabulary, sentences)       │
│ - Tone specification (educational, professional, etc.) │
├─────────────────────────────────────────────────────────┤
│ SECTION 2: User's Content Prompt                       │
│ - Teacher's simple prompt ("Explain photosynthesis")   │
├─────────────────────────────────────────────────────────┤
│ SECTION 3: Customization (Optional)                    │
│ - Free-text instructions from teacher                  │
│ - Additional context or requirements                   │
└─────────────────────────────────────────────────────────┘
```

## Section 1: System Prompt

### Formatting Rules (Non-Negotiable)

These rules are **ALWAYS included** in every AI request and are **NEVER exposed to teachers**:

```
CRITICAL FORMATTING REQUIREMENTS (NON-NEGOTIABLE):
- Use ONLY plain HTML tags: <p>, <h2>, <strong>, <em>, <ul>, <li>
- Wrap all paragraphs in <p> tags
- Use <h2> for section headings only (not <h1> or <h3>)
- Use <strong> for emphasis, <em> for italics
- Use <ul> and <li> for lists
- DO NOT use markdown formatting (no **, no *, no #, no -)
- DO NOT use special characters for formatting
- DO NOT use code blocks or syntax highlighting
- Separate paragraphs with blank lines for readability
- Output valid, clean HTML that renders correctly in H5P Interactive Books
```

**Why non-negotiable?**
- H5P requires specific HTML formatting
- Markdown breaks H5P rendering
- Consistency across all generated content
- Teachers shouldn't need to know these technical details

### Reading Level Guidance

Based on `aiConfig.targetAudience`, the system includes specific guidance:

#### Elementary (grades 1-5)

```
READING LEVEL: ELEMENTARY
Use very short sentences (8-12 words). Avoid complex sentence structures.
Use simple, everyday vocabulary. Avoid technical terms. If a technical term is necessary, explain it in very simple words.
Use a friendly, encouraging tone. Break concepts into very small steps.
Use concrete, tangible examples from everyday life. Avoid abstract concepts.
```

**Example AI output:**
```html
<p>Plants make food from sunlight. This process is called photosynthesis. Plants use water from the ground and air from outside. Then they make sugar to eat.</p>
```

#### Grade 6 (ages 11-12) - DEFAULT

```
READING LEVEL: GRADE-6
Use medium-length sentences (12-15 words). Keep structure clear and direct.
Use grade-appropriate vocabulary. Define technical terms when first introduced. Build on concepts students already know.
Use a clear, instructional tone. Make concepts relatable to students' lives.
Use relatable examples from school, home, and popular culture. Include analogies when helpful.
```

**Example AI output:**
```html
<h2>What is Photosynthesis?</h2>

<p>Photosynthesis is how plants create their own food using sunlight. During this process, plants take in carbon dioxide from the air and water from their roots. Using energy from the sun, they convert these ingredients into glucose (a type of sugar) and release oxygen as a byproduct.</p>

<p>Think of it like a kitchen inside every leaf, where plants cook up energy using sunlight, water, and air as ingredients. As a bonus, plants release oxygen - the air we breathe - as a pleasant side effect.</p>
```

#### Grade 9 (ages 14-15)

```
READING LEVEL: GRADE-9
Use longer sentences (15-20 words) with some complexity. Vary sentence structure for engagement.
Use broader vocabulary. Introduce technical terms with brief definitions. Expect increasing subject knowledge.
Use an engaging, analytical tone. Encourage critical thinking.
Use real-world applications and current events. Connect to broader themes.
```

**Example AI output:**
```html
<h2>The Process of Photosynthesis</h2>

<p>Photosynthesis is a complex biochemical process that allows plants, algae, and some bacteria to convert light energy into chemical energy stored in glucose molecules. This process occurs primarily in the chloroplasts of plant cells, specifically within specialized structures called thylakoids.</p>

<p>The overall reaction can be summarized as: carbon dioxide plus water, in the presence of light energy and chlorophyll, yields glucose and oxygen. However, this simplification masks the intricate series of light-dependent and light-independent reactions that make up the complete process.</p>
```

#### High School (grades 10-12)

```
READING LEVEL: HIGH-SCHOOL
Use complex sentences (18-25 words) with varied structure. Expect comprehension of compound ideas.
Use advanced vocabulary and subject-specific terminology. Define only highly specialized terms.
Use a sophisticated, academic tone. Promote analysis and evaluation.
Use college-level examples, research references, and interdisciplinary connections.
```

**Example AI output:**
```html
<h2>Photosynthetic Mechanisms in Plant Systems</h2>

<p>Photosynthesis represents one of the most fundamental processes sustaining life on Earth, converting electromagnetic radiation from the sun into chemical energy through an intricate series of light-dependent and light-independent reactions that occur within the chloroplast organelles of eukaryotic plant cells.</p>

<p>The light reactions, occurring in the thylakoid membranes, generate ATP and NADPH through photophosphorylation and the photolysis of water, while simultaneously producing molecular oxygen as a byproduct. These high-energy molecules are subsequently utilized in the Calvin cycle, a light-independent process that fixes atmospheric carbon dioxide into organic compounds through a cyclic series of enzymatic reactions catalyzed by ribulose-1,5-bisphosphate carboxylase/oxygenase (RuBisCO).</p>
```

#### College Level

```
READING LEVEL: COLLEGE
Use academic sentence structures of varying complexity. Expect comprehension of dense text.
Use discipline-specific language freely. Assume foundational knowledge in the subject area.
Use a scholarly, precise tone. Encourage synthesis and original thought.
Reference research, theories, and debates in the field. Assume intellectual maturity.
```

#### Professional/Adult

```
READING LEVEL: PROFESSIONAL
Use concise, efficient sentences. Get to the point quickly.
Use industry-standard terminology. Assume professional expertise.
Use a professional, actionable tone. Focus on practical application.
Use industry case studies, best practices, and real-world scenarios. Emphasize ROI and outcomes.
```

#### ESL Beginner (A1-A2 CEFR)

```
READING LEVEL: ESL-BEGINNER
Use very short, simple sentences (5-8 words). Use subject-verb-object order consistently.
Use only common, high-frequency vocabulary (top 1000-2000 words). Avoid idioms and slang.
Use a patient, supportive tone. Repeat key concepts. Use explicit context.
Use universal concepts (food, family, weather, time). Avoid culturally specific references.
```

**Example AI output:**
```html
<p>Plants need sun. Plants need water. Plants make food. This is photosynthesis. Plants give us air. We need air. We need plants.</p>
```

#### ESL Intermediate (B1-B2 CEFR)

```
READING LEVEL: ESL-INTERMEDIATE
Use medium sentences (10-15 words). Introduce varied sentence patterns gradually.
Expand vocabulary to everyday situations. Introduce common idioms with explanations. Use multiple tenses.
Use a clear, encouraging tone. Build confidence with scaffolded complexity.
Include cultural context when introducing idioms. Use travel, work, and education scenarios.
```

### Tone Specification

Based on `aiConfig.tone`, additional style guidance is added:

#### Educational (DEFAULT)

```
TONE: EDUCATIONAL
Use a clear, instructional, and approachable tone. Make learning engaging and accessible. Explain concepts step-by-step.
```

#### Professional

```
TONE: PROFESSIONAL
Use a formal, business-like tone. Be concise and action-oriented. Focus on practical outcomes.
```

#### Casual

```
TONE: CASUAL
Use a conversational, friendly tone. Write as if talking to a peer. Be relatable and warm.
```

#### Academic

```
TONE: ACADEMIC
Use a scholarly, research-oriented tone. Be precise and objective. Support claims with evidence.
```

## Complete Prompt Examples

### Example 1: Default Configuration

**Teacher's input:**
```yaml
aiConfig:
  # Not specified - uses defaults

chapters:
  - content:
      - type: ai-text
        prompt: "Explain photosynthesis"
```

**Complete prompt sent to AI:**
```
You are an expert educational content generator creating content for H5P Interactive Books.

CRITICAL FORMATTING REQUIREMENTS (NON-NEGOTIABLE):
- Use ONLY plain HTML tags: <p>, <h2>, <strong>, <em>, <ul>, <li>
- Wrap all paragraphs in <p> tags
- Use <h2> for section headings only (not <h1> or <h3>)
- Use <strong> for emphasis, <em> for italics
- Use <ul> and <li> for lists
- DO NOT use markdown formatting (no **, no *, no #, no -)
- DO NOT use special characters for formatting
- DO NOT use code blocks or syntax highlighting
- Separate paragraphs with blank lines for readability
- Output valid, clean HTML that renders correctly in H5P Interactive Books

READING LEVEL: GRADE-6
Use medium-length sentences (12-15 words). Keep structure clear and direct.
Use grade-appropriate vocabulary. Define technical terms when first introduced. Build on concepts students already know.
Use a clear, instructional tone. Make concepts relatable to students' lives.
Use relatable examples from school, home, and popular culture. Include analogies when helpful.

TONE: EDUCATIONAL
Use a clear, instructional, and approachable tone. Make learning engaging and accessible. Explain concepts step-by-step.

---

Explain photosynthesis
```

### Example 2: High School with Customization

**Teacher's input:**
```yaml
aiConfig:
  targetAudience: "high-school"
  tone: "academic"
  customization: "Include connections to AP Biology curriculum. Reference cellular respiration."

chapters:
  - content:
      - type: ai-text
        prompt: "Explain photosynthesis"
```

**Complete prompt sent to AI:**
```
You are an expert educational content generator creating content for H5P Interactive Books.

CRITICAL FORMATTING REQUIREMENTS (NON-NEGOTIABLE):
[... formatting rules ...]

READING LEVEL: HIGH-SCHOOL
Use complex sentences (18-25 words) with varied structure. Expect comprehension of compound ideas.
Use advanced vocabulary and subject-specific terminology. Define only highly specialized terms.
Use a sophisticated, academic tone. Promote analysis and evaluation.
Use college-level examples, research references, and interdisciplinary connections.

TONE: ACADEMIC
Use a scholarly, research-oriented tone. Be precise and objective. Support claims with evidence.

---

Explain photosynthesis

ADDITIONAL CUSTOMIZATION:
Include connections to AP Biology curriculum. Reference cellular respiration.
```

### Example 3: ESL Beginner with Customization

**Teacher's input:**
```yaml
aiConfig:
  targetAudience: "esl-beginner"
  tone: "educational"
  customization: "Use only present tense. Repeat key words. Include visual descriptions."

chapters:
  - content:
      - type: ai-text
        prompt: "Explain photosynthesis"
```

**Complete prompt sent to AI:**
```
You are an expert educational content generator creating content for H5P Interactive Books.

CRITICAL FORMATTING REQUIREMENTS (NON-NEGOTIABLE):
[... formatting rules ...]

READING LEVEL: ESL-BEGINNER
Use very short, simple sentences (5-8 words). Use subject-verb-object order consistently.
Use only common, high-frequency vocabulary (top 1000-2000 words). Avoid idioms and slang.
Use a patient, supportive tone. Repeat key concepts. Use explicit context.
Use universal concepts (food, family, weather, time). Avoid culturally specific references.

TONE: EDUCATIONAL
Use a clear, instructional, and approachable tone. Make learning engaging and accessible. Explain concepts step-by-step.

---

Explain photosynthesis

ADDITIONAL CUSTOMIZATION:
Use only present tense. Repeat key words. Include visual descriptions.
```

## Quiz Question Generation

For `ai-quiz` content types, additional reading-level-specific quiz guidance is added:

### Elementary Quiz Guidance

```
- Use very simple vocabulary in questions and answers
- Questions should test basic comprehension only
- Avoid complex sentence structures in questions
```

### Grade 6 Quiz Guidance

```
- Use grade-appropriate vocabulary
- Include some application questions beyond recall
- Keep questions clear and direct
```

### High School Quiz Guidance

```
- Use advanced vocabulary and subject terminology
- Focus on analysis, evaluation, and synthesis
- Test critical thinking skills
```

### ESL Beginner Quiz Guidance

```
- Use only common, high-frequency vocabulary
- Keep questions very simple and direct
- Avoid idioms and complex grammar
```

## Configuration Resolution

When multiple configurations exist, the system uses this precedence:

```
Item-level aiConfig
  ↓ (highest priority)
Chapter-level aiConfig
  ↓
Book-level aiConfig
  ↓
System defaults (grade-6, educational, plain-html)
  ↓ (lowest priority)
```

**Example:**
```yaml
aiConfig:
  targetAudience: "grade-6"    # Book level
  tone: "educational"

chapters:
  - title: "Chapter 1"
    aiConfig:
      targetAudience: "college"  # Chapter level (overrides book)
    content:
      - type: ai-text
        aiConfig:
          tone: "academic"       # Item level (overrides chapter & book)
        prompt: "Explain quantum physics"
```

**Resolved configuration for this item:**
```typescript
{
  targetAudience: "college",      // From chapter level
  tone: "academic",               // From item level
  outputStyle: "plain-html",      // From system defaults
  customization: undefined        // Not specified
}
```

## Implementation Details

### AIPromptBuilder Class

Located at `src/ai/AIPromptBuilder.ts`:

```typescript
export class AIPromptBuilder {
  /**
   * Builds system prompt with formatting rules and reading level guidance
   */
  public static buildSystemPrompt(config?: AIConfiguration): string {
    const targetAudience = config?.targetAudience || "grade-6";
    const tone = config?.tone || "educational";

    const readingLevel = this.READING_LEVELS[targetAudience];
    const toneGuidance = this.TONES[tone];

    return `
You are an expert educational content generator creating content for H5P Interactive Books.

${this.FORMATTING_RULES}

READING LEVEL: ${targetAudience.toUpperCase()}
${readingLevel.sentenceLength}
${readingLevel.vocabulary}
${readingLevel.style}
${readingLevel.examples}

TONE: ${tone.toUpperCase()}
${toneGuidance}
    `.trim();
  }

  /**
   * Builds complete prompt ready for AI API call
   */
  public static buildCompletePrompt(
    userPrompt: string,
    config?: AIConfiguration
  ): string {
    const systemPrompt = this.buildSystemPrompt(config);
    const customization = config?.customization?.trim();

    let completePrompt = systemPrompt;
    completePrompt += "\n\n---\n\n";
    completePrompt += userPrompt;

    if (customization) {
      completePrompt += "\n\n";
      completePrompt += `ADDITIONAL CUSTOMIZATION:\n${customization}`;
    }

    return completePrompt;
  }

  /**
   * Resolves configuration hierarchy
   */
  public static resolveConfig(
    itemConfig?: AIConfiguration,
    chapterConfig?: AIConfiguration,
    bookConfig?: AIConfiguration
  ): AIConfiguration {
    return {
      targetAudience:
        itemConfig?.targetAudience ||
        chapterConfig?.targetAudience ||
        bookConfig?.targetAudience ||
        "grade-6",
      tone:
        itemConfig?.tone ||
        chapterConfig?.tone ||
        bookConfig?.tone ||
        "educational",
      outputStyle:
        itemConfig?.outputStyle ||
        chapterConfig?.outputStyle ||
        bookConfig?.outputStyle ||
        "plain-html",
      customization:
        itemConfig?.customization ||
        chapterConfig?.customization ||
        bookConfig?.customization ||
        undefined
    };
  }
}
```

### Usage in Handlers

AITextHandler example:

```typescript
export class AITextHandler implements ContentHandler {
  public async process(context: HandlerContext, item: AITextContent): Promise<void> {
    // Resolve configuration hierarchy
    const resolvedConfig = AIPromptBuilder.resolveConfig(
      item.aiConfig,
      context.chapterConfig,
      context.bookConfig
    );

    // Build complete prompt
    const completePrompt = AIPromptBuilder.buildCompletePrompt(
      item.prompt,
      resolvedConfig
    );

    // Send to AI provider (Gemini or Claude)
    const generatedText = await this.callAI(completePrompt);

    // Add to chapter
    context.chapterBuilder.addTextPage(item.title, generatedText);
  }
}
```

## Best Practices

### For Developers

1. **Always use AIPromptBuilder** - Don't construct prompts manually
2. **Never expose formatting rules to users** - Keep them system-managed
3. **Respect configuration hierarchy** - Item > Chapter > Book > Defaults
4. **Test across all reading levels** - Ensure consistent quality
5. **Log prompts in verbose mode** - For debugging and optimization

### For Advanced Users

1. **Trust the system prompts** - Don't duplicate guidance in your content prompts
2. **Use customization sparingly** - Only for unique requirements not covered by reading level
3. **Be specific in customization** - "Include medical examples" is better than "make it interesting"
4. **Test AI output** - Verify it meets your needs before distributing to students
5. **Consider configuration hierarchy** - Use book-level for consistency, item-level for exceptions

## Debugging

### Viewing Complete Prompts

Run with `--verbose` flag:

```bash
node ./dist/index.js interactivebook-ai ./lesson.yaml ./output.h5p --verbose
```

Output includes:
```
  - Generating AI text: "What is Photosynthesis?"
    Reading level: grade-6
    Tone: educational
    Prompt: "Explain photosynthesis..."
    Using Gemini 2.5 Flash
    Generated 856 characters
```

### Common Issues

**Issue:** AI output uses markdown (`**bold**`)
**Cause:** Formatting rules not included in prompt
**Solution:** Verify AIPromptBuilder is being used

**Issue:** Content too advanced/simple for students
**Cause:** Incorrect reading level
**Solution:** Adjust `targetAudience` in aiConfig

**Issue:** Inconsistent difficulty across chapters
**Cause:** Missing book-level configuration
**Solution:** Set aiConfig at book level for consistency

## See Also

- [Teacher's Guide](teacher-guide-ai-config.md) - Practical usage for teachers
- [YAML Format Reference](yaml-format.md) - Complete YAML syntax
- [API Integration Guide](api-integration.md) - Using in web applications
- [Reading Level Guide](reading-level-guide.md) - Detailed reading level descriptions
