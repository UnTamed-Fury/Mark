import { Client, Events, GatewayIntentBits, Options, Partials, type GuildMember } from 'discord.js';
import { createLogger } from '../../core/logger.js';
import { registerDiscordGatewayEvents } from './events/gateway.js';
import { handleDiscordMessageCreate } from './events/messageCreate.js';
import { handleDiscordReady } from './events/ready.js';

const log = createLogger('DiscordClient');

export function createDiscordClient(): Client {
  const client: Client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.User,
      Partials.GuildMember,
    ],
    makeCache: Options.cacheWithLimits({
      MessageManager: 50,
      GuildMemberManager: {
        maxSize: 200,
        keepOverLimit: (member: GuildMember): boolean => member.id === client.user?.id,
      },
      PresenceManager: 0,
      ReactionManager: 0,
    }),
    sweepers: {
      messages: {
        interval: 600,
        lifetime: 1800,
      },
    },
  });

  registerDiscordGatewayEvents(client);

  client.once(Events.ClientReady, (readyClient) => {
    handleDiscordReady(readyClient);
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleDiscordMessageCreate(message);
    } catch (error) {
      log.error('Unhandled error in Discord messageCreate listener:', error);
    }
  });

  return client;
}
