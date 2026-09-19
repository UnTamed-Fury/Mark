export const BRAND = {
  name: 'AnimeX',
  tagline: 'Official Bot',
  website: 'https://animex.one',
  home: 'https://animex.one/home',
  downloads: 'https://animex.one/downloads',
  schedule: 'https://animex.one/schedule',
  footer: 'AnimeX • Official Bot',
  color: 0x000001,
} as const;

export const SISTER_SITES = {
  kissasian: {
    name: 'KissAsian',
    url: 'https://kissasian.su',
    home: 'https://kissasian.su/home',
    tagline: 'Asian Dramas, Movies & K-Shows',
  },
  nineAnime: {
    name: '9Anime',
    url: 'https://9animetv.su',
    tagline: 'Legacy 9Anime UI with AnimeX High-Speed Servers',
  },
} as const;

export const SERVER = {
  name: 'AnimeX',
  discordGuildId: '1320161905267970079',
  fluxerGuildId: '1475654458820477346',
  rulesChannelId: '1320161905402318853',
  ticketChannelId: '1320161905695789095',
  ownerId: '1344082654852550788',
  developerId: '1130510553266278501',
} as const;

export const FAQ_CATEGORIES = [
  'ads',
  'episodes',
  'player',
  'images',
  'sync',
  'support',
  'schedule',
  'mobile',
  'download',
  'password',
  'profile',
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];
