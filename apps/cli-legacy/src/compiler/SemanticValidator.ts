import {
  SemanticSchema,
  FieldDefinition,
  ValidationResult,
  ValidationError
} from "./types";

/**
 * SemanticValidator parses H5P semantics.json files and validates content structures
 * against semantic definitions.
 */
export class SemanticValidator {
  /**
   * Parses semantics.json array into a structured schema.
   * @param semanticsJson The raw semantics array from library metadata
   * @returns Parsed semantic schema
   */
  public parseSemantics(semanticsJson: any): SemanticSchema {
    if (!Array.isArray(semanticsJson)) {
      throw new Error("Semantics must be an array");
    }

    const fields: FieldDefinition[] = semanticsJson.map(fieldDef =>
      this.parseFieldDefinition(fieldDef)
    );

    return { fields };
  }

  /**
   * Validates content against a semantic schema.
   * @param content The content object to validate
   * @param schema The semantic schema to validate against
   * @returns Validation result with errors if any
   */
  public validate(content: any, schema: SemanticSchema): ValidationResult {
    const errors: ValidationError[] = [];

    for (const fieldDef of schema.fields) {
      this.validateField(content, fieldDef, fieldDef.name, errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Gets a field definition by path (e.g., "cards.text" where cards is a list).
   * For list fields, automatically navigates into the list item definition.
   * @param fieldPath The dot-separated path to the field
   * @param schema The semantic schema to search
   * @returns Field definition if found, undefined otherwise
   */
  public getFieldDefinition(
    fieldPath: string,
    schema: SemanticSchema
  ): FieldDefinition | undefined {
    const pathParts = fieldPath.split(".");
    let currentFields = schema.fields;
    let currentField: FieldDefinition | undefined;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      currentField = currentFields.find(f => f.name === part);

      if (!currentField) {
        return undefined;
      }

      // If this is not the last part, we need to navigate deeper
      if (i < pathParts.length - 1) {
        if (currentField.type === "group" && currentField.fields) {
          currentFields = currentField.fields;
        } else if (currentField.type === "list" && currentField.field) {
          // For list fields, navigate into the list item definition
          if (currentField.field.type === "group" && currentField.field.fields) {
            currentFields = currentField.field.fields;
          } else {
            // List of simple types - can't navigate further
            return undefined;
          }
        } else {
          // Can't navigate further into this field type
          return undefined;
        }
      }
    }

    return currentField;
  }

  /**
   * Parses a single field definition from semantics.json.
   * @param fieldDef Raw field definition object
   * @returns Parsed field definition
   */
  private parseFieldDefinition(fieldDef: any): FieldDefinition {
    const definition: FieldDefinition = {
      name: fieldDef.name,
      type: fieldDef.type,
      label: fieldDef.label,
      description: fieldDef.description,
      importance: fieldDef.importance,
      default: fieldDef.default,
      optional: fieldDef.optional,
      widget: fieldDef.widget,
      options: fieldDef.options,
      min: fieldDef.min,
      max: fieldDef.max,
      pattern: fieldDef.pattern,
      common: fieldDef.common
    };

    if (fieldDef.type === "group" && fieldDef.fields) {
      definition.fields = fieldDef.fields.map((f: any) =>
        this.parseFieldDefinition(f)
      );
    }

    if (fieldDef.type === "list" && fieldDef.field) {
      definition.field = this.parseFieldDefinition(fieldDef.field);
    }

    return definition;
  }

  /**
   * Validates a single field within content.
   * @param content The parent content object
   * @param fieldDef The field definition to validate against
   * @param fieldPath The current field path for error reporting
   * @param errors Array to accumulate validation errors
   */
  private validateField(
    content: any,
    fieldDef: FieldDefinition,
    fieldPath: string,
    errors: ValidationError[]
  ): void {
    const value = content[fieldDef.name];

    if (value === undefined || value === null) {
      // Field is optional if it's marked optional, has a default value, or is boolean type
      const isOptional = fieldDef.optional || fieldDef.default !== undefined || fieldDef.type === "boolean";
      if (!isOptional) {
        errors.push({
          fieldPath,
          message: `Required field "${fieldDef.name}" is missing`,
          expectedType: fieldDef.type
        });
      }
      return;
    }

    const actualType = this.getValueType(value);

    switch (fieldDef.type) {
      case "text":
        if (actualType !== "string") {
          errors.push({
            fieldPath,
            message: `Field "${fieldDef.name}" must be a string`,
            expectedType: "string",
            actualType
          });
        }
        break;

      case "number":
        if (actualType !== "number") {
          errors.push({
            fieldPath,
            message: `Field "${fieldDef.name}" must be a number`,
            expectedType: "number",
            actualType
          });
        } else {
          if (fieldDef.min !== undefined && value < fieldDef.min) {
            errors.push({
              fieldPath,
              message: `Field "${fieldDef.name}" must be at least ${fieldDef.min}`,
              expectedType: "number"
            });
          }
          if (fieldDef.max !== undefined && value > fieldDef.max) {
            errors.push({
              fieldPath,
              message: `Field "${fieldDef.name}" must be at most ${fieldDef.max}`,
              expectedType: "number"
            });
          }
        }
        break;

      case "boolean":
        if (actualType !== "boolean") {
          errors.push({
            fieldPath,
            message: `Field "${fieldDef.name}" must be a boolean`,
            expectedType: "boolean",
            actualType
          });
        }
        break;

      case "list":
        if (actualType !== "array") {
          errors.push({
            fieldPath,
            message: `Field "${fieldDef.name}" must be an array`,
            expectedType: "array",
            actualType
          });
        } else {
          if (fieldDef.min !== undefined && value.length < fieldDef.min) {
            errors.push({
              fieldPath,
              message: `Field "${fieldDef.name}" must have at least ${fieldDef.min} items`,
              expectedType: "array"
            });
          }
          if (fieldDef.max !== undefined && value.length > fieldDef.max) {
            errors.push({
              fieldPath,
              message: `Field "${fieldDef.name}" must have at most ${fieldDef.max} items`,
              expectedType: "array"
            });
          }

          if (fieldDef.field) {
            value.forEach((item: any, index: number) => {
              this.validateFieldValue(
                item,
                fieldDef.field!,
                `${fieldPath}[${index}]`,
                errors
              );
            });
          }
        }
        break;

      case "group":
        if (actualType !== "object") {
          errors.push({
            fieldPath,
            message: `Field "${fieldDef.name}" must be an object`,
            expectedType: "object",
            actualType
          });
        } else if (fieldDef.fields) {
          for (const childField of fieldDef.fields) {
            this.validateField(
              value,
              childField,
              `${fieldPath}.${childField.name}`,
              errors
            );
          }
        }
        break;

      case "library":
        if (actualType !== "object") {
          errors.push({
            fieldPath,
            message: `Field "${fieldDef.name}" must be a library object`,
            expectedType: "library (object)",
            actualType
          });
        } else if (fieldDef.options && fieldDef.options.length > 0) {
          if (!value.library) {
            errors.push({
              fieldPath,
              message: `Library object must have a "library" property`,
              expectedType: "library (object)"
            });
          }
        }
        break;

      case "image":
      case "video":
      case "audio":
        if (actualType !== "object") {
          errors.push({
            fieldPath,
            message: `Field "${fieldDef.name}" must be a ${fieldDef.type} object`,
            expectedType: `${fieldDef.type} (object)`,
            actualType
          });
        }
        break;

      default:
        break;
    }
  }

  /**
   * Validates a field value directly (used for list items).
   * @param value The value to validate
   * @param fieldDef The field definition to validate against
   * @param fieldPath The current field path for error reporting
   * @param errors Array to accumulate validation errors
   */
  private validateFieldValue(
    value: any,
    fieldDef: FieldDefinition,
    fieldPath: string,
    errors: ValidationError[]
  ): void {
    if (fieldDef.type === "group" && fieldDef.fields) {
      const actualType = this.getValueType(value);
      if (actualType !== "object") {
        errors.push({
          fieldPath,
          message: `Expected object for group field`,
          expectedType: "object",
          actualType
        });
        return;
      }

      for (const childField of fieldDef.fields) {
        this.validateField(
          value,
          childField,
          `${fieldPath}.${childField.name}`,
          errors
        );
      }
    } else {
      const wrapper = { value };
      const tempFieldDef = { ...fieldDef, name: "value" };
      this.validateField(wrapper, tempFieldDef, fieldPath, errors);
    }
  }

  /**
   * Gets the type of a value for validation purposes.
   * @param value The value to check
   * @returns Type string (string, number, boolean, array, object, null)
   */
  private getValueType(value: any): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }
}
