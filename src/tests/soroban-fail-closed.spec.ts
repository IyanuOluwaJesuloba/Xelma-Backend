import { afterEach, describe, expect, it } from "@jest/globals";

/**
 * #401 — SOROBAN_FAIL_CLOSED config + money-path failure policy.
 * Keep these unit-only (no DB / network) so they stay fast locally.
 */

describe("SOROBAN_FAIL_CLOSED config (#401)", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    jest.resetModules();
  });

  function baseEnv() {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      "postgresql://user:pass@localhost:5432/testdb";
  }

  it("defaults to fail-open when SOROBAN_FAIL_CLOSED is unset", async () => {
    baseEnv();
    delete process.env.SOROBAN_FAIL_CLOSED;

    jest.resetModules();
    const config = (await import("../config")).default;
    expect(config.soroban.failClosed).toBe(false);
  });

  it("parses fail-closed when SOROBAN_FAIL_CLOSED=true", async () => {
    baseEnv();
    process.env.SOROBAN_FAIL_CLOSED = "true";

    jest.resetModules();
    const config = (await import("../config")).default;
    expect(config.soroban.failClosed).toBe(true);
  });

  it("parses fail-open when SOROBAN_FAIL_CLOSED=false", async () => {
    baseEnv();
    process.env.SOROBAN_FAIL_CLOSED = "false";

    jest.resetModules();
    const config = (await import("../config")).default;
    expect(config.soroban.failClosed).toBe(false);
  });
});

describe("Soroban money-path failure policy (#401)", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    jest.resetModules();
  });

  function baseEnv() {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      "postgresql://user:pass@localhost:5432/testdb";
    // Keep Soroban disabled so init is a no-op (no RPC).
    delete process.env.SOROBAN_CONTRACT_ID;
  }

  it("fail-open: applyMoneyPathFailure logs and does not throw", async () => {
    baseEnv();
    process.env.SOROBAN_FAIL_CLOSED = "false";

    jest.resetModules();
    const sorobanService = (await import("../services/soroban.service")).default;

    expect(sorobanService.isFailClosed()).toBe(false);
    expect(() =>
      sorobanService.applyMoneyPathFailure(
        "placeBet",
        new Error("rpc unavailable"),
      ),
    ).not.toThrow();
  });

  it("fail-closed: applyMoneyPathFailure rethrows so money paths abort", async () => {
    baseEnv();
    process.env.SOROBAN_FAIL_CLOSED = "true";

    jest.resetModules();
    const sorobanService = (await import("../services/soroban.service")).default;

    expect(sorobanService.isFailClosed()).toBe(true);
    expect(() =>
      sorobanService.applyMoneyPathFailure(
        "resolveRound",
        new Error("oracle signature failed"),
      ),
    ).toThrow(/oracle signature failed/);
  });

  it("fail-closed: non-Error values are wrapped and rethrown", async () => {
    baseEnv();
    process.env.SOROBAN_FAIL_CLOSED = "true";

    jest.resetModules();
    const sorobanService = (await import("../services/soroban.service")).default;

    expect(() =>
      sorobanService.applyMoneyPathFailure("placeBet", "chain down"),
    ).toThrow(/chain down/);
  });
});
