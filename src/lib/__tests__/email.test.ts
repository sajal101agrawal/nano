import { describe, it, expect, jest } from "@jest/globals";

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue({ rows: [] } as any),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] } as any),
      release: jest.fn(),
    } as any),
    on: jest.fn(),
  })),
}));

describe("Email Module", () => {
  describe("renderTemplate", () => {
    it("substitutes variables correctly", async () => {
      const { renderTemplate } = await import("../email");

      const template = "Hello {{name}}, your code is {{code}}.";
      const result = renderTemplate(template, { name: "Alice", code: "123456" });
      expect(result).toBe("Hello Alice, your code is 123456.");
    });

    it("leaves unreplaced variables as empty", async () => {
      const { renderTemplate } = await import("../email");
      const template = "Hello {{name}}, {{missing_var}} world.";
      const result = renderTemplate(template, { name: "Bob" });
      expect(result).toContain("Bob");
      expect(result).not.toContain("{{name}}");
    });

    it("handles multiple instances of same variable", async () => {
      const { renderTemplate } = await import("../email");
      const template = "{{name}} applied for {{role}}. Thanks, {{name}}!";
      const result = renderTemplate(template, { name: "Charlie", role: "Engineer" });
      expect(result).toBe("Charlie applied for Engineer. Thanks, Charlie!");
    });
  });
});

describe("CN Utility", () => {
  describe("cn", () => {
    it("merges class names correctly", async () => {
      const { cn } = await import("../cn");
      expect(cn("foo", "bar")).toBe("foo bar");
      expect(cn("foo", undefined, "bar")).toBe("foo bar");
      expect(cn("p-4", "p-2")).toBe("p-2");
    });
  });

  describe("formatDate", () => {
    it("formats a date string", async () => {
      const { formatDate } = await import("../cn");
      const result = formatDate("2024-01-15T10:00:00Z");
      expect(result).toContain("2024");
      expect(result).toContain("Jan");
    });

    it("returns dash for null/undefined", async () => {
      const { formatDate } = await import("../cn");
      expect(formatDate(null)).toBe("—");
      expect(formatDate(undefined)).toBe("—");
    });
  });

  describe("getInitials", () => {
    it("gets initials from name", async () => {
      const { getInitials } = await import("../cn");
      expect(getInitials("John Doe")).toBe("JD");
      expect(getInitials("Alice")).toBe("A");
      expect(getInitials("Bob Smith Jones")).toBe("BS");
    });
  });

  describe("truncate", () => {
    it("truncates long strings", async () => {
      const { truncate } = await import("../cn");
      expect(truncate("Hello World", 5)).toBe("Hello…");
      expect(truncate("Short", 10)).toBe("Short");
    });
  });
});
