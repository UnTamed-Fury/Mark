import type { Message } from '@fluxerjs/core';
import { config } from '../../../config.js';
import {
  getAfk,
  canNotifyAfk,
  recordAfkNotification,
  getRelativeTimestamp,
} from '../../../core/afkManager.js';
import {
  parseMessageCommand,
  handleAfkMessageReturn,
  isAfkCommandName,
} from '../../../core/messagePipeline.js';
import { isWebsiteQuery } from '../../../core/autoResponder.js';
import { checkCooldown, recordCommandExecution } from '../../../core/cooldown.js';
import { createLogger } from '../../../core/logger.js';
import { getFluxerCommand } from '../commands.js';
import { createFluxerBrandEmbed, sendFluxerEmbed } from '../embeds.js';

const log = createLogger('FluxerMessage');

export async function handleFluxerMessageCreate(message: Message): Promise<void> {
  // Ignore bots and webhooks
  if (message.author.bot || message.webhookId) {
    return;
  }

  const content = message.content ?? '';
  const parsed = parseMessageCommand(content, config.prefix);

  // 1. If author was AFK, remove their AFK status (unless they are executing +afk)
  const afkReturn = handleAfkMessageReturn(
    message.author.id,
    'fluxer',
    message.guildId,
    parsed ? isAfkCommandName(parsed.commandName) : false
  );
  if (afkReturn.cleared && afkReturn.entry) {
    const embed = createFluxerBrandEmbed(message)
      .setTitle('Welcome Back!')
      .setDescription(
        `Welcome back <@${message.author.id}>, I removed your AFK status.\n\n` +
        `• **AFK Duration**: ${afkReturn.durationText}\n` +
        `• **Reason**: ${afkReturn.entry.reason}`
      );
    await sendFluxerEmbed(message, embed).catch(() => {});
  }

  // 2. Notify if any mentioned users are AFK
  const targetsToCheck = new Set<string>();
  const mentionRegex = /<@!?(\d+)>/g;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    const mentionedId = match[1];
    if (mentionedId && mentionedId !== message.author.id) {
      targetsToCheck.add(mentionedId);
    }
  }

  for (const targetId of targetsToCheck) {
    const afkEntry = getAfk(targetId, 'fluxer', message.guildId);
    if (afkEntry && canNotifyAfk(targetId, message.channelId)) {
      recordAfkNotification(targetId, message.channelId);
      const relativeTime = getRelativeTimestamp(afkEntry.timestamp, 'fluxer');
      const embed = createFluxerBrandEmbed(message)
        .setTitle(`User is AFK`)
        .setDescription(`<@${targetId}> is currently AFK: **${afkEntry.reason}** (${relativeTime})`);
      await sendFluxerEmbed(message, embed).catch(() => {});
    }
  }

  // Handle prefix commands
  if (parsed !== null) {
    if (!parsed.commandName) return;

    const command = getFluxerCommand(parsed.commandName);
    if (!command) return;

    // Cooldown check
    const cooldown = checkCooldown(message.author.id, message.channelId);
    if (cooldown.onCooldown) {
      const waitSeconds = Math.ceil((cooldown.cooldownUntilMs - Date.now()) / 1000);
      log.info(`Rate limited user ${message.author.username} (${message.author.id}) — wait ${waitSeconds}s`);
      return;
    }

    recordCommandExecution(message.author.id, message.channelId);

    try {
      log.info(`Executing command "${command.name}" for ${message.author.username} (${message.author.id})`);
      await command.execute(message, parsed.args);
    } catch (error) {
      log.error(`Error executing command "${command.name}":`, error);
      const embed = createFluxerBrandEmbed(message)
        .setTitle('Execution Error')
        .setDescription('An unexpected error occurred while executing this command.');
      await sendFluxerEmbed(message, embed).catch(() => {});
    }
    return;
  }

  // Handle auto-responder for natural language website questions
  if (isWebsiteQuery(message.content)) {
    const cooldown = checkCooldown(message.author.id, message.channelId);
    if (cooldown.onCooldown) {
      return;
    }

    recordCommandExecution(message.author.id, message.channelId);

    log.info(`Auto-responder triggered by ${message.author.username} (${message.author.id}): "${message.content}"`);
    const websiteCommand = getFluxerCommand('website');
    if (websiteCommand) {
      try {
        await websiteCommand.execute(message, []);
      } catch (error) {
        log.error('Failed to dispatch auto-responder website embed:', error);
      }
    }
  }
}
