import { describe, it, expect } from "vitest";
import { withZod, validateWithZodSchemas } from "../src/adapters/zod.js";

describe("withZod", () => {
  it("returns schema with __adapter marker", () => {
    const schema = withZod({
      PORT: { type: "string" },
      DEBUG: { type: "boolean" },
    });

    expect(schema.__adapter).toBe("zod");
    expect(schema.PORT).toEqual({ type: "string" });
  });

  it("preserves original keys", () => {
    const input = { a: 1, b: 2, c: 3 };
    const result = withZod(input);
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
    expect(result.c).toBe(3);
  });
});

describe("validateWithZodSchemas", () => {
  it("validates values using Zod-like schemas", () => {
    // Create minimal Zod-like schema objects
    const mockStringSchema = {
      _def: { typeName: "ZodString" },
      parse(value: unknown) {
        if (typeof value !== "string") throw new Error("Expected string");
        return value;
      },
    };

    const mockNumberSchema = {
      _def: { typeName: "ZodNumber" },
      parse(value: unknown) {
        const num = Number(value);
        if (Number.isNaN(num)) throw new Error("Expected number");
        return num;
      },
    };

    const result = validateWithZodSchemas(
      { HOST: mockStringSchema, PORT: mockNumberSchema } as Record<string, { _def: unknown; parse: (v: unknown) => unknown }>,
      { HOST: "localhost", PORT: "8080" },
    );

    expect(result.HOST).toBe("localhost");
    expect(result.PORT).toBe(8080);
  });

  it("collects validation errors and throws", () => {
    const alwaysFailSchema = {
      _def: { typeName: "ZodString" },
      parse(_value: unknown) {
        throw new Error("Validation failed");
      },
    };

    expect(() => {
      validateWithZodSchemas(
        { BAD: alwaysFailSchema } as Record<string, { _def: unknown; parse: (v: unknown) => unknown }>,
        { BAD: "value" },
      );
    }).toThrow(/Validation failed/);
  });
});
