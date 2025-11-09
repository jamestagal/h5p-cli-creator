# AI Configuration Migration Guide

## Overview

This guide helps you migrate existing YAML files to use the new AI Configuration system introduced in Phase 5.

**Important:** Migration is **100% optional**. All existing YAML files continue to work unchanged with grade-6 defaults. The new system provides better control and cleaner YAML, but your old files will never break.

## Why Migrate?

### Benefits of the New System

1. **Cleaner YAML Files**
   - Prompts are 60-70% shorter
   - No repetitive formatting instructions
   - Focus on content, not technical requirements

2. **Consistent Output**
   - All AI-generated content follows same formatting rules
   - No risk of forgetting instructions in one prompt
   - System guarantees H5P-compatible HTML

3. **Better Control**
   - Explicit reading level selection (8 options)
   - Predictable vocabulary and sentence complexity
   - Easy to adjust for different audiences

4. **Flexible Configuration**
   - Set defaults at book level
   - Override at chapter level for mixed-level books
   - Override at item level for special cases
   - Customization field for advanced requirements

5. **Easier Maintenance**
   - Change reading level for entire book in one place
   - Update formatting rules centrally (no YAML changes needed)
   - Less prone to copy-paste errors

### What Stays the Same

- All existing YAML files work unchanged
- Default behavior: grade-6 reading level, educational tone
- Same .h5p output format
- Same CLI commands and options
- Same AI providers (Gemini, Claude)

## Migration Process

### Step-by-Step Guide

#### Step 1: Analyze Your Current Prompts

Look at your existing ai-text and ai-quiz prompts. Identify:

1. **Embedded formatting instructions**
   - "Use plain text only"
   - "No markdown formatting"
   - "No asterisks for bold"
   - "Write naturally with proper paragraphs"

2. **Reading level hints**
   - "for middle school students"
   - "for high school students"
   - "for professionals"
   - "simple language"
   - "advanced concepts"

3. **Tone indicators**
   - "clear, educational summary"
   - "scholarly explanation"
   - "casual, conversational"
   - "business-like"

**Example old prompt:**
```yaml
- type: ai-text
  prompt: "Write a clear, educational summary of photosynthesis for high school students. Include information about the process, inputs (sunlight, water, carbon dioxide), outputs (oxygen, glucose), and where it occurs in plant cells (chloroplasts). Make it about 150-200 words. IMPORTANT: Use plain text only - no markdown formatting, no asterisks for bold, no special characters. Write naturally with proper paragraphs separated by blank lines."
```

#### Step 2: Choose Reading Level and Tone

Based on your identified hints, select appropriate values:

**Reading Level Options:**
- `elementary` - Grades 1-5, ages 6-10
- `grade-6` - Ages 11-12 (DEFAULT)
- `grade-9` - Ages 14-15
- `high-school` - Grades 10-12, college prep
- `college` - Undergraduate level
- `professional` - Workplace training, adult learners
- `esl-beginner` - A1-A2 CEFR
- `esl-intermediate` - B1-B2 CEFR

**Tone Options:**
- `educational` - Clear, instructional, approachable (DEFAULT)
- `professional` - Formal, business-like, concise
- `casual` - Conversational, friendly, relatable
- `academic` - Scholarly, research-oriented, precise

**Decision tree:**
1. If your prompts mention "middle school" or "grade 6" → `targetAudience: "grade-6"`
2. If your prompts mention "high school" → `targetAudience: "high-school"`
3. If your prompts mention "professional" or "workplace" → `targetAudience: "professional"`
4. If your prompts mention "ESL" or "English learners" → `targetAudience: "esl-beginner"` or `"esl-intermediate"`
5. If your prompts emphasize "clear, educational" → `tone: "educational"` (default)
6. If your prompts emphasize "scholarly" or "academic" → `tone: "academic"`
7. If your prompts emphasize "conversational" → `tone: "casual"`

#### Step 3: Add Book-Level aiConfig

Add the aiConfig block to the top level of your YAML file:

```yaml
title: "Your Book Title"
language: "en"
description: "Your description"

# Add this block
aiConfig:
  targetAudience: "high-school"  # Choose based on Step 2
  tone: "academic"               # Choose based on Step 2
  customization: |               # Optional - for advanced requirements
    Use accurate scientific terminology.
    Include real-world examples.
    Focus on practical applications.

chapters:
  # ... rest of your file
```

**The customization field is optional.** Use it to:
- Request specific teaching approaches ("Use visual learning examples")
- Specify subject focus ("Emphasize medical applications")
- Request special formatting ("Use analogies to explain concepts")

#### Step 4: Simplify Your Prompts

