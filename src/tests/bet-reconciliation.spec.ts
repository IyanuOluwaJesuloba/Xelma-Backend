import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

jest.mock("../services/soroban.service", () => ({
  __esModule: true,
  default: {
    placeBet: jest.fn(),
    placePrecisionBet: jest.fn(),
  },
}));

jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../services/bet-audit.service", () => ({
  __esModule: true,
  default: {
    emitBetAccepted: jest.fn(),
    emitBetFailed: jest.fn(),
    emitBetReconciled: jest.fn(),
  },
}));

jest.mock("../services/websocket.service", () => ({
  __esModule: true,
  default: {
    emitBetAccepted: jest.fn(),
  },
}));

import betService from "../services/bet.service";
import betAuditService from "../services/bet-audit.service";
import sorobanService from "../services/soroban.service";
import { betStore } from "../data/bet-store";

const ADDRESS = "GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890";
const OTHER_ADDRESS = "GZZZZZZ1234567890ABCDEF1234567890ABCDEF1234567890";

describe("Bet reconciliation lifecycle (#403)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    betStore.reset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ----------------------------------------------------------------
  // Stub bets
  // ----------------------------------------------------------------

  describe("stub bets", () => {
    it("persists an UP/DOWN stub bet with STUB status and no txHash", async () => {
      process.env.BET_STUB_MODE = "true";

      const result = await betService.recordUpDownBet({
        address: ADDRESS,
        amount: 10,
        side: "UP",
      });

      const bet = betService.getBet(result.betId);

      expect(bet).toBeDefined();
      expect(bet!.status).toBe("STUB");
      expect(bet!.txHash).toBeUndefined();
      expect(bet!.submittedAt).toBeUndefined();
      expect(bet!.mode).toBe("updown");
      expect(bet!.side).toBe("UP");
      expect(bet!.amount).toBe(10);
      expect(bet!.address).toBe(ADDRESS);
      expect(bet!.timestamp).toEqual(expect.any(String));
    });

    it("persists a Precision stub bet with STUB status", async () => {
      process.env.BET_STUB_MODE = "true";

      const result = await betService.recordPrecisionBet({
        address: ADDRESS,
        amount: 5,
        predictedPrice: 0.12,
      });

      const bet = betService.getBet(result.betId);

      expect(bet!.status).toBe("STUB");
      expect(bet!.mode).toBe("precision");
      expect(bet!.predictedPrice).toBe(0.12);
      expect(bet!.txHash).toBeUndefined();
    });

    it("links the stub bet to the active round when one exists", async () => {
      process.env.BET_STUB_MODE = "true";
      const activeRound = betStore.getActiveRound("updown");

      const result = await betService.recordUpDownBet({
        address: ADDRESS,
        amount: 10,
        side: "UP",
      });

      expect(betService.getBet(result.betId)!.roundId).toBe(activeRound!.id);
    });
  });

  // ----------------------------------------------------------------
  // Stub -> chain upgrade
  // ----------------------------------------------------------------

  describe("reconcileBet — stub to on-chain upgrade", () => {
    it("upgrades a stub bet with a txHash and marks it CONFIRMED", async () => {
      process.env.BET_STUB_MODE = "true";

      const { betId } = await betService.recordUpDownBet({
        address: ADDRESS,
        amount: 10,
        side: "UP",
      });
      expect(betService.getBet(betId)!.status).toBe("STUB");

      const reconciled = betService.reconcileBet(betId, "0xdeadbeef");

      expect(reconciled).toBeDefined();
      expect(reconciled!.status).toBe("CONFIRMED");
      expect(reconciled!.txHash).toBe("0xdeadbeef");
      expect(reconciled!.confirmedAt).toEqual(expect.any(String));
      expect(betService.getBet(betId)!.status).toBe("CONFIRMED");
      expect(betService.getBet(betId)!.txHash).toBe("0xdeadbeef");
    });

    it("preserves the original record instead of creating a new one", async () => {
      process.env.BET_STUB_MODE = "true";

      const { betId } = await betService.recordUpDownBet({
        address: ADDRESS,
        amount: 10,
        side: "UP",
      });
      const before = betService.getBet(betId)!;

      betService.reconcileBet(betId, "0xdeadbeef");
      const after = betService.getBet(betId)!;

      expect(betService.getBets({ address: ADDRESS })).toHaveLength(1);
      expect(after.id).toBe(before.id);
      expect(after.timestamp).toBe(before.timestamp);
      expect(after.amount).toBe(before.amount);
    });

    it("emits a BET_RECONCILED audit event carrying the txHash", async () => {
      process.env.BET_STUB_MODE = "true";

      const { betId } = await betService.recordUpDownBet({
        address: ADDRESS,
        amount: 10,
        side: "UP",
      });

      betService.reconcileBet(betId, "0xdeadbeef");

      expect(betAuditService.emitBetReconciled).toHaveBeenCalledWith(
        expect.objectContaining({
          betId,
          address: ADDRESS,
          mode: "UP_DOWN",
          status: "CONFIRMED",
          txHash: "0xdeadbeef",
        })
      );
    });

    it("returns undefined for an unknown bet id without throwing", () => {
      expect(betService.reconcileBet("bet-does-not-exist", "0xabc")).toBeUndefined();
      expect(betAuditService.emitBetReconciled).not.toHaveBeenCalled();
    });

    it("clears a previous failure when a failed bet is later reconciled", async () => {
      process.env.BET_STUB_MODE = "false";
      (sorobanService.placeBet as jest.Mock).mockRejectedValue(
        new Error("RPC unavailable") as never
      );

      let betId: string | undefined;
      await expect(
        betService.recordUpDownBet({ address: ADDRESS, amount: 10, side: "UP" })
      ).rejects.toThrow("RPC unavailable");

      betId = betService.getBets({ address: ADDRESS })[0].id;
      expect(betService.getBet(betId)!.status).toBe("FAILED");

      const reconciled = betService.reconcileBet(betId, "0xlanded");

      expect(reconciled!.status).toBe("CONFIRMED");
      expect(reconciled!.txHash).toBe("0xlanded");
      expect(reconciled!.failureReason).toBeUndefined();
      expect(reconciled!.failedAt).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // On-chain success
  // ----------------------------------------------------------------

  describe("on-chain submissions", () => {
    it("marks a successful UP/DOWN submission CONFIRMED with its txHash", async () => {
      process.env.BET_STUB_MODE = "false";
      (sorobanService.placeBet as jest.Mock).mockResolvedValue({
        state: "on-chain-success",
        txHash: "0xabc",
      } as never);

      const result = await betService.recordUpDownBet({
        address: ADDRESS,
        amount: 10,
        side: "DOWN",
      });

      const bet = betService.getBet(result.betId)!;

      expect(result.status).toBe("CONFIRMED");
      expect(bet.status).toBe("CONFIRMED");
      expect(bet.txHash).toBe("0xabc");
      expect(bet.submittedAt).toEqual(expect.any(String));
      expect(bet.confirmedAt).toEqual(expect.any(String));
    });

    it("marks a successful Precision submission CONFIRMED with its txHash", async () => {
      process.env.BET_STUB_MODE = "false";
      (sorobanService.placePrecisionBet as jest.Mock).mockResolvedValue({
        state: "on-chain-success",
        txHash: "0x789",
      } as never);

      const result = await betService.recordPrecisionBet({
        address: ADDRESS,
        amount: 5,
        predictedPrice: 0.12,
      });

      const bet = betService.getBet(result.betId)!;

      expect(bet.status).toBe("CONFIRMED");
      expect(bet.txHash).toBe("0x789");
    });

    it("leaves the bet SUBMITTED when the chain call returns no txHash", async () => {
      process.env.BET_STUB_MODE = "false";
      (sorobanService.placeBet as jest.Mock).mockResolvedValue({
        state: "on-chain-success",
      } as never);

      const result = await betService.recordUpDownBet({
        address: ADDRESS,
        amount: 10,
        side: "UP",
      });

      const bet = betService.getBet(result.betId)!;

      expect(bet.status).toBe("SUBMITTED");
      expect(bet.txHash).toBeUndefined();
      expect(bet.submittedAt).toEqual(expect.any(String));
      expect(bet.confirmedAt).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // On-chain failure
  // ----------------------------------------------------------------

  describe("failed on-chain submissions", () => {
    beforeEach(() => {
      process.env.BET_STUB_MODE = "false";
    });

    it("marks the bet FAILED and records the reason", async () => {
      (sorobanService.placeBet as jest.Mock).mockRejectedValue(
        new Error("Contract error: insufficient balance") as never
      );

      await expect(
        betService.recordUpDownBet({ address: ADDRESS, amount: 10, side: "UP" })
      ).rejects.toThrow("Contract error: insufficient balance");

      const bets = betService.getBets({ address: ADDRESS });

      expect(bets).toHaveLength(1);
      expect(bets[0].status).toBe("FAILED");
      expect(bets[0].failureReason).toBe("Contract error: insufficient balance");
      expect(bets[0].failedAt).toEqual(expect.any(String));
      expect(bets[0].txHash).toBeUndefined();
    });

    it("still rethrows so the caller sees the failure", async () => {
      (sorobanService.placePrecisionBet as jest.Mock).mockRejectedValue(
        new Error("RPC unavailable") as never
      );

      await expect(
        betService.recordPrecisionBet({
          address: ADDRESS,
          amount: 5,
          predictedPrice: 0.12,
        })
      ).rejects.toThrow("RPC unavailable");
    });

    it("emits BET_FAILED and never BET_ACCEPTED", async () => {
      (sorobanService.placeBet as jest.Mock).mockRejectedValue(
        new Error("RPC unavailable") as never
      );

      await expect(
        betService.recordUpDownBet({ address: ADDRESS, amount: 10, side: "UP" })
      ).rejects.toThrow();

      expect(betAuditService.emitBetFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          address: ADDRESS,
          mode: "UP_DOWN",
          status: "FAILED",
          failureReason: "RPC unavailable",
        })
      );
      expect(betAuditService.emitBetAccepted).not.toHaveBeenCalled();
    });

    it("does not lose the record when the chain call fails", async () => {
      (sorobanService.placeBet as jest.Mock).mockRejectedValue(
        new Error("boom") as never
      );

      await expect(
        betService.recordUpDownBet({ address: ADDRESS, amount: 42, side: "UP" })
      ).rejects.toThrow();

      const bets = betService.getBets({ status: "FAILED" });

      expect(bets).toHaveLength(1);
      expect(bets[0].amount).toBe(42);
    });
  });

  // ----------------------------------------------------------------
  // Read API
  // ----------------------------------------------------------------

  describe("read API", () => {
    beforeEach(async () => {
      process.env.BET_STUB_MODE = "true";
      await betService.recordUpDownBet({ address: ADDRESS, amount: 1, side: "UP" });
      await betService.recordUpDownBet({ address: ADDRESS, amount: 2, side: "DOWN" });
      await betService.recordUpDownBet({
        address: OTHER_ADDRESS,
        amount: 3,
        side: "UP",
      });
    });

    it("filters by address", () => {
      expect(betService.getBets({ address: ADDRESS })).toHaveLength(2);
      expect(betService.getBets({ address: OTHER_ADDRESS })).toHaveLength(1);
    });

    it("filters by status", () => {
      const first = betService.getBets({ address: ADDRESS })[0];
      betService.reconcileBet(first.id, "0xaaa");

      expect(betService.getBets({ status: "CONFIRMED" })).toHaveLength(1);
      expect(betService.getBets({ status: "STUB" })).toHaveLength(2);
      expect(betService.getBets({ status: "FAILED" })).toHaveLength(0);
    });

    it("filters by round", () => {
      const roundId = betStore.getActiveRound("updown")!.id;

      expect(betService.getBets({ roundId })).toHaveLength(3);
      expect(betService.getBets({ roundId: "no-such-round" })).toHaveLength(0);
    });

    it("summarises bets per reconciliation status", () => {
      const first = betService.getBets({ address: ADDRESS })[0];
      betService.reconcileBet(first.id, "0xaaa");

      expect(betService.getReconciliationSummary()).toEqual({
        STUB: 2,
        SUBMITTED: 0,
        CONFIRMED: 1,
        FAILED: 0,
      });
    });

    it("returns copies so callers cannot mutate stored records", () => {
      const bets = betService.getBets({ address: ADDRESS });
      bets[0].status = "CONFIRMED";

      expect(betService.getBet(bets[0].id)!.status).toBe("STUB");
    });

    it("returns undefined for an unknown bet id", () => {
      expect(betService.getBet("bet-nope")).toBeUndefined();
    });
  });
});
