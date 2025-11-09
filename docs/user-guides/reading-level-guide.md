# Reading Level Selection Guide

This guide helps teachers and content creators choose the appropriate reading level for AI-generated content in H5P Interactive Books.

## Overview

The AI Configuration System provides 8 predefined reading levels, each optimized for specific audiences. Selecting the right reading level ensures that AI-generated content uses appropriate vocabulary, sentence structure, and examples for your learners.

## Reading Level Options

### K-12 Education

#### Elementary (Grades 1-5)

**Best for:** Young learners in primary school

**Characteristics:**
- Very short sentences (8-12 words)
- Simple, everyday vocabulary
- Concrete, tangible examples
- Friendly, encouraging tone
- Avoids abstract concepts

**When to use:**
- Creating content for children ages 6-10
- Introducing completely new concepts to beginners
- ESL learners at very early stages (paired with ESL-Beginner)

**Example content:**
```yaml
aiConfig:
  targetAudience: "elementary"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain what plants need to grow"
```

**Expected output style:**
> Plants need four things to grow. They need water. They need sunlight. They need air. They also need soil. Water helps plants drink. Sunlight helps plants make food. Air has a gas called oxygen. Soil gives plants a place to grow.

---

#### Grade 6 (Ages 11-12) - DEFAULT

**Best for:** Middle school students

**Characteristics:**
- Medium-length sentences (12-15 words)
- Grade-appropriate vocabulary with technical term definitions
- Relatable examples from students' lives
- Clear, instructional tone
- Builds on concepts students already know

**When to use:**
- Most general educational content
- Default choice when audience is mixed or uncertain
- Introductory college material for non-majors

**Example content:**
```yaml
aiConfig:
  targetAudience: "grade-6"  # This is the default

chapters:
  - content:
      - type: ai-text
        prompt: "Explain photosynthesis"
```

**Expected output style:**
> Photosynthesis is the process plants use to make their own food. Think of it like a kitchen inside every leaf. Plants take in three ingredients: water from the soil, carbon dioxide from the air, and energy from sunlight. Special parts of the leaf called chloroplasts combine these ingredients to create glucose, which is a type of sugar that feeds the plant.

---

#### Grade 9 (Ages 14-15)

**Best for:** High school freshmen and sophomores

**Characteristics:**
- Longer sentences (15-20 words) with complexity
- Broader vocabulary and technical terms
- Real-world applications and current events
- Engaging, analytical tone
- Encourages critical thinking

**When to use:**
- High school courses for younger grades
- Advanced middle school content
- Technical training for teenagers

**Example content:**
```yaml
aiConfig:
  targetAudience: "grade-9"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain the greenhouse effect and climate change"
```

**Expected output style:**
> The greenhouse effect is a natural process where certain gases in Earth's atmosphere trap heat from the sun, similar to how a greenhouse keeps plants warm. While this process is essential for life on Earth, human activities have increased greenhouse gas concentrations, intensifying the effect and leading to global climate change with far-reaching consequences for ecosystems and human societies.

---

#### High School (Grades 10-12)

**Best for:** High school juniors, seniors, and college prep

**Characteristics:**
- Complex sentences (18-25 words)
- Advanced vocabulary and subject-specific terminology
- College-level examples and research references
- Sophisticated, academic tone
- Promotes analysis and evaluation

**When to use:**
- AP or honors courses
- College preparatory material
- Advanced technical training

**Example content:**
```yaml
aiConfig:
  targetAudience: "high-school"
  tone: "academic"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain Newton's laws of motion"
```

**Expected output style:**
> Newton's three laws of motion form the foundation of classical mechanics and describe the relationship between forces acting on an object and the object's resulting motion. The first law, the law of inertia, states that an object at rest stays at rest and an object in motion continues in motion with constant velocity unless acted upon by an external force, challenging the Aristotelian view that motion requires a continuous force.

---

### Higher Education and Professional

#### College Level

**Best for:** Undergraduate students

**Characteristics:**
- Academic sentence structures of varying complexity
- Discipline-specific language
- Research references and theoretical frameworks
- Scholarly, precise tone
- Assumes foundational knowledge

**When to use:**
- University courses
- Professional certification programs
- Graduate-level prerequisite materials

**Example content:**
```yaml
aiConfig:
  targetAudience: "college"
  tone: "academic"
  customization: "Reference current research in the field"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain quantum entanglement"
```