Remove all formatting instructions and reading level hints from prompts. Keep only content requirements.

**Before:**
```yaml
- type: ai-text
  prompt: "Write a clear, educational summary of photosynthesis for high school students. Include information about the process, inputs (sunlight, water, carbon dioxide), outputs (oxygen, glucose), and where it occurs in plant cells (chloroplasts). Make it about 150-200 words. IMPORTANT: Use plain text only - no markdown formatting, no asterisks for bold, no special characters. Write naturally with proper paragraphs separated by blank lines."
```

**After:**
```yaml
- type: ai-text
  prompt: "Explain photosynthesis, including inputs, outputs, and where it occurs in plant cells. Cover the overall process in detail."
```

**What to remove:**
- ❌ "IMPORTANT: Use plain text only..."
- ❌ "no markdown formatting"
- ❌ "no asterisks for bold"
- ❌ "Write naturally with proper paragraphs"
- ❌ "Make it about X words" (unless critical for your content)
- ❌ "for [audience]" (now in aiConfig)
- ❌ "Write a clear, educational..." (tone now in aiConfig)

**What to keep:**
- ✅ Content requirements (topics to cover)
- ✅ Specific facts to include
- ✅ Structure requirements (if critical)
- ✅ Examples to provide

#### Step 5: Add Chapter/Item Overrides (Optional)

If your book has mixed reading levels or special sections:

**Chapter-level override:**
```yaml
chapters:
  - title: "Basic Introduction"
    # This chapter uses book-level config (no override)
    content:
      - type: ai-text
        prompt: "Introduce the water cycle"

  - title: "Advanced Topics"
    # This chapter overrides reading level
    aiConfig:
      targetAudience: "college"  # More complex than book default
    content:
      - type: ai-text
        prompt: "Explain quantum tunneling in photosynthesis"
```

**Item-level override:**
```yaml
- type: ai-text
  prompt: "Explain advanced concepts"
  aiConfig:
    targetAudience: "college"
    customization: "Include mathematical equations"
```

**Override precedence:** Item > Chapter > Book > System Defaults

#### Step 6: Test and Iterate

1. **Generate test content:**
   ```bash
   npm run build
   node ./dist/index.js compile ./examples/your-file-migrated.yaml ./test-output.h5p --verbose
   ```

2. **Review output:**
   - Upload .h5p file to H5P platform
   - Read generated content
   - Check vocabulary level
   - Check sentence complexity
   - Verify formatting (should be clean HTML)

3. **Adjust if needed:**
   - **Too complex?** Move down one reading level (high-school → grade-9)
   - **Too simple?** Move up one reading level (grade-6 → grade-9)
   - **Wrong tone?** Adjust tone parameter
   - **Missing specific requirements?** Add to customization field

4. **Iterate until satisfied**

## Complete Examples

### Example 1: Science Lesson Migration

**Before (biology-lesson.yaml):**
```yaml
title: "AI-Generated Biology Lesson"
language: "en"

chapters:
  - title: "Introduction to Photosynthesis"
    content:
      - type: ai-text
        prompt: "Write a clear, educational summary of photosynthesis for high school students. Include information about the process, inputs (sunlight, water, carbon dioxide), outputs (oxygen, glucose), and where it occurs in plant cells (chloroplasts). Make it about 150-200 words. IMPORTANT: Use plain text only - no markdown formatting, no asterisks for bold, no special characters. Write naturally with proper paragraphs separated by blank lines."
        title: "What is Photosynthesis?"
```

**After (biology-lesson-migrated.yaml):**
```yaml
title: "AI-Generated Biology Lesson"
language: "en"

aiConfig:
  targetAudience: "high-school"
  tone: "academic"
  customization: "Use accurate scientific terminology. Reference the photosynthetic equation."

chapters:
  - title: "Introduction to Photosynthesis"
    content:
      - type: ai-text
        prompt: "Explain photosynthesis, including inputs, outputs, and where it occurs in plant cells. Cover the overall process in detail."
        title: "What is Photosynthesis?"
```

**Results:**
- Prompt reduced from 265 characters to 105 characters (60% shorter)
- No loss of functionality
- Better control over complexity
- Easier to maintain

### Example 2: Mixed-Level Book

**Scenario:** Elementary book with one advanced chapter for gifted students

```yaml
title: "Science for Young Learners"
language: "en"

aiConfig:
  targetAudience: "elementary"  # Default for most of book
  tone: "educational"

chapters:
  - title: "What is Water?"
    content:
      - type: ai-text
        prompt: "Explain what water is and why we need it"

  - title: "The Water Cycle"
    content:
      - type: ai-text
        prompt: "Explain the water cycle step by step"

  - title: "Advanced: Water Chemistry"
    # Override for gifted students
    aiConfig:
      targetAudience: "grade-6"  # Step up complexity
      customization: "Introduce basic molecular concepts"
    content:
      - type: ai-text
        prompt: "Explain the molecular structure of water and how it forms"
```

