import { config } from '../config.js';
import { clearAfk, formatDuration, type AfkUserEntry } from './afkManager.js';

export interface ParsedCommand {
  readonly isCommand: boolean;
  readonly commandBody: string;
  readonly commandName: string;
  readonly args: string[];
}

export function parseMessageCommand(
  content: string,
  prefix = config.prefix,
  botMentions: string[] = [],
): ParsedCommand | null {
  let commandBody: string | null = null;

  if (content.startsWith(prefix)) {
    commandBody = content.slice(prefix.length).trim();
  } else {
    for (const mention of botMentions) {
      if (content.startsWith(mention)) {
        commandBody = content.slice(mention.length).trim();
        break;
      }
    }
  }

  if (commandBody === null) {
    return null;
  }

  const rawArgs = commandBody.length > 0 ? commandBody.split(/\s+/) : [];
  const commandName = rawArgs[0]?.toLowerCase() ?? '';
  const args = rawArgs.slice(1);

  return {
    isCommand: true,
    commandBody,
    commandName,
    args,
  };
}

export function isAfkCommandName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'afk' || lower === 'brb' || lower === 'away';
}

export function handleAfkMessageReturn(
  userId: string,
  platform: 'discord' | 'fluxer',
  guildId?: string | null,
  isAfkCmd = false,
): { cleared: boolean; entry?: AfkUserEntry; durationText?: string } {
  if (isAfkCmd) {
    return { cleared: false };
  }

  const cleared = clearAfk(userId, platform, guildId);
  if (!cleared) {
    return { cleared: false };
  }

  const durationText = formatDuration(Date.now() - cleared.timestamp);
  return {
    cleared: true,
    entry: cleared,
    durationText,
  };
}
