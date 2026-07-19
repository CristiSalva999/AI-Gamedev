import { describe, expect, it } from "vitest";
import { parseSseBuffer } from "../src/lib/sse.js";

describe("parseSseBuffer", () => {
  it("extracts complete frames and returns the trailing partial", () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":';
    const { data, rest } = parseSseBuffer(buffer);
    expect(data).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('data: {"c":');
  });

  it("ignores non-data lines and blank frames", () => {
    const buffer = "event: ping\n\ndata: hello\n\n";
    const { data, rest } = parseSseBuffer(buffer);
    expect(data).toEqual(["hello"]);
    expect(rest).toBe("");
  });

  it("returns no data when only a partial frame is present", () => {
    const { data, rest } = parseSseBuffer("data: partial");
    expect(data).toEqual([]);
    expect(rest).toBe("data: partial");
  });
});
