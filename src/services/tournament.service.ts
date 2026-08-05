import { GameMode, Prisma, TournamentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { NotFoundError, ConflictError, ValidationError } from "../utils/errors";
import { buildOffsetPage } from "../utils/pagination.util";
import type { TournamentListQuery } from "../schemas/tournament.schema";

export interface TournamentListItem {
  id: string;
  name: string;
  description: string;
  mode: "UP_DOWN" | "LEGENDS";
  status: "UPCOMING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  entryFee: string;
  prizePool: string;
  maxParticipants: number;
  currentParticipants: number;
  startTime: string;
  endTime: string;
  rounds: number;
  createdAt: string;
}

/** Seed data for hackathon / mock listing. */
export const MOCK_TOURNAMENTS: TournamentListItem[] = [
  {
    id: "t-001",
    name: "XLM Prediction Championship",
    description:
      "Compete against the best predictors in a multi-round UP/DOWN tournament.",
    mode: "UP_DOWN",
    status: "ACTIVE",
    entryFee: "50",
    prizePool: "5000",
    maxParticipants: 100,
    currentParticipants: 67,
    startTime: "2026-06-25T10:00:00Z",
    endTime: "2026-06-28T10:00:00Z",
    rounds: 10,
    createdAt: "2026-06-20T12:00:00Z",
  },
  {
    id: "t-002",
    name: "Legends Weekly Showdown",
    description:
      "Range-based prediction tournament for experienced players. Weekly prizes.",
    mode: "LEGENDS",
    status: "UPCOMING",
    entryFee: "100",
    prizePool: "10000",
    maxParticipants: 50,
    currentParticipants: 12,
    startTime: "2026-07-01T00:00:00Z",
    endTime: "2026-07-07T23:59:59Z",
    rounds: 20,
    createdAt: "2026-06-22T08:00:00Z",
  },
  {
    id: "t-003",
    name: "Beginner Friendly Cup",
    description:
      "Low entry fee tournament perfect for newcomers. Learn and earn!",
    mode: "UP_DOWN",
    status: "COMPLETED",
    entryFee: "10",
    prizePool: "500",
    maxParticipants: 200,
    currentParticipants: 143,
    startTime: "2026-06-18T00:00:00Z",
    endTime: "2026-06-20T23:59:59Z",
    rounds: 5,
    createdAt: "2026-06-15T10:00:00Z",
  },
];

export type TournamentListSource = "mock" | "prisma";

export function resolveTournamentListSource(
  override?: TournamentListSource,
): TournamentListSource {
  if (override) return override;
  const raw = process.env.TOURNAMENTS_SOURCE?.toLowerCase();
  if (raw === "prisma" || raw === "db" || raw === "postgres") return "prisma";
  return "mock";
}

/**
 * Apply mode/status filters to an in-memory tournament list.
 */
export function filterTournaments(
  items: TournamentListItem[],
  filters: { mode?: string; status?: string },
): TournamentListItem[] {
  let filtered = items;
  if (filters.mode) {
    filtered = filtered.filter((t) => t.mode === filters.mode);
  }
  if (filters.status) {
    filtered = filtered.filter((t) => t.status === filters.status);
  }
  return filtered;
}

function mapPrismaTournament(row: {
  id: string;
  name: string;
  description: string;
  mode: GameMode;
  status: TournamentStatus;
  entryFee: { toString(): string } | string | number;
  prizePool: { toString(): string } | string | number;
  maxParticipants: number;
  currentParticipants: number;
  startTime: Date;
  endTime: Date;
  rounds: number;
  createdAt: Date;
}): TournamentListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    mode: row.mode,
    status: row.status,
    entryFee: row.entryFee.toString(),
    prizePool: row.prizePool.toString(),
    maxParticipants: row.maxParticipants,
    currentParticipants: row.currentParticipants,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    rounds: row.rounds,
    createdAt: row.createdAt.toISOString(),
  };
}

export class TournamentService {
  /**
   * List tournaments with optional mode/status filters and offset pagination.
   * Defaults to mock seed data; set TOURNAMENTS_SOURCE=prisma for DB-backed lists.
   */
  async listTournaments(
    query: TournamentListQuery,
    source: TournamentListSource = resolveTournamentListSource(),
  ): Promise<{
    data: TournamentListItem[];
    pagination: { limit: number; offset: number; total: number };
  }> {
    const { limit, offset, mode, status } = query;

    if (source === "prisma") {
      return this.listFromPrisma({ limit, offset, mode, status });
    }
    return this.listFromMock({ limit, offset, mode, status });
  }

  listFromMock(query: TournamentListQuery) {
    const { limit, offset, mode, status } = query;
    const filtered = filterTournaments(MOCK_TOURNAMENTS, { mode, status });
    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);
    return buildOffsetPage(page, limit, offset, total);
  }

  async listFromPrisma(query: TournamentListQuery) {
    const { limit, offset, mode, status } = query;
    const where: Prisma.TournamentWhereInput = {};
    if (mode) where.mode = mode as GameMode;
    if (status) where.status = status as TournamentStatus;

    const [total, rows] = await Promise.all([
      prisma.tournament.count({ where }),
      prisma.tournament.findMany({
        where,
        orderBy: { startTime: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);

    return buildOffsetPage(
      rows.map(mapPrismaTournament),
      limit,
      offset,
      total,
    );
  }

  getMockById(id: string): TournamentListItem | undefined {
    return MOCK_TOURNAMENTS.find((t) => t.id === id);
  }

  async joinTournament(
    userId: string,
    tournamentId: string,
  ): Promise<{ currentParticipants: number }> {
    // Non-race-sensitive checks stay outside the transaction
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new NotFoundError("Tournament not found");
    }

    if (tournament.status === "CANCELLED") {
      throw new ValidationError("Tournament is cancelled");
    }

    // Atomic join: capacity check + duplicate check + create + increment
    // all inside the same interactive transaction to prevent check-then-act races.
    const updated = await prisma.$transaction(async (tx) => {
      // Re-fetch tournament inside transaction for a consistent snapshot
      const txTournament = await tx.tournament.findUnique({
        where: { id: tournamentId },
      });

      if (!txTournament) {
        throw new NotFoundError("Tournament not found");
      }

      if (txTournament.status === "CANCELLED") {
        throw new ValidationError("Tournament is cancelled");
      }

      // Atomic capacity check — serialised by the transaction so concurrent
      // requests see the latest count before deciding to join.
      if (txTournament.currentParticipants >= txTournament.maxParticipants) {
        throw new ConflictError("Tournament is full");
      }

      const existing = await tx.tournamentParticipant.findUnique({
        where: {
          tournamentId_userId: { tournamentId, userId },
        },
      });

      if (existing) {
        throw new ConflictError("Already joined this tournament");
      }

      const [, updatedTournament] = await Promise.all([
        tx.tournamentParticipant.create({
          data: { tournamentId, userId },
        }),
        tx.tournament.update({
          where: { id: tournamentId },
          data: { currentParticipants: { increment: 1 } },
        }),
      ]);

      return updatedTournament;
    });

    return { currentParticipants: updated.currentParticipants };
  }
}

export default new TournamentService();
