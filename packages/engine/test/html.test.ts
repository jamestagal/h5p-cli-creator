import { describe, it, expect } from "vitest";
import { sanitizeHtml, escapeHtml } from "../src/html.js";

describe("html contract", () => {
  it("keeps allowed formatting and strips scripts, styles and handlers", () => {
    expect(sanitizeHtml('<p onclick="x()">Hi <strong>there</strong><script>alert(1)</script></p><style>p{}</style>')).toBe("<p>Hi <strong>there</strong></p>");
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a><a href="https://example.com">y</a>')).toBe('<a>x</a><a href="https://example.com">y</a>');
  });
  it("escapes plain text", () => {
    expect(escapeHtml('1 < 2 & "q" *a/b:c*')).toBe("1 &lt; 2 &amp; &quot;q&quot; *a/b:c*");
  });
  it("escapes single quotes", () => {
    expect(escapeHtml("it's a 'test'")).toBe("it&#39;s a &#39;test&#39;");
  });
});
