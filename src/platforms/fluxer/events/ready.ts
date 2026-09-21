import type { Client } from '@fluxerjs/core';
import { config } from '../../../config.js';
import { createLogger } from '../../../core/logger.js';
import { startPeriodicLogging } from '../../../core/periodicLogger.js';

const log = createLogger('FluxerReady');

export function handleFluxerReady(client: Client): void {
  const username = client.user?.username ?? 'Unknown Bot';
  const guildList = Array.from(client.guilds.values()).map((g) => `${g.name} (${g.id})`).join(', ') || 'None';

  log.info(`Fluxer bot online as ${username} (${client.user?.id}) | Guilds: ${client.guilds.size} [${guildList}] | Prefix: ${config.prefix}`);

  startPeriodicLogging();
}
