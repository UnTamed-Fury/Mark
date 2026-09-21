import { type Message } from '@fluxerjs/core';
import { config } from '../../config.js';
import { BRAND } from '../../constants.js';
import {
  type StaticCommandContent,
  WEBSITE_COMMAND_DATA,
  DRAMA_COMMAND_DATA,
  NINE_ANIME_COMMAND_DATA,
  BOOST_COMMAND_DATA,
  ANIME_COMMAND_DATA,
  DOWNLOAD_COMMAND_DATA,
  RULES_COMMAND_META,
  getRulesCommandBody,
  TICKET_COMMAND_META,
  getTicketCommandBody,
  PING_COMMAND_META,
  calculatePingDetails,
  AFK_COMMAND_META,
  SYNC_COMMAND_META,
} from '../../core/commandsData.js';
import { setAfk, getRelativeTimestamp, type AfkScope } from '../../core/afkManager.js';
import { createSyncCode, claimSyncCode, getLinkedDiscordId, unlinkUser } from '../../core/syncManager.js';
import { FAQ_ENTRIES, faqByCategory, isKnownCategory } from '../../core/faqData.js';
import { createLogger } from '../../core/logger.js';
import { createFluxerBrandEmbed, sendFluxerEmbed } from './embeds.js';
import { getDiscordClient } from '../discord/client.js';
import { EmbedBuilder as DiscordEmbedBuilder } from 'discord.js';

const log = createLogger('FluxerCommands');

export interface FluxerCommand {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  execute(message: Message, args: string[]): Promise<void>;
}

