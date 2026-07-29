import { GameMode, PrismaClient, TournamentStatus } from '@prisma/client';

const prisma = new PrismaClient();

const hoursFromNow = (hours: number): Date => new Date(Date.now() + hours * 60 * 60 * 1000);

const tournamentSeeds = [
  {
    id: 'demo-updown-active',
    name: 'Demo Up/Down Sprint',
    description: 'Joinable active demo tournament for the binary UP/DOWN game mode.',
    mode: GameMode.UP_DOWN,
    status: TournamentStatus.ACTIVE,
    entryFee: '10',
    prizePool: '250',
    maxParticipants: 64,
    currentParticipants: 0,
    startTime: hoursFromNow(-1),
    endTime: hoursFromNow(23),
    rounds: 6,
  },
  {
    id: 'demo-legends-upcoming',
    name: 'Demo Legends Open',
    description: 'Upcoming demo tournament for range-based LEGENDS predictions.',
    mode: GameMode.LEGENDS,
    status: TournamentStatus.UPCOMING,
    entryFee: '25',
    prizePool: '1000',
    maxParticipants: 128,
    currentParticipants: 0,
    startTime: hoursFromNow(24),
    endTime: hoursFromNow(72),
    rounds: 12,
  },
  {
    id: 'demo-updown-completed',
    name: 'Demo Completed Classic',
    description: 'Completed historical tournament fixture for list and detail demos.',
    mode: GameMode.UP_DOWN,
    status: TournamentStatus.COMPLETED,
    entryFee: '5',
    prizePool: '120',
    maxParticipants: 32,
    currentParticipants: 0,
    startTime: hoursFromNow(-72),
    endTime: hoursFromNow(-24),
    rounds: 4,
  },
];

async function main() {
  console.log('Seeding demo tournaments...');

  for (const tournament of tournamentSeeds) {
    await prisma.tournament.upsert({
      where: { id: tournament.id },
      update: tournament,
      create: tournament,
    });
  }

  console.log(`Seeded ${tournamentSeeds.length} demo tournaments.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