**Expected output style:**
> Quantum entanglement represents a fundamental deviation from classical physics, describing a phenomenon wherein the quantum states of two or more particles become correlated in such a way that the state of one particle cannot be described independently of the others, regardless of the spatial separation between them. This non-local correlation, famously described by Einstein as "spooky action at a distance," has been empirically verified through Bell test experiments and forms the theoretical basis for emerging technologies in quantum computing and quantum cryptography.

---

#### Professional / Adult Learners

**Best for:** Workplace training and professional development

**Characteristics:**
- Concise, efficient sentences
- Industry-standard terminology
- Real-world case studies and best practices
- Professional, actionable tone
- Emphasizes practical application and ROI

**When to use:**
- Corporate training materials
- Professional development courses
- Industry certifications
- Executive education

**Example content:**
```yaml
aiConfig:
  targetAudience: "professional"
  tone: "professional"
  customization: "Focus on practical implementation"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain agile project management methodology"
```

**Expected output style:**
> Agile project management delivers value through iterative development cycles, enabling teams to respond rapidly to changing requirements. Organizations implementing agile methodologies typically see 25-30% improvement in time-to-market and increased stakeholder satisfaction. Key practices include daily stand-ups, sprint planning, retrospectives, and continuous integration, with measurable outcomes tracking velocity, burn-down rates, and defect density.

---

### English as a Second Language (ESL)

#### ESL Beginner (A1-A2 CEFR)

**Best for:** Early-stage English language learners

**Characteristics:**
- Very short, simple sentences (5-8 words)
- Common, high-frequency vocabulary only
- Present tense, simple grammar
- Patient, supportive tone
- Universal concepts, explicit context

**When to use:**
- Adult ESL beginner classes
- Newcomer orientation materials
- Basic survival English content
- Content for recent immigrants

**Example content:**
```yaml
aiConfig:
  targetAudience: "esl-beginner"
  customization: "Use only present tense. Repeat key words."

chapters:
  - content:
      - type: ai-text
        prompt: "Explain the water cycle"
```

**Expected output style:**
> Water moves in a cycle. The sun heats water. Water goes up into the air. This is evaporation. Water makes clouds. Clouds have water drops. Water falls from clouds. This is rain. Rain goes to rivers. Rivers go to oceans. The cycle starts again.

---

#### ESL Intermediate (B1-B2 CEFR)

**Best for:** Intermediate English language learners

**Characteristics:**
- Medium sentences (10-15 words)
- Expanded vocabulary for everyday situations
- Varied tenses introduced gradually
- Common idioms with explanations
- Cultural context included

**When to use:**
- Intermediate ESL courses
- Academic English preparation
- Professional English for non-native speakers
- English for specific purposes (business, healthcare, etc.)

**Example content:**
```yaml
aiConfig:
  targetAudience: "esl-intermediate"
  customization: "Explain any idioms you use"

chapters:
  - content:
      - type: ai-text
        prompt: "Explain job interview best practices"
```

**Expected output style:**
> Preparing for a job interview requires several important steps. First, research the company thoroughly to understand their business and values. Practice answering common questions about your experience and skills. Dress professionally - this means wearing business attire appropriate for the company culture. Arrive 10-15 minutes early to show punctuality, which means being on time. During the interview, make eye contact and speak clearly to demonstrate confidence.

---

## Choosing the Right Reading Level

### Quick Decision Tree

1. **Is your audience primarily learning English?**
   - Yes, basic level → **ESL Beginner**
   - Yes, intermediate level → **ESL Intermediate**
   - No → Continue to question 2

2. **What is the age/education level?**
   - Ages 6-10 / Grades 1-5 → **Elementary**
   - Ages 11-12 / Grade 6 → **Grade 6** (DEFAULT)
   - Ages 14-15 / Grade 9 → **Grade 9**
   - Ages 16-18 / Grades 10-12 → **High School**
   - University students → **College**
   - Working professionals → **Professional**

3. **Is the content highly technical or specialized?**
   - Yes, and audience has expertise → Move UP one level
   - Yes, but audience is new to topic → Keep same level or move DOWN one level

### Common Mistakes to Avoid

1. **Don't overestimate reading level**
   - Problem: Using "college" for general adult audience
   - Solution: Use "professional" for workplace or "grade-6" for general public

2. **Don't underestimate ESL learners' intelligence**
   - Problem: Using "elementary" for adult ESL beginners
   - Solution: Use "esl-beginner" - simpler English, not simpler concepts

3. **Don't forget about defaults**
   - Problem: Not specifying reading level and getting grade-6 output for advanced content
   - Solution: Always specify reading level for non-grade-6 audiences

