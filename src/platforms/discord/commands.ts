import {
  Collection,
  type Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ButtonInteraction,
} from 'discord.js';
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
import { createSyncCode, claimSyncCode, getLinkedFluxerId } from '../../core/syncManager.js';
import { FAQ_ENTRIES, faqByCategory, isKnownCategory } from '../../core/faqData.js';
import { createLogger } from '../../core/logger.js';
import { createBrandEmbed, sendEmbed } from './embeds.js';

const log = createLogger('DiscordCommands');

export interface DiscordCommand {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  execute(message: Message, args: string[]): Promise<void>;
}

function createStaticDiscordCommand(data: StaticCommandContent): DiscordCommand {
  return {
    name: data.name,
    aliases: data.aliases,
    description: data.description,
    async execute(message: Message): Promise<void> {
      const embed = createBrandEmbed(message)
        .setTitle(data.title)
        .setDescription(data.body);

      if (data.fields && data.fields.length > 0) {
        embed.addFields(data.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
      }

      if (data.url) {
        embed.setURL(data.url);
      }

      await sendEmbed(message, embed);
    },
  };
}

const websiteCommand = createStaticDiscordCommand(WEBSITE_COMMAND_DATA);
const dramaCommand = createStaticDiscordCommand(DRAMA_COMMAND_DATA);
const nineAnimeCommand = createStaticDiscordCommand(NINE_ANIME_COMMAND_DATA);
const boostCommand = createStaticDiscordCommand(BOOST_COMMAND_DATA);
const animeCommand = createStaticDiscordCommand(ANIME_COMMAND_DATA);
const downloadCommand = createStaticDiscordCommand(DOWNLOAD_COMMAND_DATA);

const rulesCommand: DiscordCommand = {
  name: RULES_COMMAND_META.name,
  aliases: RULES_COMMAND_META.aliases,
  description: RULES_COMMAND_META.description,
  async execute(message: Message): Promise<void> {
    const embed = createBrandEmbed(message)
      .setTitle(RULES_COMMAND_META.title)
      .setDescription(getRulesCommandBody(config.rulesChannelId));
    await sendEmbed(message, embed);
  },
};

const ticketCommand: DiscordCommand = {
  name: TICKET_COMMAND_META.name,
  aliases: TICKET_COMMAND_META.aliases,
  description: TICKET_COMMAND_META.description,
  async execute(message: Message): Promise<void> {
    const embed = createBrandEmbed(message)
      .setTitle(TICKET_COMMAND_META.title)
      .setDescription(getTicketCommandBody(config.ticketChannelId));
    await sendEmbed(message, embed);
  },
};

const pingCommand: DiscordCommand = {
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
    const embed = createBrandEmbed(message)
      .setTitle(`${emoji} Latency`)
      .setDescription(`WebSocket Ping: \`${text}\``);
    await sendEmbed(message, embed);
  },
};

const faqCommand: DiscordCommand = {
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
      const embed = createBrandEmbed(message)
        .setTitle('Unknown FAQ Category')
        .setDescription(`The category \`${category}\` does not exist.\n\nType \`${config.prefix}faq\` to view all available categories.`);
      await sendEmbed(message, embed);
      return;
    }

    const entry = faqByCategory.get(category);
    if (entry === undefined) {
      const embed = createBrandEmbed(message)
        .setTitle('FAQ Entry Missing')
        .setDescription('This category is registered but has no entry yet.');
      await sendEmbed(message, embed);
      return;
    }

    const embed = createBrandEmbed(message)
      .setTitle(`FAQ • ${entry.label}`)
      .setDescription(`**${entry.question}**\n\n${entry.answer}`);
    await sendEmbed(message, embed);
  },
};

async function sendFaqIndex(message: Message): Promise<void> {
  const lines = FAQ_ENTRIES.map(
    (entry) => `• \`${config.prefix}faq ${entry.category}\` — ${entry.label}`,
  );
  const embed = createBrandEmbed(message)
    .setTitle(`${BRAND.name} • FAQ Index`)
    .setDescription(lines.join('\n'));
  await sendEmbed(message, embed);
}

const helpCommand: DiscordCommand = {
  name: 'help',
  aliases: ['h', 'commands', 'cmd', 'cmds'],
  description: 'Lists available commands or details for a specific command.',
  async execute(message: Message, args: string[]): Promise<void> {
    const target = args[0]?.toLowerCase();

    if (!target) {
      const commandListText = COMMANDS.map(
        (cmd) => `• \`${config.prefix}${cmd.name}\` — ${cmd.description}`,
      ).join('\n');

      const embed = createBrandEmbed(message)
        .setTitle(`${BRAND.name} • Commands`)
        .setDescription(commandListText);
      await sendEmbed(message, embed);
      return;
    }

    let searchName = target;
    if (searchName.startsWith(config.prefix)) {
      searchName = searchName.slice(config.prefix.length);
    }

    const command = getDiscordCommand(searchName);
    if (command === null) {
      const embed = createBrandEmbed(message)
        .setTitle('Unknown Command')
        .setDescription(`Command \`${target}\` not found. Type \`${config.prefix}help\` for commands.`);
      await sendEmbed(message, embed);
      return;
    }

    const aliasesText =
      command.aliases && command.aliases.length > 0
        ? command.aliases.map((alias) => `\`${config.prefix}${alias}\``).join(', ')
        : 'None';

    const embed = createBrandEmbed(message)
      .setTitle(`Help • ${config.prefix}${command.name}`)
      .setDescription(command.description.replace(/<prefix>/g, config.prefix))
      .addFields(
        { name: 'Aliases', value: aliasesText, inline: true },
      );
    await sendEmbed(message, embed);
  },
};

