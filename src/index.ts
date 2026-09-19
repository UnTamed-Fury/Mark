import { config } from './config.js';
import { createLogger } from './core/logger.js';
import { createDiscordClient } from './platforms/discord/client.js';
import { createFluxerClient } from './platforms/fluxer/client.js';

const log = createLogger('UnifiedBootstrap');

async function main(): Promise<void> {
  log.info('Initializing AnimeX Unified Bot Engine...');

  const startDiscord = Boolean(config.discordToken);
  const startFluxer = Boolean(config.fluxerToken);

  if (!startDiscord && !startFluxer) {
    log.error('No bot tokens configured in .env (DISCORD_BOT_TOKEN or FLUXER_BOT_TOKEN required)');
    process.exit(1);
  }

  let discordClient: ReturnType<typeof createDiscordClient> | null = null;
  let fluxerClient: Awaited<ReturnType<typeof createFluxerClient>> | null = null;

  if (startDiscord && config.discordToken) {
    try {
      log.info('Starting Discord platform client...');
      discordClient = createDiscordClient();
      await discordClient.login(config.discordToken);
    } catch (error) {
      log.error('Failed to start Discord client:', error);
    }
  }

  if (startFluxer && config.fluxerToken) {
    try {
      log.info('Starting Fluxer platform client...');
      fluxerClient = await createFluxerClient();
      await fluxerClient.login(config.fluxerToken);
    } catch (error) {
      log.error('Failed to start Fluxer client:', error);
    }
  }

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log.info(`Received ${signal}, performing graceful shutdown...`);

    if (discordClient) {
      try {
        log.info('Destroying Discord client connection...');
        await discordClient.destroy();
      } catch (error) {
        log.error('Error destroying Discord client:', error);
      }
    }

    if (fluxerClient) {
      try {
        log.info('Destroying Fluxer client connection...');
        await fluxerClient.destroy();
      } catch (error) {
        log.error('Error destroying Fluxer client:', error);
      }
    }

    log.info('Graceful shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Promise Rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
  });
}

main().catch((error) => {
  log.error('Fatal initialization error:', error);
  process.exit(1);
});
