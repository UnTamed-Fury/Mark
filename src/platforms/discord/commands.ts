import { Collection, type Message } from 'discord.js';
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
} from '../../core/commandsData.js';
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
