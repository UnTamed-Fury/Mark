import type { Client } from 'discord.js';
import { createLogger } from '../../../core/logger.js';

const log = createLogger('DiscordGateway');

export function registerDiscordGatewayEvents(client: Client): void {
  client.on('error', (error) => {
    log.error('Discord client encountered an error:', error);
  });

  client.on('warn', (warning) => {
    log.warn('Discord client warning:', warning);
  });

  client.on('shardError', (error, shardId) => {
    log.error(`Discord Shard #${shardId} encountered error:`, error);
  });

  client.on('shardDisconnect', (event, shardId) => {
    log.warn(`Discord Shard #${shardId} disconnected (code: ${event.code})`);
  });

  client.on('shardReconnecting', (shardId) => {
    log.info(`Discord Shard #${shardId} reconnecting...`);
  });

  client.on('shardResume', (shardId, replayedEvents) => {
    log.info(`Discord Shard #${shardId} resumed session (replayed ${replayedEvents} events)`);
  });
}
