import { describe, it, expect } from "vitest";
import { load, Config, DotlyteError } from "../src/index.js";

describe("load()", () => {
  it("should return a Config object", () => {
    const config = load({ defaults: { port: 3000 } });
    expect(config).toBeInstanceOf(Config);
  });

  it("should use defaults when no other sources exist", () => {
    const config = load({ defaults: { port: 3000, debug: false } });
    expect(config.get("port")).toBe(3000);
    expect(config.get("debug")).toBe(false);
  });

  it("should return empty config with no sources", () => {
    const config = load({ defaults: {} });
    expect(config).toBeInstanceOf(Config);
  });
});

describe("Config", () => {
  it("should support dot-notation access", () => {
    const config = new Config({ port: 8080, database: { host: "localhost" } });
    expect(config.port).toBe(8080);
    expect((config.database as Config).host).toBe("localhost");
  });

  it("should support get() with default", () => {
    const config = new Config({ existing: "value" });
    expect(config.get("missing", "fallback")).toBe("fallback");
  });

  it("should support get() with nested dot-notation", () => {
    const config = new Config({ database: { host: "localhost", port: 5432 } });
    expect(config.get("database.host")).toBe("localhost");
    expect(config.get("database.port")).toBe(5432);
  });

  it("should support require() for existing keys", () => {
    const config = new Config({ database_url: "postgres://localhost" });
    expect(config.require("database_url")).toBe("postgres://localhost");
  });

  it("should throw DotlyteError on require() for missing keys", () => {
    const config = new Config({});
    expect(() => config.require("MISSING_KEY")).toThrow(DotlyteError);
  });

  it("should support has()", () => {
    const config = new Config({ port: 8080 });
    expect(config.has("port")).toBe(true);
    expect(config.has("missing")).toBe(false);
  });

  it("should support toObject()", () => {
    const data = { port: 8080, debug: true };
    const config = new Config(data);
    expect(config.toObject()).toEqual(data);
  });
});
