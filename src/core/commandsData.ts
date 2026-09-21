import { BRAND, SISTER_SITES } from '../constants.js';

export interface EmbedFieldData {
  readonly name: string;
  readonly value: string;
  readonly inline?: boolean;
}

export interface StaticCommandContent {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly title: string;
  readonly body: string;
  readonly fields?: readonly EmbedFieldData[];
  readonly url?: string;
}

export const WEBSITE_COMMAND_DATA: StaticCommandContent = {
  name: 'website',
  aliases: ['site', 'url', 'link', 'domain', 'web', 'address'],
  description: 'Shows the official AnimeX website link and direct portals.',
  title: 'AnimeX • Official Website',
  body: 'Stream your favorite anime in high definition on **AnimeX**.',
  fields: [
    { name: '🌐 Main Portal', value: `[animex.one](${BRAND.website})`, inline: true },
    { name: '📥 Downloads', value: `[animex.one/downloads](${BRAND.downloads})`, inline: true },
    { name: '📅 Release Schedule', value: `[animex.one/schedule](${BRAND.schedule})`, inline: true },
    { name: '🌸 Sister Sites', value: `• [KissAsian (Dramas)](${SISTER_SITES.kissasian.url})\n• [9Anime (Legacy UI)](${SISTER_SITES.nineAnime.url})`, inline: false },
  ],
  url: BRAND.website,
};

export const DRAMA_COMMAND_DATA: StaticCommandContent = {
  name: 'drama',
  aliases: ['kissasian', 'asiandrama', 'asian', 'kdrama', 'dramas'],
  description: 'Shows the KissAsian sister site for Asian dramas & movies.',
  title: '🌸 KissAsian • Asian Dramas & Movies',
  body: [
    'Our sister site for Asian drama bingers! Watch Korean, Chinese, Thai, and Japanese dramas, K-shows, and movies in HD with English subtitles.',
    '',
    '• 📅 **Daily Releases**: New episodes and movies added daily.',
    '• 📖 **Coming Soon**: Dedicated Asian novels portal releasing soon!',
  ].join('\n'),
  fields: [
    { name: '🌐 KissAsian Portal', value: `[kissasian.su](${SISTER_SITES.kissasian.url})`, inline: true },
    { name: '🏠 Home Page', value: `[kissasian.su/home](${SISTER_SITES.kissasian.home})`, inline: true },
  ],
  url: SISTER_SITES.kissasian.url,
};

export const NINE_ANIME_COMMAND_DATA: StaticCommandContent = {
  name: '9anime',
  aliases: ['nineanime', '9a'],
  description: 'Shows the 9Anime sister site with legacy UI and AnimeX servers.',
  title: '⚔️ 9Anime • Legacy Streaming Portal',
  body: [
    'Watch anime online with English SUB and DUB in HD, multi-quality fast streaming, the classic 9Anime layout, powered by **AnimeX** servers.',
    '',
    '• 🎬 **Beta Player**: New video player introduced for the upcoming revamp.',
    '• ⚠️ **Notice**: Account logins are currently disabled.',
  ].join('\n'),
  fields: [
    { name: '🌐 9Anime Portal', value: `[9animetv.su](${SISTER_SITES.nineAnime.url})`, inline: true },
    { name: '⚡ Main Server', value: `[animex.one](${BRAND.website})`, inline: true },
  ],
  url: SISTER_SITES.nineAnime.url,
};

export const BOOST_COMMAND_DATA: StaticCommandContent = {
  name: 'boost',
  aliases: ['perks', 'serverboost', 'boosts', 'nitro'],
  description: 'Explains the perks of boosting the AnimeX server.',
  title: '✨ Server Boost Perks',
  body: [
    '• 💎 **Role & Badge**: Unlock `@Server Booster` role and badge.',
    '• 🖼️ **Media Permissions**: Post images and GIFs in chat.',
    '• 🎨 **Custom Profile Flair**: Priority custom avatar/banner requests.',
    '• 🚀 **Early Access**: Early access to website revamps and new features.',
  ].join('\n'),
};

export const ANIME_COMMAND_DATA: StaticCommandContent = {
  name: 'anime',
  aliases: ['info', 'about', 'bot', 'status', 'animex'],
  description: 'Displays official information and quick links for AnimeX and sister sites.',
  title: 'About AnimeX',
  body: 'Your ultimate destination for high-definition anime streaming, powered by high-speed video servers.',
  fields: [
    { name: '🌐 Main Portal', value: `[animex.one](${BRAND.website})`, inline: true },
    { name: '📥 Downloads', value: `[animex.one/downloads](${BRAND.downloads})`, inline: true },
    { name: '📅 Schedule', value: `[animex.one/schedule](${BRAND.schedule})`, inline: true },
    { name: '🌸 Sister Sites', value: `• **[KissAsian](${SISTER_SITES.kissasian.url})** (Asian Dramas)\n• **[9Anime](${SISTER_SITES.nineAnime.url})** (Legacy Portal)`, inline: false },
  ],
};

export const DOWNLOAD_COMMAND_DATA: StaticCommandContent = {
  name: 'download',
  aliases: ['downloads', 'dl', 'save'],
  description: 'Explains how to download anime episodes for offline viewing.',
  title: '📥 How to Download Episodes',
  body: [
    '1. Click the **Download** (📥) icon below the video player.',
    '2. Select **SUB** or **DUB**.',
    '3. Complete verification on the download page and click **Download**.',
    '4. For batch drives, click **Join Group** on Google Groups once.',
    '5. Play downloaded files with **VLC** or **QuickTime**.',
  ].join('\n'),
};

export const RULES_COMMAND_META = {
  name: 'rules',
  aliases: ['rule', 'guidelines'],
  description: 'Directs users to the official server rules channel.',
  title: '📜 Server Rules',
} as const;

export function getRulesCommandBody(channelId: string): string {
  return `Please check out our official rules and guidelines in <#${channelId}>.`;
}

export const TICKET_COMMAND_META = {
  name: 'ticket',
  aliases: ['support', 'tickets', 'contact', 'helpdesk', 'issue'],
  description: 'Explains how to get website support or create a ticket.',
  title: '🎫 Website Support',
} as const;

export function getTicketCommandBody(channelId: string): string {
  return `Encountering an issue? Create a support ticket in <#${channelId}>.`;
}

export const PING_COMMAND_META = {
  name: 'ping',
  aliases: ['latency', 'ms', 'pong'],
  description: 'Checks bot WebSocket latency.',
} as const;

export function calculatePingDetails(wsPing: number): { emoji: string; text: string } {
  const pingText = wsPing >= 0 ? `${wsPing}ms` : 'Connected';
  const statusEmoji = wsPing < 0 ? '🟢' : wsPing < 150 ? '🟢' : wsPing < 300 ? '🟡' : '🔴';
  return { emoji: statusEmoji, text: pingText };
}

export const AFK_COMMAND_META = {
  name: 'afk',
  aliases: ['brb', 'away'],
  description: 'Sets your status as AFK with a reason. Notifies users when mentioned.',
} as const;