function createStaticFluxerCommand(data: StaticCommandContent): FluxerCommand {
  return {
    name: data.name,
    aliases: data.aliases,
    description: data.description,
    async execute(message: Message): Promise<void> {
      const embed = createFluxerBrandEmbed(message)
        .setTitle(data.title)
        .setDescription(data.body);

      if (data.fields && data.fields.length > 0) {
        embed.addFields(...data.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
      }

      if (data.url) {
        embed.setURL(data.url);
      }

      await sendFluxerEmbed(message, embed);
    },
  };
}

const websiteCommand = createStaticFluxerCommand(WEBSITE_COMMAND_DATA);
const dramaCommand = createStaticFluxerCommand(DRAMA_COMMAND_DATA);
const nineAnimeCommand = createStaticFluxerCommand(NINE_ANIME_COMMAND_DATA);
const boostCommand = createStaticFluxerCommand(BOOST_COMMAND_DATA);
const animeCommand = createStaticFluxerCommand(ANIME_COMMAND_DATA);
const downloadCommand = createStaticFluxerCommand(DOWNLOAD_COMMAND_DATA);

const rulesCommand: FluxerCommand = {
  name: RULES_COMMAND_META.name,
  aliases: RULES_COMMAND_META.aliases,
  description: RULES_COMMAND_META.description,
  async execute(message: Message): Promise<void> {
    const embed = createFluxerBrandEmbed(message)
      .setTitle(RULES_COMMAND_META.title)
      .setDescription(getRulesCommandBody(config.rulesChannelId));
    await sendFluxerEmbed(message, embed);
  },
};

const ticketCommand: FluxerCommand = {
  name: TICKET_COMMAND_META.name,
  aliases: TICKET_COMMAND_META.aliases,
  description: TICKET_COMMAND_META.description,
  async execute(message: Message): Promise<void> {
    const embed = createFluxerBrandEmbed(message)
      .setTitle(TICKET_COMMAND_META.title)
      .setDescription(getTicketCommandBody(config.ticketChannelId));
    await sendFluxerEmbed(message, embed);
  },
};

const pingCommand: FluxerCommand = {
  name: PING_COMMAND_META.name,
  aliases: PING_COMMAND_META.aliases,
  description: PING_COMMAND_META.description,
  async execute(message: Message): Promise<void> {
    let wsPing = -1;
    try {
      wsPing = Math.round(message.client.ws.ping);
    } catch {
      // ws not yet connected or in mock test environment
    }
    const { emoji, text } = calculatePingDetails(wsPing);
    const embed = createFluxerBrandEmbed(message)
      .setTitle(`${emoji} Latency`)
      .setDescription(`WebSocket Ping: \`${text}\``);
    await sendFluxerEmbed(message, embed);
  },
};

const faqCommand: FluxerCommand = {
  name: 'faq',
  aliases: ['questions', 'qna', 'ask'],
  description: 'Frequently asked questions. Use <prefix>faq <category> or <prefix>faq for a list.',
  async execute(message: Message, args: string[]): Promise<void> {
    let category = args[0]?.toLowerCase() ?? '';
    if (category.startsWith(config.prefix)) {
      category = category.slice(config.prefix.length);
    }

    if (category.length === 0) {
      await sendFaqIndex(message);
      return;
    }

    if (!isKnownCategory(category)) {
      log.warn(`Unknown FAQ category requested: "${category}"`);
      const embed = createFluxerBrandEmbed(message)
        .setTitle('Unknown FAQ Category')
        .setDescription(`The category \`${category}\` does not exist.\n\nType \`${config.prefix}faq\` to view all available categories.`);
      await sendFluxerEmbed(message, embed);
      return;
    }

    const entry = faqByCategory.get(category);
    if (entry === undefined) {
      const embed = createFluxerBrandEmbed(message)
        .setTitle('FAQ Entry Missing')
        .setDescription('This category is registered but has no entry yet.');
      await sendFluxerEmbed(message, embed);
      return;
    }

    const embed = createFluxerBrandEmbed(message)
      .setTitle(`FAQ • ${entry.label}`)
      .setDescription(`**${entry.question}**\n\n${entry.answer}`);
    await sendFluxerEmbed(message, embed);
  },
};

async function sendFaqIndex(message: Message): Promise<void> {
  const lines = FAQ_ENTRIES.map(
    (entry) => `• \`${config.prefix}faq ${entry.category}\` — ${entry.label}`,
  );
  const embed = createFluxerBrandEmbed(message)
    .setTitle(`${BRAND.name} • FAQ Index`)
    .setDescription(lines.join('\n'));
  await sendFluxerEmbed(message, embed);
}

const helpCommand: FluxerCommand = {
  name: 'help',
  aliases: ['h', 'commands', 'cmd', 'cmds'],
  description: 'Lists available commands or details for a specific command.',
  async execute(message: Message, args: string[]): Promise<void> {
    const target = args[0]?.toLowerCase();

    if (!target) {
      const commandListText = COMMANDS.map(
        (cmd) => `• \`${config.prefix}${cmd.name}\` — ${cmd.description}`,
      ).join('\n');

      const embed = createFluxerBrandEmbed(message)
        .setTitle(`${BRAND.name} • Commands`)
        .setDescription(commandListText);
      await sendFluxerEmbed(message, embed);
      return;
    }

    let searchName = target;
    if (searchName.startsWith(config.prefix)) {
      searchName = searchName.slice(config.prefix.length);
    }

    const command = getFluxerCommand(searchName);
    if (command === null) {
      const embed = createFluxerBrandEmbed(message)
        .setTitle('Unknown Command')
        .setDescription(`Command \`${target}\` not found. Type \`${config.prefix}help\` for commands.`);
      await sendFluxerEmbed(message, embed);
      return;
    }

    const aliasesText =
      command.aliases && command.aliases.length > 0
        ? command.aliases.map((alias) => `\`${config.prefix}${alias}\``).join(', ')
        : 'None';

    const embed = createFluxerBrandEmbed(message)
      .setTitle(`Help • ${config.prefix}${command.name}`)
      .setDescription(command.description.replace(/<prefix>/g, config.prefix))
      .addFields(
        { name: 'Aliases', value: aliasesText, inline: true },
      );
    await sendFluxerEmbed(message, embed);
  },
};

const afkCommand: FluxerCommand = {
  name: AFK_COMMAND_META.name,
  aliases: AFK_COMMAND_META.aliases,
  description: AFK_COMMAND_META.description,
  async execute(message: Message, args: string[]): Promise<void> {
    const reason = args.join(' ').trim() || 'AFK';
    const serverName = 'this server';

    const embed = createFluxerBrandEmbed(message)
      .setTitle('AFK Configuration')
      .setDescription(
        `React below to choose your AFK scope for reason: **${reason}**\n\n` +
        `🌐 **Global AFK**: Set AFK across all servers (Discord & Fluxer).\n` +
        `🏠 **Server Only**: Set AFK only in this server.\n` +
        `❌ **Cancel**: Cancel AFK setup.`
      );

    const promptMsg = await sendFluxerEmbed(message, embed);

    await promptMsg.react('🌐').catch(() => {});
    await promptMsg.react('🏠').catch(() => {});
    await promptMsg.react('❌').catch(() => {});

    try {
      const reactions = await promptMsg.awaitReactions({
        filter: (reaction, user) =>
          user.id === message.author.id && ['🌐', '🏠', '❌'].includes(reaction.emoji.name ?? ''),
        max: 1,
        time: 60_000,
      });

      const collected = reactions.first();
      const emojiName = collected?.reaction.emoji.name;

      if (!emojiName || emojiName === '❌') {
        const cancelEmbed = createFluxerBrandEmbed(message)
          .setTitle('AFK Cancelled')
          .setDescription('AFK setup was cancelled.');
        await promptMsg.edit({ embeds: [cancelEmbed] }).catch(() => {});
        return;
      }

      const scope: AfkScope = emojiName === '🌐' ? 'global' : 'server';
      const entry = setAfk(message.author.id, scope, 'fluxer', message.guildId, serverName, reason);
      const relativeTime = getRelativeTimestamp(entry.timestamp);
      const scopeLabel = scope === 'global' ? 'globally' : `in **${serverName}**`;

      const successEmbed = createFluxerBrandEmbed(message)
        .setTitle(`${message.author.username} is now AFK`)
        .setDescription(
          `You are now set as AFK ${scopeLabel}.\n\n` +
          `• **Reason**: ${entry.reason}\n` +
          `• **Started**: ${relativeTime}`
        );

      await promptMsg.edit({ embeds: [successEmbed] }).catch(() => {});
    } catch {
      // Timeout after 60s
    }
  },
};

const syncCommand: FluxerCommand = {
  name: SYNC_COMMAND_META.name,
  aliases: SYNC_COMMAND_META.aliases,
  description: SYNC_COMMAND_META.description,
  async execute(message: Message, args: string[]): Promise<void> {
    // 1. Immediately delete the user's message so no code/arguments leak in chat
    if (typeof message.delete === 'function') {
      message.delete().catch(() => {});
    }

    const codeArg = args[0]?.trim();

    if (!codeArg) {
      const existing = getLinkedDiscordId(message.author.id);
      if (existing) {
        const embed = createFluxerBrandEmbed(message)
          .setTitle('Account Already Linked')
          .setDescription(
            `Your Fluxer account is currently linked to Discord ID: \`${existing}\`.\n\n` +
            `• To re-link, run \`${config.prefix}sync <code>\` with a code generated from Discord.\n` +
            `• To unlink, run \`${config.prefix}sync unlink\`.`
          );
        const rep = await sendFluxerEmbed(message, embed);
        setTimeout(() => {
          if (typeof rep.delete === 'function') rep.delete().catch(() => {});
        }, 15_000).unref?.();
        return;
      }

      const code = createSyncCode(message.author.id, 'fluxer');

      // Attempt sending the code via private DM on Fluxer
      let dmSent = false;
      try {
        const dmEmbed = createFluxerBrandEmbed(message)
          .setTitle('🔐 Private Account Sync Code')
          .setDescription(
            `Your one-time link code is:\n\n` +
            `# \`${code}\`\n\n` +
            `Go to **Discord** within **${config.syncCodeExpirySec || 30} seconds** and send:\n` +
            `\`${config.prefix}sync ${code}\`\n\n` +
            `*(Valid for ${config.syncCodeExpirySec || 30} seconds. Do not share this code with anyone).*`
          );
        await message.author.send({ embeds: [dmEmbed] });
        dmSent = true;
      } catch {
        dmSent = false;
      }

      if (dmSent) {
        const noticeEmbed = createFluxerBrandEmbed(message)
          .setTitle('Account Sync • One-Time Code')
          .setDescription(
            `📩 **A secret link code was sent to your private DMs!**\n\n` +
            `Go to **Discord** within **${config.syncCodeExpirySec || 30} seconds** to complete linking.\n` +
            `*(This notice auto-deletes in 15s)*`
          );
        const noticeMsg = await sendFluxerEmbed(message, noticeEmbed);
        setTimeout(() => {
          if (typeof noticeMsg.delete === 'function') noticeMsg.delete().catch(() => {});
        }, 15_000).unref?.();
      } else {
        const tempEmbed = createFluxerBrandEmbed(message)
          .setTitle('Account Sync Code')
          .setDescription(
            `⚠️ **Could not DM you (DMs may be closed).**\n\n` +
            `Your one-time link code is:\n\n` +
            `# \`${code}\`\n\n` +
            `Go to **Discord** within **${config.syncCodeExpirySec || 30} seconds** and send:\n` +
            `\`${config.prefix}sync ${code}\`\n\n` +
            `*(Auto-deleting in ${config.syncCodeExpirySec || 30} seconds for security).*`
          );
        const sentMsg = await sendFluxerEmbed(message, tempEmbed);
        setTimeout(() => {
          if (typeof sentMsg.delete === 'function') sentMsg.delete().catch(() => {});
        }, (config.syncCodeExpirySec || 30) * 1000).unref?.();
      }
      return;
    }

    if (codeArg.toLowerCase() === 'unlink') {
      const existing = getLinkedDiscordId(message.author.id);
      if (!existing) {
        const embed = createFluxerBrandEmbed(message)
          .setTitle('Not Linked')
          .setDescription('Your Fluxer account is not currently linked to any Discord account.');
        const rep = await sendFluxerEmbed(message, embed);
        setTimeout(() => {
          if (typeof rep.delete === 'function') rep.delete().catch(() => {});
        }, 10_000).unref?.();
        return;
      }
      unlinkUser(message.author.id, 'fluxer');
      const embed = createFluxerBrandEmbed(message)
        .setTitle('Account Unlinked')
        .setDescription(`Successfully unlinked your Fluxer account from Discord ID \`${existing}\`.`);
      await sendFluxerEmbed(message, embed);
      return;
    }

    const result = claimSyncCode(codeArg, message.author.id, 'fluxer');
    if (!result.success) {
      const errorEmbed = createFluxerBrandEmbed(message)
        .setTitle('Sync Failed')
        .setDescription(result.message);
      const rep = await sendFluxerEmbed(message, errorEmbed);
      setTimeout(() => {
        if (typeof rep.delete === 'function') rep.delete().catch(() => {});
      }, 10_000).unref?.();
      return;
    }

    const user = message.author;
    const member = message.member;
    const fluxerDisplayName = member?.nick || user.globalName || user.username;
    const avatarUrl = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL() : undefined;

    // Look up Discord user and send connection notification to Discord as well
    let discordTag = `\`${result.link?.discordId}\``;
    const discordClient = getDiscordClient();
    if (discordClient && result.link?.discordId) {
      try {
        const discordUser = await discordClient.users.fetch(result.link.discordId);
        if (discordUser) {
          discordTag = `${discordUser.tag} (\`${discordUser.id}\`)`;

          // Send connection DM to Discord user!
          const discordConfirmEmbed = new DiscordEmbedBuilder()
            .setColor(config.embedColor || BRAND.color)
            .setTitle('Account Linked Successfully!')
            .setDescription(
              `🎉 Your Discord account was just linked with Fluxer!\n\n` +
              `• **Fluxer User**: ${fluxerDisplayName} (\`@${user.username}\`)\n` +
              `• **Fluxer ID**: \`${user.id}\`\n` +
              `• **Discord User**: ${discordUser.tag}\n\n` +
              `Your **Global AFK** status will now seamlessly synchronize across both Discord and Fluxer.`
            )
            .setTimestamp();

          if (avatarUrl) {
            discordConfirmEmbed.setThumbnail(avatarUrl);
          }

          await discordUser.send({ embeds: [discordConfirmEmbed] }).catch(() => {});
        }
      } catch {
        // Discord DM is best effort
      }
    }

    const successEmbed = createFluxerBrandEmbed(message)
      .setTitle('Account Linked Successfully!')
      .setDescription(
        `🎉 Successfully linked your Fluxer account with Discord!\n\n` +
        `• **Fluxer User**: ${fluxerDisplayName} (\`@${user.username}\`)\n` +
        `• **Fluxer ID**: \`${user.id}\`\n` +
        `• **Linked Discord**: ${discordTag}\n\n` +
        `Your **Global AFK** status will now seamlessly synchronize across both platforms.`
      );

    if (avatarUrl) {
      successEmbed.setThumbnail(avatarUrl);
    }

    await sendFluxerEmbed(message, successEmbed);
  },
};

export const COMMANDS: readonly FluxerCommand[] = [
  websiteCommand,
  dramaCommand,
  nineAnimeCommand,
  boostCommand,
  rulesCommand,
  animeCommand,
  ticketCommand,
  downloadCommand,
  pingCommand,
  afkCommand,
  syncCommand,
  faqCommand,
  helpCommand,
];

const commandLookup = new Map<string, FluxerCommand>();

for (const command of COMMANDS) {
  registerCommand(command);
}

function registerCommand(command: FluxerCommand): void {
  commandLookup.set(command.name, command);
  for (const alias of command.aliases ?? []) {
    commandLookup.set(alias, command);
  }
}

export function getFluxerCommand(name: string): FluxerCommand | null {
  return commandLookup.get(name) ?? null;
}