### Example 3: ESL Course

**Scenario:** ESL course with progressive difficulty

```yaml
title: "English Fundamentals"
language: "en"

aiConfig:
  targetAudience: "esl-beginner"  # Start simple
  tone: "educational"
  customization: "Use only present tense. Avoid idioms. Provide many examples."

chapters:
  - title: "Basic Greetings"
    content:
      - type: ai-text
        prompt: "Teach common greetings and how to introduce yourself"

  - title: "Everyday Conversations"
    # Step up to intermediate
    aiConfig:
      targetAudience: "esl-intermediate"
      customization: "Introduce common idioms with explanations. Use multiple tenses."
    content:
      - type: ai-text
        prompt: "Teach how to have casual conversations about daily activities"
```

### Example 4: Professional Training

**Scenario:** Corporate training with business tone

```yaml
title: "Project Management Fundamentals"
language: "en"

aiConfig:
  targetAudience: "professional"
  tone: "professional"
  customization: |
    Focus on ROI and business outcomes.
    Use industry case studies.
    Emphasize practical implementation.

chapters:
  - title: "Agile Methodology"
    content:
      - type: ai-text
        prompt: "Explain agile project management and its benefits for teams"
```

## Common Migration Patterns

### Pattern 1: Simple Migration (No Overrides)

**When to use:** Book has consistent audience and complexity throughout

**Steps:**
1. Add book-level aiConfig with targetAudience and tone
2. Remove formatting instructions from all prompts
3. Test one chapter, then apply to all

### Pattern 2: Progressive Difficulty

**When to use:** Book starts simple and gets more complex (like textbooks)

**Steps:**
1. Set book-level aiConfig to initial reading level
2. Add chapter-level overrides to later chapters
3. Increment reading level gradually (elementary → grade-6 → grade-9)

### Pattern 3: Specialized Sections

**When to use:** Most content is one level, but some sections differ

**Steps:**
1. Set book-level aiConfig to majority reading level
2. Add chapter or item overrides for specialized sections
3. Use customization field for special requirements

### Pattern 4: Hybrid Approach (Gradual Migration)

**When to use:** Large book, want to migrate incrementally

**Steps:**
1. Add book-level aiConfig but keep old prompts
2. Test with a few chapters
3. Gradually simplify prompts as you verify output quality
4. Old prompts with embedded instructions still work (just redundant)

## Troubleshooting

### Problem: Output is Too Complex

**Symptoms:**
- Vocabulary is too advanced
- Sentences are too long
- Students don't understand content

**Solutions:**
1. Move down one reading level
   - `high-school` → `grade-9`
   - `grade-9` → `grade-6`
   - `grade-6` → `elementary`

2. Add customization:
   ```yaml
   customization: "Use simpler language. Avoid technical jargon. Use short sentences."
   ```

3. Consider ESL levels if English proficiency is the issue

### Problem: Output is Too Simple

**Symptoms:**
- Content feels condescending
- Lacks necessary detail
- Doesn't cover advanced concepts

**Solutions:**
1. Move up one reading level
   - `grade-6` → `grade-9`
   - `grade-9` → `high-school`
   - `high-school` → `college`

2. Add customization:
   ```yaml
   customization: "Include advanced technical detail. Assume subject knowledge."
   ```

3. Combine with academic tone for formal treatment

### Problem: Wrong Tone/Style

**Symptoms:**
- Too formal or too casual
- Doesn't match audience expectations
- Voice feels off

**Solutions:**
1. Adjust tone parameter:
   - Too formal → `tone: "casual"` or `"educational"`
   - Too casual → `tone: "professional"` or `"academic"`

2. Add customization with style guidance:
   ```yaml
   customization: "Use conversational language. Write like talking to a friend."
   ```

### Problem: Formatting Issues

**Symptoms:**
- Markdown syntax appears in output
- Asterisks or special characters visible
- Broken HTML

**Solutions:**
1. **This should not happen** - formatting rules are always included
2. If it does happen, check AI provider configuration
3. File a bug report with example YAML

### Problem: Old Prompts Not Working

**Symptoms:**
- Error messages about aiConfig
- Content generation fails
- Unexpected output

**Solutions:**
1. **Old prompts always work** - this should not happen
2. Check YAML syntax (indentation, quotes, etc.)
3. Verify aiConfig values are valid (see Reading Level Guide)
4. Check error message for specific validation issues

