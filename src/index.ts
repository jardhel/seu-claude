#!/usr/bin/env node

import { SeuClaudeServer } from './server.js';
import { logger } from './utils/logger.js';

const log = logger.child('main');

async function main(): Promise<void> {
  const server = new SeuClaudeServer();

  // Graceful shutdown handlers
  const shutdown = async (signal: string): Promise<void> => {
    log.info(`Received ${signal}, shutting down...`);
    try {
      await server.stop();
      process.exit(0);
    } catch (err) {
      log.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', err => {
    log.error('Uncaught exception:', err);
    void shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled rejection at:', promise, 'reason:', reason);
  });

  try {
    await server.start();
  } catch (err) {
    log.error('Failed to start server:', err);
    process.exit(1);
  }
}

main().catch(err => {
  log.error('Fatal error:', err);
  process.exit(1);
});
