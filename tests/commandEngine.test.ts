import { describe, it, expect } from 'vitest';
import {
  STANDARD_COMMANDS,
  buildFaqPayload,
  buildHelpPayload,
} from '../src/core/commandEngine.js';
import {
  parseMessageCommand,
  isAfkCommandName,
} from '../src/core/messagePipeline.js';
import { FAQ_CATEGORIES } from '../src/constants.js';

describe('Universal Command Engine', () => {
  it('registers all 10 standard commands', () => {
    const names = STANDARD_COMMANDS.map((c) => c.name);
    expect(names).toContain('website');
    expect(names).toContain('drama');
    expect(names).toContain('9anime');
    expect(names).toContain('boost');
    expect(names).toContain('anime');
    expect(names).toContain('download');
    expect(names).toContain('rules');
    expect(names).toContain('ticket');
    expect(names).toContain('ping');
    expect(names).toContain('faq');
  });

  it('builds FAQ index and category responses', () => {
    const indexPayload = buildFaqPayload();
    expect(indexPayload.title).toContain('FAQ Index');

    for (const cat of FAQ_CATEGORIES) {
      const payload = buildFaqPayload(cat);
      expect(payload.title).toContain('FAQ •');
      expect(payload.description).toBeDefined();
    }

    const unknownPayload = buildFaqPayload('nonexistent');
    expect(unknownPayload.title).toBe('Unknown FAQ Category');
  });

  it('builds Help index and detail responses', () => {
    const helpIndex = buildHelpPayload(STANDARD_COMMANDS);
    expect(helpIndex.title).toContain('Commands');
    expect(helpIndex.description).toContain('website');

    const helpDetail = buildHelpPayload(STANDARD_COMMANDS, 'website');
    expect(helpDetail.title).toContain('Help •');
    expect(helpDetail.description).toContain('official AnimeX website');

    const helpUnknown = buildHelpPayload(STANDARD_COMMANDS, 'unknown_cmd');
    expect(helpUnknown.title).toBe('Unknown Command');
  });
});

describe('Shared Message Pipeline Helpers', () => {
  it('correctly parses prefix and mention commands', () => {
    const prefixCmd = parseMessageCommand('+ping -v', '+');
    expect(prefixCmd).not.toBeNull();
    expect(prefixCmd?.commandName).toBe('ping');
    expect(prefixCmd?.args).toEqual(['-v']);

    const mentionCmd = parseMessageCommand('<@12345> help website', '+', ['<@12345>']);
    expect(mentionCmd).not.toBeNull();
    expect(mentionCmd?.commandName).toBe('help');
    expect(mentionCmd?.args).toEqual(['website']);

    const nonCmd = parseMessageCommand('hello world', '+');
    expect(nonCmd).toBeNull();
  });

  it('correctly detects AFK command names', () => {
    expect(isAfkCommandName('afk')).toBe(true);
    expect(isAfkCommandName('brb')).toBe(true);
    expect(isAfkCommandName('away')).toBe(true);
    expect(isAfkCommandName('ping')).toBe(false);
  });
});
