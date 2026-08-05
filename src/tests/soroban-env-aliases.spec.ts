import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import {
  resolveEnv,
  resolveSorobanEnvVars,
  formatResolvedSorobanConfigForLog,
} from "../config/env";

function loadFreshConfig() {
  jest.resetModules();
  return require("../config").default as typeof import("../config").default;
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("resolveEnv (#404)", () => {
  it("prefers the canonical name over an alias", () => {
    const result = resolveEnv(
      {
        SOROBAN_CONTRACT_ID: "canonical-id",
        CONTRACT_ID: "alias-id",
      },
      "SOROBAN_CONTRACT_ID",
      ["CONTRACT_ID"],
    );
    expect(result).toEqual({
      value: "canonical-id",
      source: "SOROBAN_CONTRACT_ID",
    });
  });

  it("falls back to an alias when the canonical name is unset", () => {
    const result = resolveEnv(
      { CONTRACT_ID: "alias-id" },
      "SOROBAN_CONTRACT_ID",
      ["CONTRACT_ID"],
    );
    expect(result).toEqual({ value: "alias-id", source: "CONTRACT_ID" });
  });

  it("treats blank values as unset", () => {
    const result = resolveEnv(
      { SOROBAN_CONTRACT_ID: "   ", CONTRACT_ID: "alias-id" },
      "SOROBAN_CONTRACT_ID",
      ["CONTRACT_ID"],
    );
    expect(result).toEqual({ value: "alias-id", source: "CONTRACT_ID" });
  });
});

describe("resolveSorobanEnvVars (#404)", () => {
  it("maps STELLAR_RPC_URL and CONTRACT_ID aliases", () => {
    const resolved = resolveSorobanEnvVars({
      CONTRACT_ID: "CALIAS1234567890",
      STELLAR_RPC_URL: "https://alias-rpc.example",
    });
    expect(resolved.contractId).toEqual({
      value: "CALIAS1234567890",
      source: "CONTRACT_ID",
    });
    expect(resolved.rpcUrl).toEqual({
      value: "https://alias-rpc.example",
      source: "STELLAR_RPC_URL",
    });
  });

  it("redacts secrets in the startup log summary", () => {
    const summary = formatResolvedSorobanConfigForLog({
      contractId: { value: "CABCDE1234567890XYZ", source: "CONTRACT_ID" },
      rpcUrl: {
        value: "https://soroban-testnet.stellar.org",
        source: "STELLAR_RPC_URL",
      },
      network: "testnet",
      adminSecret: "SSECRETADMIN",
      oracleSecret: undefined,
    });

    expect(summary.adminSecret).toBe("[set]");
    expect(summary.oracleSecret).toBe("[unset]");
    expect(JSON.stringify(summary)).not.toContain("SSECRETADMIN");
    expect(summary.contractId).toBe("CABC…0XYZ");
    expect(summary.contractIdSource).toBe("CONTRACT_ID");
    expect(summary.rpcUrlSource).toBe("STELLAR_RPC_URL");
  });
});

describe("config.soroban alias wiring (#404)", () => {
  const baseEnv = {
    JWT_SECRET: "test-jwt-secret-value",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/xelma",
    SOROBAN_CONTRACT_ID: undefined as string | undefined,
    SOROBAN_RPC_URL: undefined as string | undefined,
    CONTRACT_ID: undefined as string | undefined,
    STELLAR_RPC_URL: undefined as string | undefined,
  };

  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-value";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      "postgresql://user:pass@localhost:5432/xelma";
  });

  afterEach(() => {
    delete process.env.CONTRACT_ID;
    delete process.env.STELLAR_RPC_URL;
    delete process.env.SOROBAN_CONTRACT_ID;
    delete process.env.SOROBAN_RPC_URL;
  });

  it("accepts CONTRACT_ID / STELLAR_RPC_URL when SOROBAN_* are unset", () => {
    const config = withEnv(
      {
        ...baseEnv,
        CONTRACT_ID: "CFROMALIAS0000000001",
        STELLAR_RPC_URL: "https://alias-rpc.example",
      },
      () => loadFreshConfig(),
    );

    expect(config.soroban.contractId).toBe("CFROMALIAS0000000001");
    expect(config.soroban.rpcUrl).toBe("https://alias-rpc.example");
  });

  it("prefers SOROBAN_* over aliases when both are set", () => {
    const config = withEnv(
      {
        ...baseEnv,
        SOROBAN_CONTRACT_ID: "CCANONICAL0000000001",
        CONTRACT_ID: "CALIASSHOULDLOSE0001",
        SOROBAN_RPC_URL: "https://canonical-rpc.example",
        STELLAR_RPC_URL: "https://alias-rpc.example",
      },
      () => loadFreshConfig(),
    );

    expect(config.soroban.contractId).toBe("CCANONICAL0000000001");
    expect(config.soroban.rpcUrl).toBe("https://canonical-rpc.example");
  });
});
