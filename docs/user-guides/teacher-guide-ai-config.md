# Teacher's Guide: AI Configuration

## Quick Start

Want AI to write content at the right level for your students? Just add this to your YAML file:

```yaml
aiConfig:
  targetAudience: "grade-6"  # Change to match your students
```

That's it! All AI-generated content will now match 6th grade reading level.

## What is AI Configuration?

AI Configuration lets you control **how** the AI writes content for your students. Instead of telling the AI in every prompt to "write for 6th graders" or "use simple language," you set it once at the top of your file and it applies everywhere.

**Before (the old way):**
```yaml
- type: ai-text
  prompt: "Explain photosynthesis for 6th grade students. Use simple sentences. Don't use big words. Make it easy to understand. Use plain text only - no markdown."
```

**After (the new way):**
```yaml
aiConfig:
  targetAudience: "grade-6"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain photosynthesis"  # That's it!
```

The AI automatically knows to:
- Use vocabulary appropriate for 6th graders
- Write sentences that are 12-15 words long
- Explain technical terms when they're introduced
- Include relatable examples from students' lives
- Format everything correctly for H5P

## Choosing a Reading Level

### For K-12 Students

#### Elementary (Grades 1-5)
**Best for:** Young students, basic concepts

**What it does:**
- Very short sentences (8-12 words)
- Simple, everyday vocabulary
- Avoids technical terms (or explains them very simply)
- Uses concrete examples from daily life
- Friendly, encouraging tone

**When to use:** Teaching foundational concepts to elementary students, introducing new topics with lots of scaffolding.

**Example output:** "Plants make food from sunlight. This process is called photosynthesis. Plants use water from the ground and air from outside. Then they make sugar to eat."

#### 6th Grade (Ages 11-12) - **DEFAULT**
**Best for:** Middle school, standard curriculum

**What it does:**
- Medium sentences (12-15 words)
- Grade-appropriate vocabulary
- Defines technical terms clearly
- Examples from school, home, and popular culture
- Clear, instructional tone

**When to use:** Most middle school content, general-purpose educational materials.

**Example output:** "Photosynthesis is how plants create their own food using sunlight. During this process, plants take in carbon dioxide from the air and water from their roots. Using energy from the sun, they convert these ingredients into glucose (a type of sugar) and release oxygen as a byproduct."

#### 9th Grade (Ages 14-15)
**Best for:** High school freshmen/sophomores

**What it does:**
- Longer sentences (15-20 words)
- Broader vocabulary with technical terms
- Brief definitions for new concepts
- Real-world applications
- Analytical tone

**When to use:** Introductory high school courses, building on middle school knowledge.

**Example output:** "Photosynthesis is a complex biochemical process that occurs in the chloroplasts of plant cells. This process converts light energy into chemical energy stored in glucose molecules. The overall reaction can be summarized as: carbon dioxide plus water, in the presence of light energy, yields glucose and oxygen."

#### High School (Grades 10-12)
**Best for:** College prep, AP courses

**What it does:**
- Complex sentences (18-25 words)
- Advanced vocabulary and subject-specific terms
- Assumes background knowledge
- Critical thinking encouraged
- Sophisticated, academic tone

**When to use:** Advanced placement courses, honors classes, college preparation.

**Example output:** "Photosynthesis represents one of the most fundamental processes sustaining life on Earth, converting electromagnetic radiation from the sun into chemical energy through an intricate series of light-dependent and light-independent reactions. The light reactions, occurring in the thylakoid membranes, generate ATP and NADPH, which are subsequently utilized in the Calvin cycle to fix atmospheric carbon dioxide into organic compounds."

### For Adults

#### College Level
**Best for:** University students, academic content

**What it does:**
- Academic writing style
- Discipline-specific language
- Assumes foundational knowledge
- Analytical depth
- Scholarly tone

**When to use:** Undergraduate courses, academic papers, research summaries.

#### Professional / Adult Learners
**Best for:** Workplace training, continuing education

**What it does:**
- Concise, efficient language
- Industry terminology
- Practical, action-oriented
- Professional tone
- ROI and outcomes focus

**When to use:** Corporate training, professional development, skill-building courses.

**Example output:** "Understanding photosynthesis drives innovation in sustainable agriculture and renewable energy sectors. Companies leveraging biomimicry principles have developed artificial photosynthesis systems for clean energy production, demonstrating ROI through reduced carbon footprints and operational costs."

### For English Language Learners

