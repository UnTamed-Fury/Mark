import { config } from '../config.js';
import { BRAND } from '../constants.js';
import { FAQ_ENTRIES, faqByCategory, isKnownCategory } from './faqData.js';
import {
  type EmbedFieldData,
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
  UPTIME_COMMAND_META,
} from './commandsData.js';
import { formatDuration } from './afkManager.js';

export interface CommandEmbedPayload {
  readonly title: string;
  readonly description: string;
  readonly fields?: readonly EmbedFieldData[];
  readonly url?: string;
}

export interface StandardCommandDef {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  getPayload(ctx: { wsPing?: number; args?: string[]; platform?: 'discord' | 'fluxer' }): CommandEmbedPayload;
}

export function buildFaqPayload(rawCategory?: string, prefix = config.prefix): CommandEmbedPayload {
  let category = rawCategory?.toLowerCase() ?? '';
  if (category.startsWith(prefix)) {
    category = category.slice(prefix.length);
  }

  if (category.length === 0) {
    const lines = FAQ_ENTRIES.map(
      (entry) => `• \`${prefix}faq ${entry.category}\` — ${entry.label}`,
    );
    return {
      title: `${BRAND.name} • FAQ Index`,
      description: lines.join('\n'),
    };
  }

  if (!isKnownCategory(category)) {
    return {
      title: 'Unknown FAQ Category',
      description: `The category \`${category}\` does not exist.\n\nType \`${prefix}faq\` to view all available categories.`,
    };
  }

  const entry = faqByCategory.get(category);
  if (!entry) {
    return {
      title: 'FAQ Entry Missing',
      description: 'This category is registered but has no entry yet.',
    };
  }

  return {
    title: `FAQ • ${entry.label}`,
    description: `**${entry.question}**\n\n${entry.answer}`,
  };
}

export function buildHelpPayload(
  allCommands: readonly { name: string; description: string; aliases?: readonly string[] }[],
  targetCommandName?: string,
  prefix = config.prefix,
): CommandEmbedPayload {
  if (!targetCommandName) {
    const commandListText = allCommands.map(
      (cmd) => `• \`${prefix}${cmd.name}\` — ${cmd.description}`,
    ).join('\n');
    return {
      title: `${BRAND.name} • Commands`,
      description: commandListText,
    };
  }

  let searchName = targetCommandName.toLowerCase();
  if (searchName.startsWith(prefix)) {
    searchName = searchName.slice(prefix.length);
  }

  const command = allCommands.find(
    (c) => c.name === searchName || c.aliases?.includes(searchName),
  );

  if (!command) {
    return {
      title: 'Unknown Command',
      description: `Command \`${targetCommandName}\` not found. Type \`${prefix}help\` for commands.`,
    };
  }

  const aliasesText =
    command.aliases && command.aliases.length > 0
      ? command.aliases.map((alias) => `\`${prefix}${alias}\``).join(', ')
      : 'None';

  return {
    title: `Help • ${prefix}${command.name}`,
    description: command.description.replace(/<prefix>/g, prefix),
    fields: [{ name: 'Aliases', value: aliasesText, inline: true }],
  };
}

