import { describe, expect, it } from "vitest";
import {
  stripCodeFences,
  extractJsonArraySlice,
  extractJsonObjectSlice,
} from "@/lib/services/llm-json";

describe("stripCodeFences", () => {
  it("removes ```json fences case-insensitively (lowercase)", () => {
    const raw = "```json\n{\"a\":1}\n```";
    expect(stripCodeFences(raw)).toBe('{"a":1}');
  });

  it("removes ```JSON fences case-insensitively (uppercase)", () => {
    const raw = "```JSON\n{\"a\":1}\n```";
    expect(stripCodeFences(raw)).toBe('{"a":1}');
  });

  it("removes bare ``` fences with no language tag", () => {
    const raw = "```\n[1,2]\n```";
    expect(stripCodeFences(raw)).toBe("[1,2]");
  });

  it("trims leading/trailing whitespace", () => {
    expect(stripCodeFences("   hello   ")).toBe("hello");
  });

  it("leaves a string without fences unchanged (aside from trim)", () => {
    expect(stripCodeFences("no fences here")).toBe("no fences here");
  });
});

describe("extractJsonArraySlice", () => {
  it("passes a plain array through unchanged", () => {
    expect(extractJsonArraySlice("[1,2,3]")).toBe("[1,2,3]");
  });

  it("strips prose before and after the array", () => {
    const raw = 'Here is the result: [1,2,3] — hope that helps!';
    expect(extractJsonArraySlice(raw)).toBe("[1,2,3]");
  });

  it("unwraps a fenced array", () => {
    const raw = "```json\n[1,2,3]\n```";
    expect(extractJsonArraySlice(raw)).toBe("[1,2,3]");
  });

  it("slices from the FIRST '[' to the LAST ']' — greedy on nested arrays", () => {
    // Proves the slice is not the first balanced pair: it spans from the
    // very first "[" all the way to the very last "]" in the string.
    const raw = "x [1,[2]] y";
    expect(extractJsonArraySlice(raw)).toBe("[1,[2]]");
  });

  it("returns null when there are no brackets at all", () => {
    expect(extractJsonArraySlice("no brackets here")).toBeNull();
  });

  it("returns null when ']' appears before '[' (out of order)", () => {
    expect(extractJsonArraySlice("] before [")).toBeNull();
  });

  it("returns null when only '[' is present", () => {
    expect(extractJsonArraySlice("[ only")).toBeNull();
  });

  // Known limitation: stripCodeFences does a global replace for fence
  // markers BEFORE the array is sliced out, so fence-like text embedded
  // inside a JSON string value also gets mangled. This pins the CURRENT
  // (buggy-looking but intentional-to-document) behavior rather than the
  // aspirationally-correct one.
  it("[KNOWN LIMITATION] mangles fence markers embedded inside a string value", () => {
    const raw = '[1, "```json"]';
    // The embedded "```json" marker is stripped by the fence-removal pass
    // before slicing, corrupting the string value's content.
    expect(extractJsonArraySlice(raw)).toBe('[1, ""]');
  });
});

describe("extractJsonObjectSlice", () => {
  it("passes a plain object through unchanged", () => {
    expect(extractJsonObjectSlice('{"a":1}')).toBe('{"a":1}');
  });

  it("strips prose before and after the object", () => {
    const raw = 'Here is the result: {"a":1} — hope that helps!';
    expect(extractJsonObjectSlice(raw)).toBe('{"a":1}');
  });

  it("unwraps a fenced object", () => {
    const raw = '```json\n{"a":1}\n```';
    expect(extractJsonObjectSlice(raw)).toBe('{"a":1}');
  });

  it("slices from the FIRST '{' to the LAST '}' — greedy on nested objects", () => {
    const raw = 'x {"a":{"b":1}} y';
    expect(extractJsonObjectSlice(raw)).toBe('{"a":{"b":1}}');
  });

  it("returns null when there are no braces at all", () => {
    expect(extractJsonObjectSlice("no braces here")).toBeNull();
  });

  it("returns null when '}' appears before '{' (out of order)", () => {
    expect(extractJsonObjectSlice("} before {")).toBeNull();
  });

  it("returns null when only '{' is present", () => {
    expect(extractJsonObjectSlice("{ only")).toBeNull();
  });

  // Known limitation: same fence-stripping-before-slicing behavior as
  // extractJsonArraySlice — pinning current behavior, not asserting the
  // aspirationally-correct one.
  it("[KNOWN LIMITATION] mangles fence markers embedded inside a string value", () => {
    const raw = '{"a": "```json"}';
    expect(extractJsonObjectSlice(raw)).toBe('{"a": ""}');
  });
});
