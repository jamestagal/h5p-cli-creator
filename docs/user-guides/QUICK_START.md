# Quick Start Guide

## Building H5P Packages from YAML

### Basic Command Structure

```bash
PATH="/Users/benjaminwaller/.nvm/versions/node/v22.21.0/bin:$PATH" \
  node ./dist/index.js interactivebook-ai <input.yaml> <output.h5p> [options]
```

### Example Commands

#### 1. Build Comprehensive Demo (Recommended Test File)
```bash
PATH="/Users/benjaminwaller/.nvm/versions/node/v22.21.0/bin:$PATH" \
  node ./dist/index.js interactivebook-ai \
  examples/yaml/comprehensive-demo.yaml \
  output/solar-system.h5p \
  --verbose
```

#### 2. Build Biology Lesson
```bash
PATH="/Users/benjaminwaller/.nvm/versions/node/v22.21.0/bin:$PATH" \
  node ./dist/index.js interactivebook-ai \
  examples/yaml/biology-lesson.yaml \
  output/biology.h5p
```

#### 3. Build with AI Configuration (Migrated Example)
```bash
PATH="/Users/benjaminwaller/.nvm/versions/node/v22.21.0/bin:$PATH" \
  node ./dist/index.js interactivebook-ai \
  examples/yaml/biology-lesson-migrated.yaml \
  output/biology-grade9.h5p \
  --verbose
```

### Command Options

- `--verbose` - Show detailed build process and library validation
- No additional options needed for basic builds

### Latest Fixed Package

**✅ RECOMMENDED TEST FILE:** `solar-system-FIXED.h5p`

This is the latest package with all fixes applied:
- ✓ Flashcards library included
- ✓ DialogCards library included
- ✓ Case-insensitive library matching
- ✓ Versioned cache file support

### Verify Package Contents

```bash
# List all H5P libraries in the package
unzip -l solar-system-FIXED.h5p | grep "^H5P\." | cut -d/ -f1 | sort -u
```

**Expected output (11 libraries):**
```
H5P.AdvancedText-1.1
H5P.Audio-1.5
H5P.Dialogcards-1.8
H5P.Flashcards-1.5
H5P.FontIcons-1.0
H5P.Image-1.1
H5P.InteractiveBook-1.11
H5P.JoubelUI-1.3
H5P.MultiChoice-1.16
H5P.Question-1.5
H5P.Transition-1.0
```

## Language Settings Explained

### The `language` Field in YAML

**⚠️ IMPORTANT:** The `language: "en"` field sets the **H5P package metadata language**, NOT the AI generation language!

```yaml
title: "Biology Lesson"
language: "en"  # ← This is for H5P UI, not AI generation!
```

#### What it DOES:
- Sets the language for H5P player UI (buttons, navigation, etc.)
- Tells H5P which language file to use for interface text
- Supported values: `en`, `fr`, `de`, `es`, `pt`, etc.

#### What it DOES NOT do:
- ❌ Does NOT make AI generate content in that language
- ❌ Does NOT translate your prompts
- ❌ Does NOT change AI output language

### To Generate Content in French

You must **explicitly request French in your prompt**:

#### Example: French Content Generation

```yaml
title: "Leçon de Biologie"
language: "fr"  # H5P UI will be in French

aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: "Répondez en français. Utilisez un langage clair et éducatif."

chapters:
  - title: "La Photosynthèse"
    content:
      - type: ai-text
        prompt: "Expliquez le processus de la photosynthèse en français. Décrivez les intrants (lumière solaire, eau, dioxyde de carbone) et les produits (oxygène, glucose). Gardez environ 200 mots. Répondez UNIQUEMENT en français."
        title: "Qu'est-ce que la photosynthèse?"
```

**Key point:** Add "Répondez en français" or "Answer in French" to your prompts!

### Multilingual Best Practices

1. **Set `language` field** to match your target language (for H5P UI)
2. **Add language instruction to `customization`** in aiConfig
3. **Include language instruction in each prompt** that needs translation
4. **Test with a small example first** to verify AI output language

#### Example: Spanish Content

```yaml
title: "Lección de Biología"
language: "es"

aiConfig:
  targetAudience: "grade-6"
  tone: "educational"
  customization: "Responde siempre en español. Usa un lenguaje educativo y claro."

chapters:
  - title: "Fotosíntesis"
    content:
      - type: ai-text
        prompt: "Explica la fotosíntesis en español para estudiantes de sexto grado."
```

## Library Validation (NEW!)

When you build with `--verbose`, you'll now see library validation:

```
Validating 7 required libraries...
Found 5 cached .h5p files

  ✓ H5P.InteractiveBook
    ✓ Found exact match: H5P.InteractiveBook-1.11.h5p
    Version: 1.11
  ✓ H5P.Flashcards
    ✓ Found exact match: H5P.Flashcards-1.5.h5p
    Version: 1.5
  ⚠ H5P.Dialogcards
    ⚠ Case mismatch: requested "H5P.Dialogcards" but found "H5P.DialogCards-1.8.h5p"
    Version: 1.8

⚠ Warning: Found 1 library issue(s)
  - Case mismatches will be handled automatically
  - Version mismatches may cause runtime errors
```

This helps you catch version/case issues BEFORE compilation fails!

## Troubleshooting

### "Library not found" errors
- Run with `--verbose` to see which libraries are missing
- Check `content-type-cache/` directory for available libraries
- Missing libraries will download automatically from H5P Hub

### Version mismatch warnings
- Check handler files for hardcoded version numbers
- Compare with cached library versions
- Update handler to match cached version OR re-download library

### Case mismatch warnings
- These are automatically handled now
- Warnings are informational only
- No action needed (system handles it)

## Next Steps

1. **Test the comprehensive demo:**
   ```bash
   PATH="/Users/benjaminwaller/.nvm/versions/node/v22.21.0/bin:$PATH" \
     node ./dist/index.js interactivebook-ai \
     examples/yaml/comprehensive-demo.yaml \
     test-output.h5p \
     --verbose
   ```

2. **Verify the package:**
   ```bash
   unzip -l test-output.h5p | grep "^H5P\." | cut -d/ -f1 | sort -u
   ```

3. **Upload to H5P platform** and test interactivity!
