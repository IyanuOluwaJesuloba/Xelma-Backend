import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import betService from "../services/bet.service";

jest.mock("../services/soroban.service", () => ({
  __esModule: true,
  default: {
    placeBet: jest.fn(),
    placePrecisionBet: jest.fn(),
    claimWinnings: jest.fn(),
  },
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("../services/bet-audit.service", () => ({
  __esModule: true,
  default: {
    emitBetAccepted: jest.fn(),
    emitClaimAccepted: jest.fn(),
  },
}));

jest.mock("../services/websocket.service", () => ({
  __esModule: true,
  default: {
    emitBetAccepted: jest.fn(),
  },
}));

import sorobanService from "../services/soroban.service";
import betAuditService from "../services/bet-audit.service";

const VALID_ADDRESS = "GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";

describe("BetService.claimWinnings", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns stub claim when BET_STUB_MODE=true", async () => {
    process.env.BET_STUB_MODE = "true";

    const result = await betService.claimWinnings(VALID_ADDRESS);

    expect(result).toEqual({ state: "stub", amount: 0 });
    expect(sorobanService.claimWinnings).not.toHaveBeenCalled();
    expect(betAuditService.emitClaimAccepted).toHaveBeenCalledWith({
      address: VALID_ADDRESS,
      amount: 0,
      result: "stub",
      txHash: undefined,
    });
  });

  it("calls SorobanService and audits when BET_STUB_MODE=false", async () => {
    process.env.BET_STUB_MODE = "false";
    (sorobanService.claimWinnings as jest.Mock).mockResolvedValue({
      state: "on-chain-success",
      amount: 12.5,
      txHash: "0xclaim",
    });

    const result = await betService.claimWinnings(VALID_ADDRESS, "idem-key-1");

    expect(result).toEqual({
      state: "on-chain-success",
      amount: 12.5,
      txHash: "0xclaim",
    });
    expect(sorobanService.claimWinnings).toHaveBeenCalledWith(VALID_ADDRESS);
    expect(betAuditService.emitClaimAccepted).toHaveBeenCalledWith({
      address: VALID_ADDRESS,
      amount: 12.5,
      result: "on-chain-success",
      txHash: "0xclaim",
    });
  });

  it("does not audit when Soroban claim throws", async () => {
    process.env.BET_STUB_MODE = "false";
    (sorobanService.claimWinnings as jest.Mock).mockRejectedValue(
      new Error("contract failed")
    );

    await expect(betService.claimWinnings(VALID_ADDRESS)).rejects.toThrow(
      "contract failed"
    );
    expect(betAuditService.emitClaimAccepted).not.toHaveBeenCalled();
  });
});