#### ESL Beginner (A1-A2 CEFR)
**Best for:** Students just starting to learn English

**What it does:**
- Very short sentences (5-8 words)
- Only common, high-frequency words
- Simple present tense
- No idioms or slang
- Patient, supportive tone

**When to use:** Newcomer programs, adult ESL basics, foundational language building.

**Example output:** "Plants need sun. Plants need water. Plants make food. This is photosynthesis. Plants give us air."

#### ESL Intermediate (B1-B2 CEFR)
**Best for:** English learners building fluency

**What it does:**
- Medium sentences (10-15 words)
- Everyday vocabulary with gradual expansion
- Multiple verb tenses
- Common idioms explained
- Clear, encouraging tone

**When to use:** Intermediate ESL courses, content and language integrated learning.

**Example output:** "Photosynthesis helps plants make their own food. Plants take in sunlight, water, and carbon dioxide. They use these things to create sugar for energy. This process also makes oxygen, which we breathe. Without photosynthesis, life on Earth would be very different."

## Customization Tips

The `customization` field lets you add specific instructions for your teaching approach. Use it to:

### Teaching Strategies

```yaml
customization: |
  Focus on visual learners
  Include examples students can try at home
  Use sports analogies when possible
```

### Subject-Specific Approaches

```yaml
customization: |
  Connect to medical applications
  Include current research examples
  Relate concepts to human health
```

### Curriculum Alignment

```yaml
customization: |
  Align with AP Biology curriculum
  Use NGSS science standards terminology
  Prepare students for state testing
```

### Learning Styles

```yaml
customization: |
  Emphasize hands-on activities
  Include step-by-step procedures
  Provide memory aids and mnemonics
```

### Real-World Connections

```yaml
customization: |
  Use environmental examples
  Connect to climate change topics
  Include careers that use this knowledge
```

## How to Set AI Configuration

### Book-Level (Recommended)

Set configuration once for your entire book:

```yaml
title: "My Science Course"
language: "en"
aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: "Focus on visual learners. Use everyday examples."

chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        prompt: "Explain photosynthesis"
      - type: ai-quiz
        sourceText: "..."
        questionCount: 5
```

All AI content in the book will use grade-6 level.

### Chapter-Level (For Mixed Difficulty)

Override for specific chapters:

```yaml
aiConfig:
  targetAudience: "grade-6"  # Default

chapters:
  - title: "Introduction"
    content:
      - type: ai-text
        prompt: "Basic concepts"
      # Uses grade-6

  - title: "Advanced Topics"
    aiConfig:
      targetAudience: "high-school"  # Harder for this chapter
    content:
      - type: ai-text
        prompt: "Complex concepts"
      # Uses high-school level
```

### Item-Level (For Fine Control)

Override for individual content items:

```yaml
chapters:
  - title: "Chapter 1"
    content:
      - type: ai-text
        aiConfig:
          targetAudience: "elementary"  # Simpler introduction
        prompt: "What is a cell?"

      - type: ai-text
        aiConfig:
          targetAudience: "grade-9"  # More detail in main content
        prompt: "Explain cell structure and organelles"
```

## Common Mistakes to Avoid

### ❌ Don't Include Formatting Instructions Anymore

