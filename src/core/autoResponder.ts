const EXCLUDE_PATTERNS: readonly RegExp[] = [
  /\b(discord|rules|rule|video|episode|image|gif|pic|photo|twitter|x|youtube|yt|tiktok|instagram|ig|reddit|github|trailer)\s+link\b/i,
  /\blink\s+(to|of|for)\s+(discord|rules|rule|video|episode|image|gif|pic|photo|twitter|youtube|tiktok|instagram|reddit|trailer)\b/i,
];

const TYPO_MAP: Readonly<Record<string, string>> = {
  webste: 'website',
  webiste: 'website',
  websit: 'website',
  wwebsite: 'website',
  webst: 'website',
  websiet: 'website',
  lnik: 'link',
  likn: 'link',
  linck: 'link',
  limk: 'link',
  urll: 'url',
  uri: 'url',
  siet: 'site',
  sit: 'site',
  animx: 'animex',
  aimex: 'animex',
  whats: 'what',
  "what's": 'what',
  wats: 'what',
  whast: 'what',
  wht: 'what',
  forgott: 'forgot',
  forgote: 'forgot',
  forgottn: 'forgot',
  forgor: 'forgot',
  forgotten: 'forgot',
  wheres: 'where',
  "where's": 'where',
  plz: 'please',
  pls: 'please',
  plis: 'please',
};

const CANONICAL_TARGET_WORDS: ReadonlySet<string> = new Set([
  'website',
  'site',
  'url',
  'domain',
  'link',
  'web',
  'address',
  'animex',
]);

const CANONICAL_ACTION_WORDS: ReadonlySet<string> = new Set([
  'what',
  'where',
  'forgot',
  'lost',
  'send',
  'give',
  'gimme',
  'need',
  'find',
  'get',
  'please',
  'animex',
  'site',
  'website',
]);

const QUERY_PATTERNS: readonly RegExp[] = [
  /\b(what|where)\b\s+(is|are)?\s*(\b(the|a|our|official|main|actual|animex)\b\s*)*\s*(website|site|url|domain|link)\b/i,
  /\b(forgot|lost)\b\s+(the|my|our)?\s*(animex\s*)?(website|site|url|domain|link)\b/i,
  /\b(animex)\b.*\b(website|site|url|domain|link)\b/i,
  /\b(website|site|url|domain|link)\b.*\b(for|of)\s+animex\b/i,
  /\b(send|give|gimme|need|get|find|please)\b\s+(me|us)?\s*(the|a|our|official|main)?\s*(website|site|url|domain|link)\b/i,
  /\b(website|site|url|domain|link)\s+(please)\b/i,
  /\b(website|site)\s+(url|link|domain|address)\b/i,
  /\b(url|link|domain|address)\s+(to|for|of)\s*(\b(the|a|our|official|main|actual|animex)\b\s*)*(website|site)\b/i,
];

function sanitizeContent(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[`*_~]+/g, ' ')
    .replace(/[!?,;.]+/g, ' ')
    .trim();
}

export function isWebsiteQuery(content: string): boolean {
  const sanitized = sanitizeContent(content);

  // Stage 1: Length and word count limits
  if (!sanitized || sanitized.length > 200) return false;
  const rawWords = sanitized.toLowerCase().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0 || rawWords.length > 25) return false;

  // Stage 2: Anti-false positive exclusions
  if (EXCLUDE_PATTERNS.some((pattern) => pattern.test(sanitized))) {
    return false;
  }

  // Stage 2.5: Token normalization
  const normalizedTokens = rawWords.map((w) => TYPO_MAP[w] ?? w);
  const normalizedText = normalizedTokens.join(' ');

  // Stage 3: Target word presence
  const hasTargetWord = normalizedTokens.some((token) => CANONICAL_TARGET_WORDS.has(token));
  if (!hasTargetWord) return false;

  // Stage 4: Action word presence
  const hasActionWord = normalizedTokens.some((token) => CANONICAL_ACTION_WORDS.has(token));
  if (!hasActionWord) return false;

  // Stage 5: Structural pattern match
  return QUERY_PATTERNS.some((pattern) => pattern.test(normalizedText));
}
