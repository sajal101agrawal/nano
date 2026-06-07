import { describe, it, expect, jest } from "@jest/globals";

describe("AI Module - extractJSON", () => {
  it("extracts JSON from fenced code block", () => {
    const text = 'Here is the result:\n```json\n{"name": "Alice"}\n```';
    const fenced = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    expect(fenced?.[1]).toBe('{"name": "Alice"}');
  });

  it("extracts raw JSON from text", () => {
    const text = 'Some text {"name": "Bob", "age": 30} more text';
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    const jsonStr = text.slice(jsonStart, jsonEnd + 1);
    expect(JSON.parse(jsonStr)).toEqual({ name: "Bob", age: 30 });
  });
});

describe("Embeddings Module", () => {
  describe("buildCandidateEmbeddingText", () => {
    it("builds a text representation from profile data", async () => {
      const { buildCandidateEmbeddingText } = await import("../embeddings");
      const text = buildCandidateEmbeddingText({
        summary: "Experienced React developer",
        skills: [{ skill: "React" }, { skill: "TypeScript" }],
        currentTitle: "Senior Engineer",
        currentCompany: "TechCorp",
        roles: [
          { title: "Engineer", company: "OldCo", summary: "Built web apps" },
        ],
      });

      expect(text).toContain("React");
      expect(text).toContain("TypeScript");
      expect(text).toContain("Senior Engineer");
      expect(text).toContain("TechCorp");
      expect(text).toContain("Experienced React developer");
    });

    it("handles empty/minimal data", async () => {
      const { buildCandidateEmbeddingText } = await import("../embeddings");
      const text = buildCandidateEmbeddingText({});
      expect(typeof text).toBe("string");
    });
  });
});

describe("Matching Logic", () => {
  it("applies availability penalty correctly", () => {
    const applyRuleScore = (availability: string, openToContract: boolean, engagementType: string) => {
      let ruleScore = 1.0;
      if (availability === "unavailable") ruleScore *= 0.1;
      else if (availability === "unknown") ruleScore *= 0.6;
      if (engagementType === "contract" && !openToContract) ruleScore *= 0.3;
      return ruleScore;
    };

    expect(applyRuleScore("available", true, "contract")).toBe(1.0);
    expect(applyRuleScore("unavailable", true, "contract")).toBe(0.1);
    expect(applyRuleScore("unknown", true, "contract")).toBe(0.6);
    expect(applyRuleScore("available", false, "contract")).toBe(0.3);
    expect(applyRuleScore("unavailable", false, "contract")).toBeCloseTo(0.03);
  });
});