**Old way (don't do this):**
```yaml
- type: ai-text
  prompt: "Explain gravity. Use simple sentences. No markdown. Use HTML tags. Write for 6th graders."
```

**New way (do this):**
```yaml
aiConfig:
  targetAudience: "grade-6"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain gravity"
```

The system automatically handles:
- HTML formatting
- No markdown
- Age-appropriate language
- Proper paragraph structure

### ❌ Don't Specify Reading Level in Your Prompt

**Don't:**
```yaml
- type: ai-text
  prompt: "Explain mitosis for high school students using advanced vocabulary"
```

**Do:**
```yaml
aiConfig:
  targetAudience: "high-school"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain mitosis"
```

### ❌ Don't Use Different Levels Randomly

**Don't:**
```yaml
# Inconsistent difficulty
- type: ai-text
  aiConfig:
    targetAudience: "elementary"
  prompt: "Explain cells"

- type: ai-text
  aiConfig:
    targetAudience: "college"
  prompt: "Explain cell structure"
```

**Do:**
```yaml
# Consistent difficulty with intentional progression
aiConfig:
  targetAudience: "grade-6"  # Consistent for most content

chapters:
  - title: "Introduction"
    content:
      - type: ai-text
        aiConfig:
          targetAudience: "elementary"  # Start simple
        prompt: "What is a cell?"

      - type: ai-text
        prompt: "Parts of a cell"
        # Uses grade-6 default
```

### ❌ Don't Forget About Quiz Difficulty

**Don't:**
```yaml
aiConfig:
  targetAudience: "elementary"  # Easy reading level

chapters:
  - content:
      - type: ai-quiz
        sourceText: "Complex scientific text with advanced terminology..."
        # Questions will be too hard for elementary students!
```

**Do:**
```yaml
aiConfig:
  targetAudience: "elementary"

chapters:
  - content:
      - type: ai-quiz
        sourceText: "Plants make food from sunlight. This is called photosynthesis."
        # Both quiz questions AND source text match elementary level
```

## Frequently Asked Questions

### Can I change the reading level mid-book?

Yes! Use chapter-level or item-level overrides:

```yaml
aiConfig:
  targetAudience: "grade-6"  # Default

chapters:
  - title: "Basics"
    # Uses grade-6

  - title: "Advanced"
    aiConfig:
      targetAudience: "high-school"  # Override
```

### What if I don't specify aiConfig?

The system uses sensible defaults:
- Reading Level: `grade-6`
- Tone: `educational`
- Output Style: `plain-html`

Your content will work fine without any configuration!

### Can I use aiConfig with manual text?

No, `aiConfig` only affects AI-generated content:
- `ai-text` - Yes, aiConfig applies
- `ai-quiz` - Yes, aiConfig applies
- `text` - No, this is manual text you write yourself
- `image` - No, this is just an image
- `audio` - No, this is just audio

### How do I know which level to choose?

Ask yourself:
1. What grade are my students in?
2. Are they learning English as a second language?
3. Is this introductory or advanced content?
4. What vocabulary do they already know?

When in doubt, start with `grade-6` and adjust based on student feedback.

### Can I see what the AI prompt looks like?

Use the `--verbose` flag when generating:

```bash
node ./dist/index.js interactivebook-ai ./lesson.yaml ./output.h5p --verbose
```

This shows the complete prompts sent to the AI, including all the formatting rules and reading level guidance.

### Does customization override reading level?

No, customization **adds to** reading level. Both work together:

```yaml
aiConfig:
  targetAudience: "grade-6"  # Sets vocabulary and sentence length
  customization: "Use medical examples"  # Adds extra context
```

The AI will write at grade-6 level AND use medical examples.

## Example Configurations

### Elementary Science

```yaml
aiConfig:
  targetAudience: "elementary"
  tone: "educational"
  customization: |
    Use very simple words
    Include examples from nature students can see
    Break down concepts into small steps
```

### High School AP Biology

```yaml
aiConfig:
  targetAudience: "high-school"
  tone: "educational"
  customization: |
    Align with AP Biology curriculum
    Include connections to medical applications
    Prepare students for college-level science
    Use proper scientific terminology
```

### ESL Science Content

```yaml
aiConfig:
  targetAudience: "esl-intermediate"
  tone: "educational"
  customization: |
    Use present tense when possible
    Explain idioms if used
    Include visual descriptions
    Provide context for cultural references
```

### Professional Training

```yaml
aiConfig:
  targetAudience: "professional"
  tone: "professional"
  customization: |
    Focus on practical application
    Include industry best practices
    Emphasize ROI and business outcomes
    Use case studies from Fortune 500 companies
```

## Getting Help

If you're not sure about:
- Which reading level to choose → See the comparison table above
- How to write prompts → Keep them simple! "Explain [topic]" works great
- Whether to use customization → Start without it, add it if you need specific adjustments

For technical documentation, see:
- [YAML Format Reference](yaml-format.md) - Complete YAML syntax
- [API Integration Guide](api-integration.md) - Using in web apps
- [Prompt Engineering Reference](prompt-engineering.md) - How prompts work internally

## Summary

**Do:**
- ✅ Set `aiConfig` once at book level
- ✅ Choose reading level based on your students' grade
- ✅ Use customization for specific teaching approaches
- ✅ Keep prompts simple and focused
- ✅ Test with your students and adjust

**Don't:**
- ❌ Include formatting instructions in prompts
- ❌ Specify reading level in every prompt
- ❌ Mix reading levels randomly
- ❌ Over-complicate your prompts
- ❌ Forget to test the generated content

**Remember:** The AI Configuration system is designed to make your life easier. Set it once, write simple prompts, and let the system handle the rest!
