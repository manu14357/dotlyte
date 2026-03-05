import { describe, it, expect } from "vitest";
import { withValibot, validateWithValibotSchemas } from "../src/adapters/valibot.js";

describe("withValibot", () => {
  it("returns schema with __adapter marker", () => {
    const schema = withValibot({
      PORT: { type: "string" },
    });

    expect(schema.__adapter).toBe("valibot");
    expect(schema.PORT).toEqual({ type: "string" });
  });
});

describe("validateWithValibotSchemas", () => {
  it("validates values using Valibot-like schemas", () => {
    // Create minimal Valibot-like schema objects
    const mockSchema = {
      type: "string",
      _run(dataset: { typed: boolean; value: unknown }, _config: unknown) {
        return { typed: true, value: String(dataset.value) };
      },
    };

    const result = validateWithValibotSchemas(
      { NAME: mockSchema },
      { NAME: "hello" },
    );

    expect(result.NAME).toBe("hello");
  });

  it("throws on validation failure", () => {
    const failSchema = {
      type: "string",
      _run(_dataset: unknown, _config: unknown) {
        return { typed: false, value: undefined, issues: [{ message: "Invalid value" }] };
      },
    };

    expect(() => {
      validateWithValibotSchemas(
        { BAD: failSchema },
        { BAD: "anything" },
      );
    }).toThrow(/Invalid value/);
  });
});
