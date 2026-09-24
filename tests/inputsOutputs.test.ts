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
import { isWebsiteQuery } from '../src/core/autoResponder.js';
import { FAQ_CATEGORIES } from '../src/constants.js';

describe('Input Parsing & Edge Cases', () => {
  describe('Prefix-based Command Parsing', () => {
    it('handles exact prefix with command and arguments', () => {
      const parsed = parseMessageCommand('+website all', '+');
      expect(parsed).not.toBeNull();
      expect(parsed?.commandName).toBe('website');
      expect(parsed?.args).toEqual(['all']);
    });

    it('handles uppercase and mixed-case command names', () => {
      const parsed = parseMessageCommand('+WeBsiTe info', '+');
      expect(parsed).not.toBeNull();
      expect(parsed?.commandName).toBe('website');
      expect(parsed?.args).toEqual(['info']);
    });

    it('handles prefix with only trailing whitespace', () => {
      const parsed = parseMessageCommand('+    ', '+');
      expect(parsed).not.toBeNull();
      expect(parsed?.commandBody).toBe('');
      expect(parsed?.commandName).toBe('');
      expect(parsed?.args).toEqual([]);
    });

    it('handles multiple consecutive spaces between arguments', () => {
      const parsed = parseMessageCommand('+afk    sleeping   until   tomorrow', '+');
      expect(parsed).not.toBeNull();
      expect(parsed?.commandName).toBe('afk');
      expect(parsed?.args).toEqual(['sleeping', 'until', 'tomorrow']);
    });

    it('handles tabs and newlines within message input', () => {
      const parsed = parseMessageCommand('+afk\tgoing\nout\nfor dinner', '+');
      expect(parsed).not.toBeNull();
      expect(parsed?.commandName).toBe('afk');
      expect(parsed?.args).toEqual(['going', 'out', 'for', 'dinner']);
    });

    it('handles special regex characters in the command prefix', () => {
      for (const p of ['!', '?', '.', '$', '*', '^', '[', '+']) {
        const parsed = parseMessageCommand(`${p}ping now`, p);
        expect(parsed).not.toBeNull();
        expect(parsed?.commandName).toBe('ping');
        expect(parsed?.args).toEqual(['now']);
      }
    });

    it('handles multi-character prefixes', () => {
      const parsed = parseMessageCommand('!mark-bot help rules', '!mark-bot');
      expect(parsed).not.toBeNull();
      expect(parsed?.commandName).toBe('help');
      expect(parsed?.args).toEqual(['rules']);
    });

    it('handles extremely long inputs safely without crash or performance freeze', () => {
      const hugeArg = 'a'.repeat(5000);
      const parsed = parseMessageCommand(`+afk ${hugeArg}`, '+');
      expect(parsed).not.toBeNull();
      expect(parsed?.commandName).toBe('afk');
      expect(parsed?.args).toEqual([hugeArg]);
    });

    it('returns null for non-command messages', () => {
      expect(parseMessageCommand('just chatting about anime', '+')).toBeNull();
      expect(parseMessageCommand('plus + help', '+')).toBeNull();
      expect(parseMessageCommand('', '+')).toBeNull();
      expect(parseMessageCommand('   ', '+')).toBeNull();
    });
  });

  describe('Mention-based Command Parsing', () => {
    const botMentions = ['<@123456789>', '<@!123456789>'];

    it('handles standard user mention followed by command', () => {
      const parsed = parseMessageCommand('<@123456789> help website', '+', botMentions);
      expect(parsed).not.toBeNull();
      expect(parsed?.commandName).toBe('help');
      expect(parsed?.args).toEqual(['website']);
    });

    it('handles nickname mention (<@!id>) followed by command', () => {
      const parsed = parseMessageCommand('<@!123456789> rules', '+', botMentions);
      expect(parsed).not.toBeNull();
      expect(parsed?.commandName).toBe('rules');
      expect(parsed?.args).toEqual([]);
    });

    it('handles mention with no space preceding command name', () => {
      const parsed = parseMessageCommand('<@123456789>ping', '+', botMentions);
      expect(parsed).not.toBeNull();
      expect(parsed?.commandName).toBe('ping');
      expect(parsed?.args).toEqual([]);
    });

    it('handles mention alone without any command', () => {
      const parsed = parseMessageCommand('<@123456789>', '+', botMentions);
      expect(parsed).not.toBeNull();
      expect(parsed?.commandBody).toBe('');
      expect(parsed?.commandName).toBe('');
    });

    it('ignores mentions of other users', () => {
      const parsed = parseMessageCommand('<@999999999> help', '+', botMentions);
      expect(parsed).toBeNull();
    });

    it('ignores bot mentions not placed at the very start', () => {
      const parsed = parseMessageCommand('hello <@123456789> help', '+', botMentions);
      expect(parsed).toBeNull();
    });
  });

  describe('AFK Command Name Matcher', () => {
    it('recognizes standard afk aliases', () => {
      expect(isAfkCommandName('afk')).toBe(true);
      expect(isAfkCommandName('brb')).toBe(true);
      expect(isAfkCommandName('away')).toBe(true);
      expect(isAfkCommandName('AFK')).toBe(true);
      expect(isAfkCommandName('BrB')).toBe(true);
    });

    it('returns false for unrelated command names', () => {
      expect(isAfkCommandName('ping')).toBe(false);
      expect(isAfkCommandName('help')).toBe(false);
      expect(isAfkCommandName('sync')).toBe(false);
      expect(isAfkCommandName('website')).toBe(false);
    });
  });
});

