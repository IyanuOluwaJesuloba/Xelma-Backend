import dotenv from 'dotenv';
import { createServer } from 'http';

dotenv.config();

import app from './app';
import { initWebSocket, closeWebSocket } from './socket';

const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);

initWebSocket(httpServer).catch(error => {
  logger.error('WebSocket initialization failed', { error: (error as Error).message });
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const shutdown = () => {
  console.log('Shutting down gracefully...');
  closeWebSocket();
  // Ensure we don't hang on HTTP keep-alive connections
  httpServer.closeAllConnections();
  httpServer.close(() => {
    console.log('Shutdown complete');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
