import { describe, it, expect, vi } from "vitest";
import { createBoundaryProxy, isClientContext, isServerContext } from "../src/boundaries.js";

describe("isClientContext / isServerContext", () => {
  it("detects server context in Node.js (no window)", () => {
    expect(isClientContext()).toBe(false);
    expect(isServerContext()).toBe(true);
  });
});

describe("createBoundaryProxy", () => {
  it("allows access to all keys on the server", () => {
    const proxy = createBoundaryProxy(
      { DB_HOST: "localhost", NEXT_PUBLIC_URL: "http://example.com" },
      new Set(["DB_HOST"]),
      new Set(["NEXT_PUBLIC_URL"]),
      new Set(),
    );

    expect(proxy.DB_HOST).toBe("localhost");
    expect(proxy.NEXT_PUBLIC_URL).toBe("http://example.com");
  });

  it("prevents mutation on the config proxy (set)", () => {
    const proxy = createBoundaryProxy(
      { DB_HOST: "localhost" },
      new Set(["DB_HOST"]),
      new Set(),
      new Set(),
    );

    expect(() => {
      (proxy as Record<string, unknown>).DB_HOST = "changed";
    }).toThrow(/immutable/);
  });

  it("prevents mutation on the config proxy (delete)", () => {
    const proxy = createBoundaryProxy(
      { DB_HOST: "localhost" },
      new Set(["DB_HOST"]),
      new Set(),
      new Set(),
    );

    expect(() => {
      delete (proxy as Record<string, unknown>).DB_HOST;
    }).toThrow(/immutable/);
  });

  it("supports clientOnly() method to filter client keys", () => {
    const proxy = createBoundaryProxy(
      { DB_HOST: "localhost", NEXT_PUBLIC_URL: "http://example.com" },
      new Set(["DB_HOST"]),
      new Set(["NEXT_PUBLIC_URL"]),
      new Set(),
    ) as Record<string, unknown>;

    const clientProxy = (proxy as { clientOnly: () => Record<string, unknown> }).clientOnly();
    expect(clientProxy.NEXT_PUBLIC_URL).toBe("http://example.com");
    // Server key should be undefined in client proxy
    expect(clientProxy.DB_HOST).toBeUndefined();
  });

  it("supports serverOnly() method to filter server keys", () => {
    const proxy = createBoundaryProxy(
      { DB_HOST: "localhost", NEXT_PUBLIC_URL: "http://example.com" },
      new Set(["DB_HOST"]),
      new Set(["NEXT_PUBLIC_URL"]),
      new Set(),
    ) as Record<string, unknown>;

    const serverProxy = (proxy as { serverOnly: () => Record<string, unknown> }).serverOnly();
    expect(serverProxy.DB_HOST).toBe("localhost");
    expect(serverProxy.NEXT_PUBLIC_URL).toBeUndefined();
  });
});