const afkCommand: DiscordCommand = {
  name: AFK_COMMAND_META.name,
  aliases: AFK_COMMAND_META.aliases,
  description: AFK_COMMAND_META.description,
  async execute(message: Message, args: string[]): Promise<void> {
    const reason = args.join(' ').trim() || 'AFK';
    const serverName = message.guild?.name ?? 'this server';

    const embed = createBrandEmbed(message)
      .setTitle('AFK Configuration')
      .setDescription(
        `Choose your AFK scope below for reason: **${reason}**\n\n` +
        `🌐 **Global AFK**: Set AFK across all servers (Discord & Fluxer).\n` +
        `🏠 **Server Only**: Set AFK only in **${serverName}**.\n` +
        `❌ **Cancel**: Cancel AFK setup.`
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`afk_global_${message.author.id}`)
        .setLabel('Global AFK')
        .setEmoji('🌐')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`afk_server_${message.author.id}`)
        .setLabel('Server Only')
        .setEmoji('🏠')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`afk_cancel_${message.author.id}`)
        .setLabel('Cancel')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
    );

    const promptMsg = await message.reply({
      embeds: [embed],
      components: [row],
      allowedMentions: { repliedUser: false },
    });

    try {
      const interaction = await promptMsg.awaitMessageComponent({
        filter: (i: ButtonInteraction) => {
          if (i.user.id !== message.author.id) {
            i.reply({ content: 'This AFK prompt is not for you.', ephemeral: true }).catch(() => {});
            return false;
          }
          return i.customId.startsWith('afk_');
        },
        componentType: ComponentType.Button,
        time: 60_000,
      });

      if (interaction.customId.startsWith('afk_cancel_')) {
        const cancelEmbed = createBrandEmbed(message)
          .setTitle('AFK Cancelled')
          .setDescription('AFK setup was cancelled.');
        await interaction.update({ embeds: [cancelEmbed], components: [] });
        return;
      }

      const scope: AfkScope = interaction.customId.startsWith('afk_global_') ? 'global' : 'server';
      const entry = setAfk(message.author.id, scope, 'discord', message.guildId, message.guild?.name, reason);
      const relativeTime = getRelativeTimestamp(entry.timestamp);
      const scopeLabel = scope === 'global' ? 'globally' : `in **${serverName}**`;

      const successEmbed = createBrandEmbed(message)
        .setTitle(`${message.author.displayName || message.author.username} is now AFK`)
        .setDescription(
          `You are now set as AFK ${scopeLabel}.\n\n` +
          `• **Reason**: ${entry.reason}\n` +
          `• **Started**: ${relativeTime}`
        );

      await interaction.update({ embeds: [successEmbed], components: [] });
    } catch {
      // Timeout after 60s
      await promptMsg.edit({ components: [] }).catch(() => {});
    }
  },
};

const syncCommand: DiscordCommand = {
  name: SYNC_COMMAND_META.name,
  aliases: SYNC_COMMAND_META.aliases,
  description: SYNC_COMMAND_META.description,
  async execute(message: Message, args: string[]): Promise<void> {
    const codeArg = args[0]?.trim();

    if (!codeArg) {
      const existing = getLinkedFluxerId(message.author.id);
      if (existing) {
        const embed = createBrandEmbed(message)
          .setTitle('Account Already Linked')
          .setDescription(
            `Your Discord account is currently linked to Fluxer ID: \`${existing}\`.\n\n` +
            `To re-link, run \`${config.prefix}sync <code>\` with a code generated from Fluxer.`
          );
        await sendEmbed(message, embed);
        return;
      }

      const code = createSyncCode(message.author.id, 'discord');
      const tempEmbed = createBrandEmbed(message)
        .setTitle('Account Sync Code')
        .setDescription(
          `Your one-time link code is:\n\n` +
          `# \`${code}\`\n\n` +
          `Go to **Fluxer** within **30 seconds** and send:\n` +
          `\`${config.prefix}sync ${code}\`\n\n` +
          `*(This message will auto-delete in 30 seconds for security).*`
        );

      const sentMsg = await message.reply({
        embeds: [tempEmbed],
        allowedMentions: { repliedUser: false },
      });

      setTimeout(() => {
        sentMsg.delete().catch(() => {});
      }, 30_000);
      return;
    }

    const result = claimSyncCode(codeArg, message.author.id, 'discord');
    if (!result.success) {
      const errorEmbed = createBrandEmbed(message)
        .setTitle('Sync Failed')
        .setDescription(result.message);
      await sendEmbed(message, errorEmbed);
      return;
    }

    const successEmbed = createBrandEmbed(message)
      .setTitle('Account Linked Successfully!')
      .setDescription(
        `🎉 Successfully linked your Discord account with Fluxer ID \`${result.link?.fluxerId}\`!\n\n` +
        `Your **Global AFK** status will now seamlessly synchronize across both platforms.`
      );
    await sendEmbed(message, successEmbed);
  },
};

export const COMMANDS: readonly DiscordCommand[] = [
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

const commandLookup = new Collection<string, DiscordCommand>();

for (const command of COMMANDS) {
  registerCommand(command);
}

function registerCommand(command: DiscordCommand): void {
  commandLookup.set(command.name, command);
  for (const alias of command.aliases ?? []) {
    commandLookup.set(alias, command);
  }
}

export function getDiscordCommand(name: string): DiscordCommand | null {
  return commandLookup.get(name) ?? null;
}