### Testing and Iteration

**Best Practice:** Generate sample content and have representative users review it.

```yaml
# Test approach
aiConfig:
  targetAudience: "grade-9"  # Initial guess

chapters:
  - title: "Test Chapter"
    content:
      - type: ai-text
        prompt: "Explain [your topic]"
```

If the output is:
- **Too complex:** Move DOWN one level (grade-9 → grade-6)
- **Too simple:** Move UP one level (grade-9 → high-school)
- **Just right:** Keep this level for the full book

## Combining Reading Level with Tone

Reading level controls **complexity and vocabulary**. Tone controls **style and voice**.

### Effective Combinations

| Reading Level | Recommended Tone | Use Case |
|--------------|-----------------|----------|
| Elementary | Educational | Elementary school lessons |
| Grade 6 | Educational | Middle school courses |
| Grade 9 | Educational | High school courses |
| High School | Academic | AP/Honors courses, college prep |
| College | Academic | University courses, research |
| Professional | Professional | Corporate training, certifications |
| ESL Beginner | Educational | ESL basic courses |
| ESL Intermediate | Educational or Casual | ESL conversation practice |

### Advanced Combinations

```yaml
# Academic high school content
aiConfig:
  targetAudience: "high-school"
  tone: "academic"

# Friendly professional training
aiConfig:
  targetAudience: "professional"
  tone: "casual"
  customization: "Use workplace examples"

# Formal college writing
aiConfig:
  targetAudience: "college"
  tone: "academic"
  customization: "Include citations and references"
```

## Examples by Subject Area

### Science

```yaml
# Elementary science
aiConfig:
  targetAudience: "elementary"
  customization: "Use hands-on experiment examples kids can do at home"

# High school biology
aiConfig:
  targetAudience: "high-school"
  tone: "academic"
  customization: "Prepare students for AP Biology exam"

# College physics
aiConfig:
  targetAudience: "college"
  tone: "academic"
  customization: "Include mathematical equations and derivations"
```

### History

```yaml
# Middle school history
aiConfig:
  targetAudience: "grade-6"
  customization: "Use storytelling approach with historical figures"

# High school history
aiConfig:
  targetAudience: "high-school"
  tone: "academic"
  customization: "Include primary source analysis"
```

### Business

```yaml
# Professional marketing course
aiConfig:
  targetAudience: "professional"
  tone: "professional"
  customization: "Include ROI metrics and case studies"

# College business fundamentals
aiConfig:
  targetAudience: "college"
  tone: "academic"
  customization: "Reference business theories and frameworks"
```

### Language Learning

```yaml
# ESL beginner grammar
aiConfig:
  targetAudience: "esl-beginner"
  customization: "Use only present tense. Provide many examples."

# ESL intermediate reading
aiConfig:
  targetAudience: "esl-intermediate"
  customization: "Introduce new vocabulary in context"
```

## Troubleshooting

### Output is too complex

**Symptoms:**
- Students don't understand vocabulary
- Sentences are too long
- Concepts seem advanced

**Solutions:**
1. Move down one reading level
2. Add customization: "Use simpler language and shorter sentences"
3. Combine with "educational" tone

### Output is too simple

**Symptoms:**
- Content feels condescending
- Lacks depth or nuance
- Misses important details

**Solutions:**
1. Move up one reading level
2. Add customization: "Include more technical detail"
3. Combine with "academic" tone for more formal treatment

### Output has wrong style

**Symptoms:**
- Tone doesn't match audience expectations
- Too formal or too casual

**Solutions:**
1. Adjust `tone` parameter (educational, professional, casual, academic)
2. Add customization with specific style requests
3. Provide example content in customization field

## Additional Resources

- **YAML Format Reference:** See `/docs/yaml-format.md` for aiConfig syntax
- **API Integration Guide:** See `/docs/api-integration.md` for JSON format
- **Teacher's Guide:** See `/docs/teacher-guide-ai-config.md` for quick start
- **Prompt Engineering:** See `/docs/prompt-engineering.md` for technical details

## Summary

Choose reading level based on:
1. **Audience age/education** (elementary through professional)
2. **English proficiency** (native speakers vs. ESL)
3. **Subject complexity** (introductory vs. advanced)
4. **Learning context** (K-12, college, workplace)

When in doubt:
- Use **grade-6** (default) for general audiences
- Use **esl-beginner** or **esl-intermediate** for English learners
- Use **professional** for workplace training
- Test and iterate based on actual user feedback