## Validation and Errors

The system validates aiConfig values and provides clear error messages:

### Invalid Reading Level

```
Error: Invalid targetAudience in book-level aiConfig: "advanced"
Valid options are: elementary, grade-6, grade-9, high-school, college, professional, esl-beginner, esl-intermediate
```

**Fix:** Use one of the valid reading level options

### Invalid Tone

```
Error: Invalid tone in chapter-level aiConfig: "super-casual"
Valid options are: educational, professional, casual, academic
```

**Fix:** Use one of the valid tone options

### YAML Syntax Error

```
Error: Unexpected token in YAML file at line 42
```

**Fix:** Check YAML syntax (indentation, quotes, colons)

## Migration Checklist

Use this checklist when migrating a YAML file:

- [ ] Analyzed existing prompts for reading level and tone hints
- [ ] Chose appropriate targetAudience value
- [ ] Chose appropriate tone value
- [ ] Added book-level aiConfig block
- [ ] Wrote customization field (if needed)
- [ ] Removed formatting instructions from prompts ("Use plain text only...")
- [ ] Removed reading level hints from prompts ("for high school students")
- [ ] Removed tone hints from prompts ("clear, educational")
- [ ] Kept content requirements in prompts
- [ ] Added chapter overrides (if needed for mixed-level book)
- [ ] Added item overrides (if needed for special cases)
- [ ] Generated test .h5p file
- [ ] Reviewed output content
- [ ] Checked vocabulary level
- [ ] Checked sentence complexity
- [ ] Verified HTML formatting
- [ ] Adjusted aiConfig if needed
- [ ] Saved original file as backup
- [ ] Renamed migrated file or updated original

## Best Practices

1. **Start conservative:** Use grade-6 or your current reading level equivalent
2. **Test early:** Generate content after first chapter migration to verify settings
3. **Iterate:** Adjust reading level based on actual output, not assumptions
4. **Keep originals:** Save original YAML files before migration
5. **Document decisions:** Add comments in YAML explaining your aiConfig choices
6. **Use customization sparingly:** Only when structured options don't suffice
7. **Be consistent:** Use same aiConfig for similar content types
8. **Review with users:** Have target audience read generated content

## Additional Resources

- **Reading Level Selection:** See [reading-level-guide.md](reading-level-guide.md)
- **YAML Format Reference:** See [yaml-format.md](yaml-format.md)
- **Prompt Engineering:** See [prompt-engineering.md](prompt-engineering.md)
- **Teacher's Guide:** See [teacher-guide-ai-config.md](teacher-guide-ai-config.md)
- **Migration Example:** See [examples/biology-lesson-migrated.yaml](../../examples/yaml/biology-lesson-migrated.yaml)

## Frequently Asked Questions

### Do I have to migrate my existing YAML files?

**No.** Migration is completely optional. All existing files work unchanged with grade-6 defaults.

### Will my old prompts break?

**No.** Old prompts with embedded formatting instructions continue to work. The instructions are redundant but harmless.

### Can I migrate gradually?

**Yes.** You can add aiConfig but keep old prompts. Simplify prompts incrementally as you verify output.

### What if I don't specify aiConfig?

The system uses defaults:
- `targetAudience: "grade-6"`
- `tone: "educational"`
- `outputStyle: "plain-html"`

### Can I mix old and new styles in one file?

**Yes.** Some prompts can have embedded instructions while others rely on aiConfig. Both work.

### What happens if I specify invalid values?

You'll get a clear error message listing valid options. Fix the value and try again.

### Can I use customization field for everything?

You can, but it's not recommended. Structured options (targetAudience, tone) are more predictable and maintainable.

### How do I know which reading level to choose?

See [reading-level-guide.md](reading-level-guide.md) for detailed guidance and decision tree.

### Will migration change my .h5p output?

Only if you change reading level or tone from your implicit old settings. The aiConfig system gives you explicit control over what was previously implicit.

## Support

If you encounter issues during migration:

1. Check error messages for specific validation issues
2. Review this guide and linked resources
3. Compare with [examples/biology-lesson-migrated.yaml](../../examples/yaml/biology-lesson-migrated.yaml)
4. File an issue on GitHub with example YAML file

## Summary

Migration to the new AI Configuration system:
- **Is optional** - old files work unchanged
- **Improves maintainability** - cleaner YAML, less duplication
- **Provides better control** - explicit reading level selection
- **Follows incremental approach** - migrate at your own pace
- **Is fully backward compatible** - zero breaking changes

Start with one file, verify output quality, then apply to others. The system is designed to make your YAML files simpler while giving you more control over AI-generated content.
