import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock external dependencies with 'as any' to avoid TypeScript mock type issues
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

describe("Utils", () => {
  describe("slugify", () => {
    it("converts text to slug", async () => {
      const { slugify } = await import("../utils");
      expect(slugify("Senior React Developer")).toBe("senior-react-developer");
      expect(slugify("Node.js  Expert!!")).toBe("nodejs-expert");
      expect(slugify("  hello world  ")).toBe("hello-world");
    });
  });

  describe("normalizeEmail", () => {
    it("lowercases and trims email", async () => {
      const { normalizeEmail } = await import("../utils");
      expect(normalizeEmail("  JOHN@EXAMPLE.COM  ")).toBe("john@example.com");
      expect(normalizeEmail("Test@TEST.org")).toBe("test@test.org");
    });
  });

  describe("normalizePhone", () => {
    it("normalizes Indian phone numbers", async () => {
      const { normalizePhone } = await import("../utils");
      expect(normalizePhone("9876543210")).toBe("+919876543210");
      expect(normalizePhone("919876543210")).toBe("+919876543210");
      expect(normalizePhone("+919876543210")).toBe("+919876543210");
    });
  });

  describe("generateJobSlug", () => {
    it("generates a unique slug from title", async () => {
      const { generateJobSlug } = await import("../utils");
      const slug1 = generateJobSlug("Senior React Developer");
      const slug2 = generateJobSlug("Senior React Developer");
      expect(slug1).toMatch(/^senior-react-developer-[a-z0-9]{5}$/);
      expect(slug1).not.toBe(slug2);
    });
  });

  describe("buildUnsubscribeUrl", () => {
    it("builds a valid unsubscribe URL", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
      const { buildUnsubscribeUrl } = await import("../utils");
      const url = buildUnsubscribeUrl("test@example.com");
      expect(url).toContain("http://localhost:3000/unsubscribe?t=");
    });
  });

  describe("buildAvailabilityUrl", () => {
    it("builds availability confirmation URLs", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
      const { buildAvailabilityUrl } = await import("../utils");
      const availableUrl = buildAvailabilityUrl("test-token-123", "available");
      const unavailableUrl = buildAvailabilityUrl("test-token-123", "unavailable");
      expect(availableUrl).toContain("s=available");
      expect(unavailableUrl).toContain("s=unavailable");
      expect(availableUrl).toContain("token=test-token-123");
    });
  });
});
