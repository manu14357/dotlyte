import { describe, it, expect } from "vitest";
import { coerce, coerceObject } from "../src/coercion.js";

describe("coerce()", () => {
  // Null values
  it("should coerce empty string to null", () => expect(coerce("")).toBeNull());
  it("should coerce 'null' to null", () => expect(coerce("null")).toBeNull());
  it("should coerce 'none' to null", () => expect(coerce("none")).toBeNull());
  it("should coerce 'nil' to null", () => expect(coerce("nil")).toBeNull());
  it("should coerce 'NULL' to null", () => expect(coerce("NULL")).toBeNull());

  // Boolean true
  it("should coerce 'true' to true", () => expect(coerce("true")).toBe(true));
  it("should coerce 'TRUE' to true", () => expect(coerce("TRUE")).toBe(true));
  it("should coerce 'yes' to true", () => expect(coerce("yes")).toBe(true));
  it("should coerce '1' to true", () => expect(coerce("1")).toBe(true));
  it("should coerce 'on' to true", () => expect(coerce("on")).toBe(true));

  // Boolean false
  it("should coerce 'false' to false", () => expect(coerce("false")).toBe(false));
  it("should coerce 'FALSE' to false", () => expect(coerce("FALSE")).toBe(false));
  it("should coerce 'no' to false", () => expect(coerce("no")).toBe(false));
  it("should coerce '0' to false", () => expect(coerce("0")).toBe(false));
  it("should coerce 'off' to false", () => expect(coerce("off")).toBe(false));

  // Integers
  it("should coerce '8080' to number", () => expect(coerce("8080")).toBe(8080));
  it("should coerce '-42' to number", () => expect(coerce("-42")).toBe(-42));

  // Floats
  it("should coerce '3.14' to float", () => expect(coerce("3.14")).toBe(3.14));
  it("should coerce '-0.5' to float", () => expect(coerce("-0.5")).toBe(-0.5));

  // Lists
  it("should coerce 'a,b,c' to array", () => expect(coerce("a,b,c")).toEqual(["a", "b", "c"]));

  // Passthrough
  it("should pass through non-string values", () => expect(coerce(8080)).toBe(8080));
  it("should pass through booleans", () => expect(coerce(true)).toBe(true));
  it("should pass through null", () => expect(coerce(null)).toBeNull());

  // Strings
  it("should keep plain strings", () => expect(coerce("hello")).toBe("hello"));
  it("should keep URLs", () => expect(coerce("https://example.com")).toBe("https://example.com"));
});

describe("coerceObject()", () => {
  it("should coerce all string values in object", () => {
    expect(coerceObject({ port: "8080", debug: "true", host: "localhost" })).toEqual({
      port: 8080,
      debug: true,
      host: "localhost",
    });
  });

  it("should handle nested objects", () => {
    expect(coerceObject({ db: { port: "5432", ssl: "true" } })).toEqual({
      db: { port: 5432, ssl: true },
    });
  });
});
