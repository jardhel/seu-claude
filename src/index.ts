#!/usr/bin/env node

async function main(): Promise<void> {
  // Check for CLI commands BEFORE loading heavy dependencies
  if (process.argv[2] === 'setup') {
    const { runSetup } = await import('./setup.js');
    await runSetup();
    return;
  }

  if (process.argv[2] === 'doctor' || process.argv[2] === 'check') {
    const { runDoctor } = await import('./doctor.js');
    await runDoctor();
    return;
  }

  if (process.argv[2] === 'index') {
    const { runIndex } = await import('./cli-index.js');
    await runIndex(process.argv[3]);
    return;
  }

  if (process.argv[2] === 'stats') {
    const { runStats } = await import('./cli-stats.js');
    await runStats();
    return;
  }

  // Now load the server and its dependencies
  const { SeuClaudeServer } = await import('./server.js');
  const { logger } = await import('./utils/logger.js');
  const log = logger.child('main');

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

main().catch(async err => {
  // Dynamic import for error logging
  try {
    const { logger } = await import('./utils/logger.js');
    logger.child('main').error('Fatal error:', err);
  } catch {
    console.error('Fatal error:', err);
  }
  process.exit(1);
});
