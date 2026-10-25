import { describe, it, expect } from "vitest";
import { GOOGLE_AI_API_URL, googleAiHeaders } from "./ocr-config";

describe("Gemini request auth", () => {
  it("the endpoint URL carries no credential", () => {
    expect(GOOGLE_AI_API_URL).not.toMatch(/[?&]key=/);
    expect(GOOGLE_AI_API_URL).not.toContain("?");
  });
  it("the key travels as x-goog-api-key", () => {
    expect(googleAiHeaders("abc")).toEqual({ "Content-Type": "application/json", "x-goog-api-key": "abc" });
  });
});
