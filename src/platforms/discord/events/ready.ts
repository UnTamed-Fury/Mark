import { ActivityType, type Client } from 'discord.js';
import { config } from '../../../config.js';
import { createLogger } from '../../../core/logger.js';
import { startPeriodicLogging } from '../../../core/periodicLogger.js';

const log = createLogger('DiscordReady');

export function handleDiscordReady(client: Client): void {
  const tag = client.user?.tag ?? 'Unknown Bot';
  const guildList = client.guilds.cache.map((g) => `${g.name} (${g.id})`).join(', ') || 'None';

  log.info(`Discord bot online as ${tag} (${client.user?.id}) | Guilds: ${client.guilds.cache.size} [${guildList}] | Prefix: ${config.prefix}`);

  client.user?.setPresence({
    activities: [
      {
        name: `${config.prefix}help | animex.one`,
        type: ActivityType.Playing,
      },
    ],
    status: 'online',
  });

  startPeriodicLogging(client);
}

