import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { escapeHtml, simpleEmail } = await import("./email");

describe("email", () => {
  it("escapes HTML in every field", () => {
    expect(escapeHtml(`<b>"Ama" & 'Kofi'</b>`)).toBe("&lt;b&gt;&quot;Ama&quot; &amp; &#39;Kofi&#39;&lt;/b&gt;");
    const { html, text } = simpleEmail({
      school: "DD <Busy> Bees",
      heading: "Hi <script>",
      paragraphs: ["a & b"],
      rows: [["Child", "<img src=x>"]],
      button: { label: "Open", url: "https://example.com/?a=1&b=2" },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("a=1&amp;b=2");
    expect(text).toContain("Child: <img src=x>");
    expect(text).toContain("Open: https://example.com/?a=1&b=2");
  });
});
