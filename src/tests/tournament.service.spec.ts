import { describe, it, expect, afterEach } from '@jest/globals';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';

const mockTournamentFindUnique = jest.fn();
const mockTournamentUpdate = jest.fn();
const mockParticipantFindUnique = jest.fn();
const mockParticipantCreate = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../lib/prisma', () => ({
  prisma: {
    tournament: {
      findUnique: (...args: any[]) => mockTournamentFindUnique(...args),
      update: (...args: any[]) => mockTournamentUpdate(...args),
    },
    tournamentParticipant: {
      findUnique: (...args: any[]) => mockParticipantFindUnique(...args),
      create: (...args: any[]) => mockParticipantCreate(...args),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

// Imported after the mock so the service picks up the mocked prisma client.
import tournamentService from '../services/tournament.service';

const baseTournament = {
  id: 't-001',
  status: 'ACTIVE',
  currentParticipants: 5,
  maxParticipants: 10,
};

describe('TournamentService.joinTournament (Issue #412)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws NotFoundError when the tournament does not exist', async () => {
    mockTournamentFindUnique.mockResolvedValueOnce(null);

    await expect(
      tournamentService.joinTournament('user-1', 't-missing'),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('throws ValidationError when the tournament is cancelled', async () => {
    mockTournamentFindUnique.mockResolvedValueOnce({ ...baseTournament, status: 'CANCELLED' });

    await expect(
      tournamentService.joinTournament('user-1', 't-001'),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('throws ConflictError when the tournament is full', async () => {
    mockTournamentFindUnique.mockResolvedValueOnce({
      ...baseTournament,
      currentParticipants: 10,
      maxParticipants: 10,
    });

    await expect(
      tournamentService.joinTournament('user-1', 't-001'),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('throws ConflictError when the user already joined', async () => {
    mockTournamentFindUnique.mockResolvedValueOnce(baseTournament);
    mockParticipantFindUnique.mockResolvedValueOnce({
      tournamentId: 't-001',
      userId: 'user-1',
    });

    await expect(
      tournamentService.joinTournament('user-1', 't-001'),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('joins successfully and returns the updated participant count', async () => {
    mockTournamentFindUnique.mockResolvedValueOnce(baseTournament);
    mockParticipantFindUnique.mockResolvedValueOnce(null);
    mockTransaction.mockResolvedValueOnce([
      { tournamentId: 't-001', userId: 'user-1' },
      { ...baseTournament, currentParticipants: 6 },
    ]);

    const result = await tournamentService.joinTournament('user-1', 't-001');

    expect(result).toEqual({ currentParticipants: 6 });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('checks tournament status/capacity before checking existing membership', async () => {
    mockTournamentFindUnique.mockResolvedValueOnce({
      ...baseTournament,
      currentParticipants: 10,
      maxParticipants: 10,
    });

    await expect(
      tournamentService.joinTournament('user-1', 't-001'),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mockParticipantFindUnique).not.toHaveBeenCalled();
  });
});