import { describe, it, expect } from "vitest";
import { createTypedConfig } from "../src/typed.js";

describe("createTypedConfig", () => {
  it("validates and coerces a flat schema with FieldDescriptors", () => {
    // Set up env vars — schema keys ARE the env var names
    process.env.PORT = "8080";
    process.env.DEBUG = "true";
    process.env.APP_NAME = "test-app";

    const config = createTypedConfig({
      PORT: { type: "integer" as const, required: true },
      DEBUG: { type: "boolean" as const, default: false },
      APP_NAME: { type: "string" as const },
    });

    expect(config.PORT).toBe(8080);
    expect(config.DEBUG).toBe(true);
    expect(config.APP_NAME).toBe("test-app");

    // Cleanup
    delete process.env.PORT;
    delete process.env.DEBUG;
    delete process.env.APP_NAME;
  });

  it("applies defaults when env vars are missing", () => {
    delete process.env.MISSING_VAR;

    const config = createTypedConfig({
      MISSING_VAR: { type: "string" as const, required: false, default: "fallback" },
    });

    expect(config.MISSING_VAR).toBe("fallback");
  });

  it("throws on missing required field", () => {
    delete process.env.REQUIRED_VAR;

    expect(() => {
      createTypedConfig({
        REQUIRED_VAR: { type: "string" as const, required: true },
      });
    }).toThrow(/Missing required/);
  });

  it("validates enum constraints", () => {
    process.env.LOG_LEVEL = "info";

    const config = createTypedConfig({
      LOG_LEVEL: {
        type: "string" as const,
        enum: ["debug", "info", "warn", "error"] as const,
      },
    });

    expect(config.LOG_LEVEL).toBe("info");
    delete process.env.LOG_LEVEL;
  });

  it("throws on enum violation", () => {
    process.env.LOG_LEVEL = "invalid";

    expect(() => {
      createTypedConfig({
        LOG_LEVEL: {
          type: "string" as const,
          enum: ["debug", "info", "warn", "error"] as const,
        },
      });
    }).toThrow(/must be one of/);

    delete process.env.LOG_LEVEL;
  });

  it("validates integer min/max constraints", () => {
    process.env.PORT = "99999";

    expect(() => {
      createTypedConfig({
        PORT: { type: "integer" as const, min: 1, max: 65535 },
      });
    }).toThrow(/exceeds maximum/);

    delete process.env.PORT;
  });

  it("supports sectioned schema (server/client)", () => {
    process.env.DB_URL = "postgresql://localhost";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    const config = createTypedConfig({
      server: {
        DB_URL: { type: "string" as const },
      },
      client: {
        NEXT_PUBLIC_APP_URL: { type: "string" as const },
      },
      clientPrefix: "NEXT_PUBLIC_",
    });

    expect(config.DB_URL).toBe("postgresql://localhost");
    expect(config.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");

    delete process.env.DB_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("skips validation when skipValidation is true", () => {
    process.env.PORT = "not-a-number";

    const config = createTypedConfig(
      { PORT: { type: "integer" as const } },
      { skipValidation: true },
    );

    // Value should be raw (not validated)
    expect(config.PORT).toBeDefined();

    delete process.env.PORT;
  });
});
