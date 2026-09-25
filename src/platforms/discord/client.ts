import {
  Client,
  Events,
  GatewayIntentBits,
  Options,
  Partials,
  type GuildMember,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { createLogger } from '../../core/logger.js';
import { setAfk, getRelativeTimestamp, type AfkScope } from '../../core/afkManager.js';
import { registerDiscordGatewayEvents } from './events/gateway.js';
import { handleDiscordMessageCreate } from './events/messageCreate.js';
import { handleDiscordReady } from './events/ready.js';

const log = createLogger('DiscordClient');

let activeDiscordClient: Client | null = null;

export function getDiscordClient(): Client | null {
  return activeDiscordClient;
}

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

  activeDiscordClient = client;

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

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    const customId = interaction.customId;
    if (!customId.startsWith('afk_')) return;

    // If already handled by collector, skip
    if (interaction.replied || interaction.deferred) return;

    const parts = customId.split('_'); // ['afk', 'global'|'server'|'cancel', targetUserId]
    const action = parts[1];
    const targetUserId = parts.slice(2).join('_');

    if (interaction.user.id !== targetUserId) {
      await interaction.reply({
        content: 'This AFK prompt is not for you.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }

    await interaction.deferUpdate().catch(() => {});

    if (action === 'cancel') {
      const cancelEmbed = new EmbedBuilder()
        .setColor(0x000001)
        .setTitle('AFK Cancelled')
        .setDescription('AFK setup was cancelled.');
      await interaction.editReply({ embeds: [cancelEmbed], components: [] }).catch(() => {});
      return;
    }

    const scope: AfkScope = action === 'global' ? 'global' : 'server';
    const serverName = interaction.guild?.name ?? 'this server';
    const entry = setAfk(interaction.user.id, scope, 'discord', interaction.guildId, interaction.guild?.name, 'AFK');
    const relativeTime = getRelativeTimestamp(entry.timestamp);
    const scopeLabel = scope === 'global' ? 'globally' : `in **${serverName}**`;

    const successEmbed = new EmbedBuilder()
      .setColor(0x000001)
      .setTitle(`${interaction.user.displayName || interaction.user.username} is now AFK`)
      .setDescription(
        `You are now set as AFK ${scopeLabel}.\n\n` +
        `• **Reason**: ${entry.reason}\n` +
        `• **Started**: ${relativeTime}`
      );

    await interaction.editReply({ embeds: [successEmbed], components: [] }).catch(() => {});
    log.info(`Fallback button AFK set for ${interaction.user.username} (${interaction.user.id}) [${scope}]`);
  });

  return client;
}
