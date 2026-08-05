import { describe, it, expect } from "@jest/globals";
import {
  mapSorobanError,
  ErrorCode,
  BusinessRuleError,
  ExternalServiceError,
} from "../utils/errors";

describe("mapSorobanError", () => {
  it("maps 'insufficient funds' to INSUFFICIENT_FUNDS BusinessRuleError", () => {
    const error = mapSorobanError("RPC Error: insufficient funds");
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
    expect(error.message).toBe("Insufficient funds for contract operation.");
  });

  it("maps 'nothing to claim' to CONTRACT_INVALID_STATE", () => {
    const error = mapSorobanError("HostError: nothing to claim");
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error.code).toBe(ErrorCode.CONTRACT_INVALID_STATE);
    expect(error.message).toBe("No claimable winnings available.");
  });

  it("maps 'invalid state' to CONTRACT_INVALID_STATE BusinessRuleError", () => {
    const error = mapSorobanError("Error 14: invalid state in contract");
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error.code).toBe(ErrorCode.CONTRACT_INVALID_STATE);
    expect(error.message).toBe("Contract operation rejected due to invalid state.");
  });

  it("maps 'timeout' to EXTERNAL_SERVICE_ERROR", () => {
    const error = mapSorobanError("request timeout exceeded");
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
    expect(error.message).toBe("Contract operation timed out.");
  });

  it("maps unknown errors to generic EXTERNAL_SERVICE_ERROR without leaking details", () => {
    const rawError = "Some obscure underlying ledger tx failure code 1234";
    const error = mapSorobanError(rawError);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
    expect(error.message).toBe("An unexpected contract error occurred.");
    expect(error.message).not.toContain("1234");
  });

  it("handles null or undefined gracefully", () => {
    const error = mapSorobanError(undefined);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
    expect(error.message).toBe("An unexpected contract error occurred.");
  });
});
