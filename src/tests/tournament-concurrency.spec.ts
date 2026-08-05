import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import { prisma } from '../lib/prisma';
import tournamentService from '../services/tournament.service';

const shouldRunDbTests =
  process.env.RUN_DB_TESTS === 'true' ||
  process.env.CI === 'true' ||
  (global as any).hasDb;

const describeDb = shouldRunDbTests ? describe : describe.skip;

// Tracked test entities — reassigned each beforeEach, cleaned up each afterEach
let tournament: any;
let users: any[] = [];

describeDb('TournamentService - Concurrent Join Race Safety (Issue #410)', () => {
  beforeAll(async () => {
    // Verify database connectivity before running tests
    if (shouldRunDbTests) {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        console.error(
          'Database connectivity check failed:',
          error instanceof Error ? error.message : error,
        );
        throw new Error(
          'Database unavailable for integration tests. Ensure DATABASE_URL is configured and database is running.',
        );
      }
    }
  });

  afterEach(async () => {
    // Clean up ALL tournament-related data created during this test.
    // The data mode is integration — only this suite runs, so broad deletes
    // are safe and prevent stale-reference bugs with scoped afterAll.
    await prisma.tournamentParticipant.deleteMany({});
    await prisma.tournament.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('concurrent joins cannot overfill the tournament', async () => {
    // Create a tournament with capacity for 3 participants
    tournament = await prisma.tournament.create({
      data: {
        name: 'Concurrency Test Tournament',
        description: 'Temporary tournament for concurrent join testing',
        mode: 'UP_DOWN',
        status: 'ACTIVE',
        entryFee: 10,
        prizePool: 100,
        maxParticipants: 3,
        currentParticipants: 0,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
        rounds: 5,
      },
    });

    // Create 5 test users
    users = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prisma.user.create({
          data: {
            walletAddress: `G_TOURNEY_CONCURRENCY_${i}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            virtualBalance: 1000,
          },
        }),
      ),
    );

    // Launch 5 concurrent join attempts on a tournament with capacity of 3.
    // Each user is unique so the @@unique constraint won't prevent the overfill —
    // the interactive transaction must be the one enforcing capacity.
    const results = await Promise.allSettled(
      users.map((user) => tournamentService.joinTournament(user.id, tournament.id)),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    // Exactly 3 should succeed (one per capacity slot)
    expect(fulfilled.length).toBe(3);
    // Exactly 2 should be rejected as full
    expect(rejected.length).toBe(2);

    // All rejections must be ConflictError("Tournament is full")
    for (const rejection of rejected) {
      expect(rejection.reason).toBeDefined();
      expect(rejection.reason.constructor.name).toBe('ConflictError');
      expect(rejection.reason.message).toBe('Tournament is full');
    }

    // Verify the database state reflects exactly 3 participants
    const participantCount = await prisma.tournamentParticipant.count({
      where: { tournamentId: tournament.id },
    });
    expect(participantCount).toBe(3);

    // Verify currentParticipants was incremented exactly to maxParticipants
    const updatedTournament = await prisma.tournament.findUnique({
      where: { id: tournament.id },
    });
    expect(updatedTournament!.currentParticipants).toBe(3);
  });

  it('rejects duplicate join from the same user under concurrency', async () => {
    // Create a tournament with capacity for 3 participants
    tournament = await prisma.tournament.create({
      data: {
        name: 'Concurrency Test Tournament',
        description: 'Temporary tournament for concurrent join testing',
        mode: 'UP_DOWN',
        status: 'ACTIVE',
        entryFee: 10,
        prizePool: 100,
        maxParticipants: 3,
        currentParticipants: 0,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
        rounds: 5,
      },
    });

    // Create one test user
    users = [
      await prisma.user.create({
        data: {
          walletAddress: `G_TOURNEY_DUP_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          virtualBalance: 1000,
        },
      }),
    ];

    const user = users[0];

    // Launch 5 simultaneous join attempts from the same user
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        tournamentService.joinTournament(user.id, tournament.id),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    // Only 1 should succeed due to the @@unique constraint + duplicate check
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(4);

    // All rejections should be "Already joined this tournament"
    for (const rejection of rejected) {
      expect(rejection.reason).toBeDefined();
      expect(rejection.reason.constructor.name).toBe('ConflictError');
      expect(rejection.reason.message).toBe('Already joined this tournament');
    }

    // Verify only 1 participant in DB
    const dbCount = await prisma.tournamentParticipant.count({
      where: { tournamentId: tournament.id },
    });
    expect(dbCount).toBe(1);
  });

  it('combined stress: 10 concurrent joiners on capacity 3', async () => {
    // Create a tournament with capacity for 3 participants
    tournament = await prisma.tournament.create({
      data: {
        name: 'Concurrency Test Tournament',
        description: 'Temporary tournament for concurrent join testing',
        mode: 'UP_DOWN',
        status: 'ACTIVE',
        entryFee: 10,
        prizePool: 100,
        maxParticipants: 3,
        currentParticipants: 0,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
        rounds: 5,
      },
    });

    // Create 10 test users
    users = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        prisma.user.create({
          data: {
            walletAddress: `G_TOURNEY_STRESS_${i}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            virtualBalance: 1000,
          },
        }),
      ),
    );

    const results = await Promise.allSettled(
      users.map((user) =>
        tournamentService.joinTournament(user.id, tournament.id),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult[];

    // Exactly 3 should succeed (capacity = 3)
    expect(fulfilled.length).toBe(3);
    // All 7 others must be rejected as full
    expect(rejected.length).toBe(7);

    for (const rejection of rejected) {
      expect(rejection.reason.message).toBe('Tournament is full');
    }

    // Verify DB state
    const dbCount = await prisma.tournamentParticipant.count({
      where: { tournamentId: tournament.id },
    });
    expect(dbCount).toBe(3);
  });

  it('returns ConflictError when a tournament is already full before any join', async () => {
    // Create a tournament with capacity for 3 participants
    tournament = await prisma.tournament.create({
      data: {
        name: 'Concurrency Test Tournament',
        description: 'Temporary tournament for concurrent join testing',
        mode: 'UP_DOWN',
        status: 'ACTIVE',
        entryFee: 10,
        prizePool: 100,
        maxParticipants: 3,
        currentParticipants: 0,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
        rounds: 5,
      },
    });

    // Pre-fill the tournament to capacity
    const fillUsers = await Promise.all(
      Array.from({ length: tournament.maxParticipants }, (_, i) =>
        prisma.user.create({
          data: {
            walletAddress: `G_TOURNEY_FILL_${i}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            virtualBalance: 1000,
          },
        }),
      ),
    );

    for (const fillUser of fillUsers) {
      await tournamentService.joinTournament(fillUser.id, tournament.id);
    }

    // Now the tournament is full — any new join should be rejected
    const freshUser = await prisma.user.create({
      data: {
        walletAddress: `G_TOURNEY_FRESH_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        virtualBalance: 1000,
      },
    });

    await expect(
      tournamentService.joinTournament(freshUser.id, tournament.id),
    ).rejects.toThrow('Tournament is full');

    // Verify participant count did not change
    const dbCount = await prisma.tournamentParticipant.count({
      where: { tournamentId: tournament.id },
    });
    expect(dbCount).toBe(tournament.maxParticipants);
  });
});