describe('Output Payload Structure & Limits', () => {
  it('ensures all 10 standard commands output valid Discord & Fluxer compliant payloads', () => {
    for (const cmd of STANDARD_COMMANDS) {
      const payload = cmd.getPayload({ wsPing: 25, args: [] });

      // Title constraints
      expect(payload.title).toBeTruthy();
      expect(typeof payload.title).toBe('string');
      expect(payload.title.length).toBeLessThanOrEqual(256);

      // Description constraints
      expect(payload.description).toBeTruthy();
      expect(typeof payload.description).toBe('string');
      expect(payload.description.length).toBeLessThanOrEqual(4096);

      // Fields constraints
      if (payload.fields) {
        expect(payload.fields.length).toBeLessThanOrEqual(25);
        for (const field of payload.fields) {
          expect(field.name).toBeTruthy();
          expect(field.name.length).toBeLessThanOrEqual(256);
          expect(field.value).toBeTruthy();
          expect(field.value.length).toBeLessThanOrEqual(1024);
        }
      }

      // Total character count limit (Discord max 6000)
      const fieldChars = (payload.fields ?? []).reduce(
        (sum, f) => sum + f.name.length + f.value.length,
        0
      );
      const totalChars = payload.title.length + payload.description.length + fieldChars;
      expect(totalChars).toBeLessThanOrEqual(6000);
    }
  });

  describe('Ping Command Variations', () => {
    const pingCmd = STANDARD_COMMANDS.find((c) => c.name === 'ping')!;

    it('renders connected websocket latency correctly', () => {
      const payload = pingCmd.getPayload({ wsPing: 34, args: [] });
      expect(payload.title).toContain('Latency');
      expect(payload.description).toContain('34ms');
    });

    it('handles negative wsPing during reconnection/mock gracefully', () => {
      const payload = pingCmd.getPayload({ wsPing: -1, args: [] });
      expect(payload.title).toContain('Latency');
      expect(payload.description).toContain('Connected');
    });

    it('handles 0ms wsPing without reporting N/A', () => {
      const payload = pingCmd.getPayload({ wsPing: 0, args: [] });
      expect(payload.title).toContain('Latency');
      expect(payload.description).toContain('0ms');
    });
  });

  describe('FAQ Output Structure', () => {
    it('returns structured index with all categories when no category specified', () => {
      const payload = buildFaqPayload();
      expect(payload.title).toContain('FAQ Index');
      expect(payload.description).toBeDefined();
      for (const cat of FAQ_CATEGORIES) {
        expect(payload.description).toContain(cat);
      }
    });

    it('returns individual category payloads accurately', () => {
      for (const cat of FAQ_CATEGORIES) {
        const payload = buildFaqPayload(cat);
        expect(payload.title).toContain('FAQ •');
        expect(payload.description).toBeDefined();
        expect(payload.description.length).toBeGreaterThan(0);
      }
    });

    it('handles case insensitivity in category query', () => {
      const payloadLower = buildFaqPayload('drama');
      const payloadUpper = buildFaqPayload('DRAMA');
      expect(payloadLower.title).toBe(payloadUpper.title);
      expect(payloadLower.description).toBe(payloadUpper.description);
    });

    it('returns unknown category response with available suggestions for invalid category', () => {
      const payload = buildFaqPayload('invalid_category_123');
      expect(payload.title).toBe('Unknown FAQ Category');
      expect(payload.description).toContain('invalid_category_123');
      expect(payload.description).toContain('Type `+faq` to view all available categories.');
    });
  });

  describe('Help Output Structure', () => {
    it('returns full command directory when no specific command is requested', () => {
      const payload = buildHelpPayload(STANDARD_COMMANDS);
      expect(payload.title).toContain('Commands');
      expect(payload.description).toBeDefined();
      for (const cmd of STANDARD_COMMANDS) {
        expect(payload.description).toContain(cmd.name);
      }
    });

    it('returns detailed command info when specific command is requested', () => {
      const payload = buildHelpPayload(STANDARD_COMMANDS, 'website');
      expect(payload.title).toContain('Help • +website');
      expect(payload.fields?.some((f) => f.name === 'Aliases')).toBe(true);
    });

    it('resolves command by alias in help search', () => {
      const payload = buildHelpPayload(STANDARD_COMMANDS, 'site');
      expect(payload.title).toContain('Help • +website');
    });

    it('returns Unknown Command with suggestion when queried command does not exist', () => {
      const payload = buildHelpPayload(STANDARD_COMMANDS, 'fake_command');
      expect(payload.title).toBe('Unknown Command');
      expect(payload.description).toContain('fake_command');
    });
  });

  describe('AutoResponder Input Detection', () => {
    const validQueries = [
      'where is the website?',
      'what is the animex link',
      'site link please',
      'can anyone send website url',
      'official animex link',
      'domain for animex',
    ];

    it('detects diverse natural language website queries', () => {
      for (const q of validQueries) {
        expect(isWebsiteQuery(q)).toBe(true);
      }
    });

    it('avoids false positives on incidental mentions', () => {
      const nonQueries = [
        'i am building my own website with python',
        'hello everyone what is up',
        'animex is an awesome community',
      ];
      for (const text of nonQueries) {
        expect(isWebsiteQuery(text)).toBe(false);
      }
    });
  });
});
