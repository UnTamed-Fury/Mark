export const ESSAY_CHAR_THRESHOLD = 100;
export const MAX_REASON_DISPLAY_LENGTH = 300;

export function truncateAfkReason(reason: string, maxLength = MAX_REASON_DISPLAY_LENGTH): string {
  const trimmed = reason.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

function pickRoast(roasts: string[], seed?: number): string {
  if (seed !== undefined) {
    const idx = Math.abs(seed) % roasts.length;
    return roasts[idx]!;
  }
  return roasts[Math.floor(Math.random() * roasts.length)]!;
}

const ESSAY_SET_ROASTS = [
  'Bro wrote a whole Wikipedia article for an AFK reason. Nobody is reading your thesis.',
  'Did you set an AFK reason or submit your final semester dissertation?',
  '100,000 light-years across the galaxy and not a single soul asked for this essay.',
  'Ain\'t nobody reading all that bro. See you in 5 minutes.',
  'Bro really thought he was writing the next volume of Encyclopedia Britannica in AFK.',
  'Bro turned his AFK status into a Terms of Service agreement.',
  'AFK reason longer than a CVS receipt. We get it, you know how to copy-paste.',
  'Bro wrote an entire light novel synopsis just to step away from the keyboard.',
  'I ain\'t reading all that. I\'m happy for you tho, or sorry that happened.',
  'Bro is paying for keyboard switches by the stroke.',
  'Did you hire a ghostwriter for this AFK status?',
  'Bro wrote a whole manifesto just to go grab a glass of water.',
  'Who gave Shakespeare a Discord account?',
  'Bro\'s AFK reason comes with citations in MLA format.',
  'Bro dropped an entire lore dump in the AFK command.',
];

const ESSAY_MENTION_ROASTS = [
  'Bro wrote a whole Wikipedia article for an AFK status. Nobody is reading that thesis.',
  '100,000 light-years across and not a single soul asked for this essay.',
  'Ain\'t nobody reading all that essay in an AFK ping.',
  'Bro\'s AFK reason has chapters, subheadings, and an index.',
  'Don\'t bother reading their AFK reason unless you brought popcorn.',
  'Their AFK status has more lore than the Dark Souls series.',
  'Warning: Reading their AFK reason will consume 15 minutes of your life.',
  'Bro really left an entire novel on read for you.',
];

const ESSAY_RETURN_ROASTS = [
  'All that essay just to come back already.',
  'You spent more time typing that thesis than actually being AFK.',
  'Did you finally finish proofreading your AFK dissertation?',
  'The novelist has returned from the publishing house.',
  'Welcome back Shakespeare, hope the book tour was fun.',
  'Bro typed a whole novel and survived to tell the tale.',
];

const DEGENERATE_SET_ROASTS = [
  'Bro announced that to the entire server with zero shame.',
  'TMI bro... some thoughts are meant to stay inside your head.',
  'Bro\'s digital footprint is completely cooked.',
  'There is still time to delete this and seek professional help.',
  'Bro really typed that out, looked at it, and clicked send.',
  'The FBI agent assigned to you just closed their laptop in disgust.',
  'Not even Batman could beat this confession out of me.',
  'May god have mercy on your search history.',
];

const DEGENERATE_MENTION_ROASTS = [
  'Bro really put that as their public AFK reason.',
  'Their digital footprint is never recovering from this.',
  'You probably don\'t want to know what they\'re actually doing right now.',
  'Please don\'t ask why they are AFK... for your own mental health.',
  'They\'re currently committing digital war crimes against their search history.',
];

const DEGENERATE_RETURN_ROASTS = [
  'Welcome back... please go wash your hands with bleach.',
  'Welcome back. Do NOT touch anything in this server.',
  'Bro survived the session. Now go touch some soap.',
  'Welcome back, your FBI agent is requesting an immediate transfer.',
  'Back already? We didn\'t need to know, and we still don\'t.',
];

const GRASS_SET_ROASTS = [
  'We all know you\'re not actually touching any grass.',
  'Looking at a JPEG of grass on Google Images does not count.',
  'Bro walked outside, got blinded by sunlight, and ran back in.',
  'Grass has officially rejected your friend request.',
  'Touching your desktop wallpaper doesn\'t count as touching grass.',
];

const GRASS_MENTION_ROASTS = [
  'They definitely aren\'t touching any grass right now.',
  'Bro is probably staring at green pixels on his monitor.',
  'Rumor has it they sneezed at the first blade of grass and ran away.',
];

const GRASS_RETURN_ROASTS = [
  'Did you survive the outside world or did the sun burn you?',
  'Welcome back from your 2-second grass inspection.',
  'We know you just opened the window and called it outdoor exploration.',
];

export function isEssay(reason: string): boolean {
  return reason.trim().length >= ESSAY_CHAR_THRESHOLD;
}

export function isDegenerate(reason: string): boolean {
  return /\b(goon|gooning|edging|edge)\b/i.test(reason);
}

export function isGrass(reason: string): boolean {
  return /\b(touching\s*grass|touch\s*grass|grass)\b/i.test(reason);
}

export function getAfkSetRoast(reason: string, seed?: number): string | null {
  if (isEssay(reason)) {
    return pickRoast(ESSAY_SET_ROASTS, seed);
  }
  if (isDegenerate(reason)) {
    return pickRoast(DEGENERATE_SET_ROASTS, seed);
  }
  if (isGrass(reason)) {
    return pickRoast(GRASS_SET_ROASTS, seed);
  }
  return null;
}

export function getAfkMentionRoast(reason: string, seed?: number): string | null {
  if (isEssay(reason)) {
    return pickRoast(ESSAY_MENTION_ROASTS, seed);
  }
  if (isDegenerate(reason)) {
    return pickRoast(DEGENERATE_MENTION_ROASTS, seed);
  }
  if (isGrass(reason)) {
    return pickRoast(GRASS_MENTION_ROASTS, seed);
  }
  return null;
}

export function getAfkReturnRoast(
  reason: string,
  _durationMs?: number,
  _durationText?: string,
  seed?: number,
): string | null {
  if (isEssay(reason)) {
    return pickRoast(ESSAY_RETURN_ROASTS, seed);
  }
  if (isDegenerate(reason)) {
    return pickRoast(DEGENERATE_RETURN_ROASTS, seed);
  }
  if (isGrass(reason)) {
    return pickRoast(GRASS_RETURN_ROASTS, seed);
  }
  return null;
}
