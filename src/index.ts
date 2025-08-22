#!/usr/bin/env node

import { CLICommands } from './cli/commands';
import { logger } from './utils/logger';

async function main() {
  try {
    // Initialize CLI commands
    const cli = new CLICommands();
    
    // Setup command structure
    cli.setupCommands();
    
    // Parse command line arguments
    cli.parse(process.argv);
  } catch (error) {
    logger.error('Application error:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\nReceived SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\nReceived SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Start the application
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
