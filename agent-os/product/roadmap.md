# Product Roadmap

1. [ ] Core Handler Infrastructure — Implement ContentHandler interface, HandlerRegistry, HandlerContext, and SimpleLogger to establish the plugin architecture foundation that enables rapid content type additions `M`

2. [ ] Handler Migration System — Refactor existing Flashcards and Dialog Cards implementations into FlashcardsHandler and DialogCardsHandler classes implementing the ContentHandler interface while maintaining backward compatibility `L`

3. [ ] Dynamic CLI Command System — Replace static yargs command definitions with dynamic command generation from HandlerRegistry, enabling automatic CLI command creation when new handlers are registered `M`

4. [ ] Interactive Book Handler — Implement InteractiveBookHandler supporting multi-page digital storybooks with text, images, and audio narration demonstrating the extensibility of the new architecture `L`

5. [ ] Auto-Documentation Generation — Implement CSV format documentation generation in HandlerRegistry that produces comprehensive markdown documentation with column definitions, examples, and usage patterns from handler metadata `M`

6. [ ] CSV Template Generation — Add CLI command to generate empty CSV templates with proper headers and example rows for any registered content type, improving onboarding experience `S`

7. [ ] Handler Validation Framework — Enhance validation system with detailed error reporting showing field names, row numbers, expected types, and suggested fixes for common issues `M`

8. [ ] Comprehensive Test Suite — Develop unit tests for each handler, integration tests for full workflow, and registry tests to ensure reliability and enable confident refactoring `L`

9. [ ] Handler Development Guide — Create comprehensive documentation for community contributors showing step-by-step process to add new content type handlers with code examples and best practices `M`

10. [ ] Media Processing Enhancements — Add image resizing, format conversion, and compression options to optimize package sizes and ensure compatibility across platforms `L`

11. [ ] Advanced CSV Features — Support multi-file CSV inputs, CSV validation tools, and CSV format auto-detection to improve flexibility and user experience `M`

12. [ ] Content Type Package Manager — Implement automatic H5P content type package downloading from H5P Hub with version management and update checking `M`

> Notes
> - Handler architecture (items 1-3) must be completed first as it's the foundation for all other features
> - Item 2 ensures backward compatibility - existing CLI commands continue to work unchanged
> - Item 4 demonstrates the extensibility gains by adding a complex new content type in the new architecture
> - Items 5-6 deliver on the self-documenting architecture vision
> - Items 7-8 ensure production-readiness and enable confident community contributions
> - Items 9-12 focus on polish, optimization, and enhanced developer/user experience