export const STANDARD_COMMANDS: readonly StandardCommandDef[] = [
  {
    name: WEBSITE_COMMAND_DATA.name,
    aliases: WEBSITE_COMMAND_DATA.aliases,
    description: WEBSITE_COMMAND_DATA.description,
    getPayload: () => ({
      title: WEBSITE_COMMAND_DATA.title,
      description: WEBSITE_COMMAND_DATA.body,
      fields: WEBSITE_COMMAND_DATA.fields,
      url: WEBSITE_COMMAND_DATA.url,
    }),
  },
  {
    name: DRAMA_COMMAND_DATA.name,
    aliases: DRAMA_COMMAND_DATA.aliases,
    description: DRAMA_COMMAND_DATA.description,
    getPayload: () => ({
      title: DRAMA_COMMAND_DATA.title,
      description: DRAMA_COMMAND_DATA.body,
      fields: DRAMA_COMMAND_DATA.fields,
      url: DRAMA_COMMAND_DATA.url,
    }),
  },
  {
    name: NINE_ANIME_COMMAND_DATA.name,
    aliases: NINE_ANIME_COMMAND_DATA.aliases,
    description: NINE_ANIME_COMMAND_DATA.description,
    getPayload: () => ({
      title: NINE_ANIME_COMMAND_DATA.title,
      description: NINE_ANIME_COMMAND_DATA.body,
      fields: NINE_ANIME_COMMAND_DATA.fields,
      url: NINE_ANIME_COMMAND_DATA.url,
    }),
  },
  {
    name: BOOST_COMMAND_DATA.name,
    aliases: BOOST_COMMAND_DATA.aliases,
    description: BOOST_COMMAND_DATA.description,
    getPayload: () => ({
      title: BOOST_COMMAND_DATA.title,
      description: BOOST_COMMAND_DATA.body,
      fields: BOOST_COMMAND_DATA.fields,
    }),
  },
  {
    name: ANIME_COMMAND_DATA.name,
    aliases: ANIME_COMMAND_DATA.aliases,
    description: ANIME_COMMAND_DATA.description,
    getPayload: () => ({
      title: ANIME_COMMAND_DATA.title,
      description: ANIME_COMMAND_DATA.body,
      fields: ANIME_COMMAND_DATA.fields,
    }),
  },
  {
    name: DOWNLOAD_COMMAND_DATA.name,
    aliases: DOWNLOAD_COMMAND_DATA.aliases,
    description: DOWNLOAD_COMMAND_DATA.description,
    getPayload: () => ({
      title: DOWNLOAD_COMMAND_DATA.title,
      description: DOWNLOAD_COMMAND_DATA.body,
      fields: DOWNLOAD_COMMAND_DATA.fields,
    }),
  },
  {
    name: RULES_COMMAND_META.name,
    aliases: RULES_COMMAND_META.aliases,
    description: RULES_COMMAND_META.description,
    getPayload: () => ({
      title: RULES_COMMAND_META.title,
      description: getRulesCommandBody(config.rulesChannelId),
    }),
  },
  {
    name: TICKET_COMMAND_META.name,
    aliases: TICKET_COMMAND_META.aliases,
    description: TICKET_COMMAND_META.description,
    getPayload: () => ({
      title: TICKET_COMMAND_META.title,
      description: getTicketCommandBody(config.ticketChannelId),
    }),
  },
  {
    name: PING_COMMAND_META.name,
    aliases: PING_COMMAND_META.aliases,
    description: PING_COMMAND_META.description,
    getPayload: (ctx) => {
      const { emoji, text } = calculatePingDetails(ctx.wsPing ?? -1);
      return {
        title: `${emoji} Latency`,
        description: `WebSocket Ping: \`${text}\``,
      };
    },
  },
  {
    name: 'faq',
    aliases: ['questions', 'qna', 'ask'],
    description: 'Frequently asked questions. Use <prefix>faq <category> or <prefix>faq for a list.',
    getPayload: (ctx) => buildFaqPayload(ctx.args?.[0]),
  },
  {
    name: UPTIME_COMMAND_META.name,
    aliases: UPTIME_COMMAND_META.aliases,
    description: UPTIME_COMMAND_META.description,
    getPayload: (ctx) => {
      const uptimeMs = Math.floor(process.uptime() * 1000);
      const startTimestampSec = Math.floor((Date.now() - uptimeMs) / 1000);
      const uptimeStr = formatDuration(uptimeMs);
      const mem = process.memoryUsage();
      const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const rssMB = (mem.rss / 1024 / 1024).toFixed(1);

      const isFluxer = ctx.platform === 'fluxer';
      const bootTimeText = isFluxer
        ? `${uptimeStr} ago`
        : `<t:${startTimestampSec}:F> (<t:${startTimestampSec}:R>)`;

      return {
        title: '⏱️ AnimeX Bot • Uptime & Status',
        description: 'The bot process is active and fully operational.',
        fields: [
          { name: '⏳ Uptime', value: `**${uptimeStr}**`, inline: true },
          { name: '🚀 Online Since', value: bootTimeText, inline: true },
          { name: '💾 Memory', value: `\`${heapMB} MB / ${rssMB} MB\``, inline: true },
          { name: '🟢 Status', value: '`Healthy`', inline: true },
          { name: '⚙️ Runtime', value: `\`Node ${process.version}\``, inline: true },
        ],
      };
    },
  },
];
