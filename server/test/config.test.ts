import { describe, expect, it } from "vitest";
import { normalizeLlmBaseUrl } from "../src/config.js";

describe("normalizeLlmBaseUrl", () => {
  it("keeps an already-correct /v1 URL", () => {
    expect(normalizeLlmBaseUrl("http://127.0.0.1:1234/v1")).toBe(
      "http://127.0.0.1:1234/v1",
    );
  });

  it("adds /v1 when missing (pi.dev style)", () => {
    expect(normalizeLlmBaseUrl("http://127.0.0.1:1234")).toBe(
      "http://127.0.0.1:1234/v1",
    );
  });

  it("strips trailing slashes before normalizing", () => {
    expect(normalizeLlmBaseUrl("http://localhost:1234/")).toBe(
      "http://localhost:1234/v1",
    );
  });
});
