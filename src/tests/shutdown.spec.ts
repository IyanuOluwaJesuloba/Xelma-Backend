import { createApp, startServer, isApiOnlyMode } from '../index';
import { createServer, Server as HttpServer } from 'http';
import { closeWebSocket } from '../socket';

// Mock dependencies that would otherwise attempt real connections or polling
jest.mock('../services/oracle', () => ({
   startPolling: jest.fn(),
   stopPolling: jest.fn(),
   getPriceString: jest.fn().mockReturnValue('0.123'),
}));
jest.mock('../services/scheduler.service', () => ({
   start: jest.fn(),
   stop: jest.fn(),
}));
jest.mock('../services/round-scheduler.service', () => ({
   start: jest.fn(),
   stop: jest.fn(),
}));
jest.mock('../services/oracle.service', () => ({
   start: jest.fn(),
   stop: jest.fn(),
}));
jest.mock('../services/websocket.service', () => ({
   emitPriceUpdate: jest.fn(),
   initialize: jest.fn(),
}));
jest.mock('../lib/prisma', () => ({
   prisma: {
      $disconnect: jest.fn().mockResolvedValue(undefined),
   },
}));
jest.mock('../utils/logger', () => ({
   info: jest.fn(),
   error: jest.fn(),
   warn: jest.fn(),
}));

describe('Graceful Shutdown', () => {
   let originalEnv: NodeJS.ProcessEnv;

   beforeEach(() => {
      originalEnv = process.env;
      process.env = { ...originalEnv, PORT: '0' }; // Use random port for tests
   });

   afterEach(() => {
      process.env = originalEnv;
      jest.clearAllMocks();
   });

   it('should start the server and clean up all resources cleanly', async () => {
      const app = createApp();
      const { httpServer, cleanup } = await startServer(app);

      expect(httpServer).toBeInstanceOf(HttpServer);
      expect(httpServer.listening).toBe(true);

      // Perform cleanup
      await cleanup();

      // Ensure the HTTP server is closed
      expect(httpServer.listening).toBe(false);

      // We should check that no open handles remain, but Jest handles that
      // via --detectOpenHandles if needed. This test exiting cleanly 
      // is the primary validation that our intervals are cleared.
   });
});
