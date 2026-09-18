import { LanguageUtils } from "../../src/ai/LanguageUtils";

describe("LanguageUtils", () => {
  describe("getLanguageName", () => {
    // Suppress console.warn for cleaner test output
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it("should map common ISO 639-1 codes to full language names", () => {
      expect(LanguageUtils.getLanguageName("vi")).toBe("Vietnamese");
      expect(LanguageUtils.getLanguageName("fr")).toBe("French");
      expect(LanguageUtils.getLanguageName("de")).toBe("German");
      expect(LanguageUtils.getLanguageName("es")).toBe("Spanish");
      expect(LanguageUtils.getLanguageName("en")).toBe("English");
    });

    it("should map additional supported language codes", () => {
      expect(LanguageUtils.getLanguageName("ja")).toBe("Japanese");
      expect(LanguageUtils.getLanguageName("ko")).toBe("Korean");
      expect(LanguageUtils.getLanguageName("zh")).toBe("Chinese");
      expect(LanguageUtils.getLanguageName("ar")).toBe("Arabic");
      expect(LanguageUtils.getLanguageName("pt")).toBe("Portuguese");
    });

    it("should handle case insensitivity", () => {
      expect(LanguageUtils.getLanguageName("VI")).toBe("Vietnamese");
      expect(LanguageUtils.getLanguageName("Fr")).toBe("French");
      expect(LanguageUtils.getLanguageName("DE")).toBe("German");
      expect(LanguageUtils.getLanguageName("Es")).toBe("Spanish");
    });

    it("should return code as-is for unrecognized language codes", () => {
      const unknownCode = "xyz";
      const result = LanguageUtils.getLanguageName(unknownCode);

      expect(result).toBe("xyz");
    });

    it("should log warning for unrecognized language codes", () => {
      const unknownCode = "abc";
      LanguageUtils.getLanguageName(unknownCode);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown language code")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("abc")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("ISO 639-1")
      );
    });

    it("should preserve case of unrecognized codes", () => {
      expect(LanguageUtils.getLanguageName("XYZ")).toBe("XYZ");
      expect(LanguageUtils.getLanguageName("Abc")).toBe("Abc");
    });
  });
});
