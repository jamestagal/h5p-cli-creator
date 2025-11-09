# Raw Idea: Blanks Handler

Create handlers for H5P.Blanks content type (standalone and embedded). H5P.Blanks is a fill-in-the-blank question type where users type answers into text fields within sentences. This is similar to DragText but uses typed input instead of drag-and-drop.

Following the Handler Development Guide patterns:
- Standalone-first architecture (Blanks is runnable)
- Manual handler (BlanksHandler) for YAML/JSON input
- AI handler (AIBlanksHandler) for AI-generated content
- AIPromptBuilder integration with Universal AI Configuration
- Comprehensive validation and testing

Create the spec folder structure at: agent-os/specs/blanks-handler/

Save the raw idea to planning/idea.md
