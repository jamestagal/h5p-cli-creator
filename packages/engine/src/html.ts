import sanitize from "sanitize-html";

const ALLOWED_TAGS = ["p", "br", "strong", "em", "b", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "code", "pre", "blockquote", "sub", "sup", "span", "a"];

export function sanitizeHtml(html: string): string {
  return sanitize(html, { allowedTags: ALLOWED_TAGS, allowedAttributes: { a: ["href"] }, allowedSchemes: ["http", "https", "mailto"], disallowedTagsMode: "discard" });
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
