# JSON Schemas for h5p-cli-creator

This directory contains JSON Schema definitions for frontend validation and TypeScript type generation.

## Available Schemas

### AIConfiguration.json

Defines the structure for AI configuration used across all AI-generated content.

**Usage in Frontend (JavaScript/TypeScript):**

```typescript
import AIConfigSchema from "./schemas/AIConfiguration.json";
import Ajv from "ajv";

const ajv = new Ajv();
const validate = ajv.compile(AIConfigSchema);

const aiConfig = {
  targetAudience: "grade-6",
  tone: "educational",
  customization: "Focus on visual learners"
};

if (validate(aiConfig)) {
  console.log("Valid!");
} else {
  console.error("Validation errors:", validate.errors);
}
```

**Usage in Frontend (React/Svelte):**

```tsx
// React example
import { useState } from "react";
import AIConfigSchema from "./schemas/AIConfiguration.json";

function AIConfigForm() {
  const [aiConfig, setAIConfig] = useState({
    targetAudience: "grade-6",
    tone: "educational"
  });

  const readingLevels = AIConfigSchema.properties.targetAudience.enum;
  const tones = AIConfigSchema.properties.tone.enum;

  return (
    <form>
      <select
        value={aiConfig.targetAudience}
        onChange={(e) => setAIConfig({ ...aiConfig, targetAudience: e.target.value })}
      >
        {readingLevels.map((level) => (
          <option key={level} value={level}>{level}</option>
        ))}
      </select>

      <select
        value={aiConfig.tone}
        onChange={(e) => setAIConfig({ ...aiConfig, tone: e.target.value })}
      >
        {tones.map((tone) => (
          <option key={tone} value={tone}>{tone}</option>
        ))}
      </select>
    </form>
  );
}
```

### BookDefinition.json

Defines the complete structure for Interactive Book generation including chapters, content items, and AI configuration.

**Usage:**

```typescript
import BookDefSchema from "./schemas/BookDefinition.json";
import Ajv from "ajv";

const ajv = new Ajv();
const validate = ajv.compile(BookDefSchema);

const bookDefinition = {
  title: "My Book",
  language: "en",
  aiConfig: {
    targetAudience: "grade-9",
    tone: "educational"
  },
  chapters: [
    {
      title: "Chapter 1",
      content: [
        {
          type: "ai-text",
          prompt: "Explain photosynthesis"
        }
      ]
    }
  ]
};

if (validate(bookDefinition)) {
  // Send to API
  const response = await fetch("/api/generate-h5p", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bookDefinition)
  });
} else {
  console.error("Validation errors:", validate.errors);
}
```

## TypeScript Type Generation

Generate TypeScript types from JSON schemas using `json-schema-to-typescript`:

```bash
npm install -g json-schema-to-typescript

json2ts schemas/AIConfiguration.json > types/AIConfiguration.d.ts
json2ts schemas/BookDefinition.json > types/BookDefinition.d.ts
```

Or use in build process:

```javascript
// generateTypes.js
const { compileFromFile } = require("json-schema-to-typescript");

async function generateTypes() {
  const aiConfigTypes = await compileFromFile("schemas/AIConfiguration.json");
  const bookDefTypes = await compileFromFile("schemas/BookDefinition.json");

  fs.writeFileSync("types/AIConfiguration.d.ts", aiConfigTypes);
  fs.writeFileSync("types/BookDefinition.d.ts", bookDefTypes);
}

generateTypes();
```

## Validation Libraries

### AJV (JavaScript/Node.js)

```bash
npm install ajv
```

```typescript
import Ajv from "ajv";
const ajv = new Ajv();
const validate = ajv.compile(schema);
```

### Zod (TypeScript)

Convert JSON Schema to Zod schema:

```bash
npm install json-schema-to-zod
```

```typescript
import { z } from "zod";

const AIConfigSchema = z.object({
  targetAudience: z.enum([
    "elementary",
    "grade-6",
    "grade-9",
    "high-school",
    "college",
    "professional",
    "esl-beginner",
    "esl-intermediate"
  ]).default("grade-6"),
  tone: z.enum(["educational", "professional", "casual", "academic"]).default("educational"),
  outputStyle: z.enum(["plain-html", "rich-html", "markdown"]).default("plain-html"),
  customization: z.string().max(1000).optional()
});

type AIConfiguration = z.infer<typeof AIConfigSchema>;
```

## Schema Versioning

Schemas follow semantic versioning:
- **Major version** - Breaking changes to schema structure
- **Minor version** - Backward-compatible additions
- **Patch version** - Documentation or clarification updates

Current version: 1.0.0 (Initial release)

## See Also

- [API Integration Guide](../docs/api-integration.md) - Using schemas in API requests
- [YAML Format Reference](../docs/yaml-format.md) - YAML equivalent of JSON schemas
- [TypeScript Types](../src/compiler/types.ts) - Source TypeScript type definitions
