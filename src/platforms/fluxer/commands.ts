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
} from '../../core/commandsData.js';
import { FAQ_ENTRIES, faqByCategory, isKnownCategory } from '../../core/faqData.js';
import { createLogger } from '../../core/logger.js';
import { createFluxerBrandEmbed, sendFluxerEmbed } from './embeds.js';

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
