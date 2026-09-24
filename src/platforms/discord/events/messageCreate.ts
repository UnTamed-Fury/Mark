import type { Message } from 'discord.js';
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
import { getDiscordCommand } from '../commands.js';
import { createBrandEmbed, sendEmbed } from '../embeds.js';

const log = createLogger('DiscordMessage');

export async function handleDiscordMessageCreate(message: Message): Promise<void> {
  // Ignore bots and webhooks
  if (message.author.bot || message.webhookId) {
    return;
  }

  const content = message.content ?? '';
  const botId = message.client.user?.id;
  const botMentions = botId ? [`<@${botId}>`, `<@!${botId}>`] : [];
  const parsed = parseMessageCommand(content, config.prefix, botMentions);

  // 1. If author was AFK, remove their AFK status (unless they are executing +afk)
  const afkReturn = handleAfkMessageReturn(
    message.author.id,
    'discord',
    message.guildId,
    parsed ? isAfkCommandName(parsed.commandName) : false
  );
  if (afkReturn.cleared && afkReturn.entry) {
    const embed = createBrandEmbed(message)
      .setTitle('Welcome Back!')
      .setDescription(
        `Welcome back <@${message.author.id}>, I removed your AFK status.\n\n` +
        `• **AFK Duration**: ${afkReturn.durationText}\n` +
        `• **Reason**: ${afkReturn.entry.reason}`
      );
    await sendEmbed(message, embed).catch(() => {});
  }

  // 2. Notify if any mentioned or replied-to users are AFK
  const targetsToCheck = new Set<string>();
  for (const [userId, user] of message.mentions.users) {
    if (userId !== message.author.id && !user.bot) {
      targetsToCheck.add(userId);
    }
  }
  if (message.reference?.messageId && message.mentions.repliedUser) {
    const replied = message.mentions.repliedUser;
    if (replied.id !== message.author.id && !replied.bot) {
      targetsToCheck.add(replied.id);
    }
  }

  for (const targetId of targetsToCheck) {
    const afkEntry = getAfk(targetId, 'discord', message.guildId);
    if (afkEntry && canNotifyAfk(targetId, message.channelId)) {
      recordAfkNotification(targetId, message.channelId);
      const relativeTime = getRelativeTimestamp(afkEntry.timestamp);
      const targetUser = message.mentions.users.get(targetId);
      const displayName = targetUser?.displayName || targetUser?.username || 'User';

      const embed = createBrandEmbed(message)
        .setTitle(`${displayName} is AFK`)
        .setDescription(`<@${targetId}> is currently AFK: **${afkEntry.reason}** (${relativeTime})`);
      await sendEmbed(message, embed).catch(() => {});
    }
  }


  // Handle prefix & mention commands
  if (parsed !== null) {
    if (parsed.commandBody.length === 0) {
      const embed = createBrandEmbed(message)
        .setTitle('AnimeX Bot')
        .setDescription(`Hello <@${message.author.id}>! Type \`${config.prefix}help\` to view all commands.`);
      await sendEmbed(message, embed).catch(() => {});
      return;
    }

    if (!parsed.commandName) return;

    const command = getDiscordCommand(parsed.commandName);
    if (!command) return;

    // Cooldown check
    const cooldown = checkCooldown(message.author.id, message.channelId);
    if (cooldown.onCooldown) {
      const waitSeconds = Math.ceil((cooldown.cooldownUntilMs - Date.now()) / 1000);
      log.info(`Rate limited user ${message.author.tag} (${message.author.id}) — wait ${waitSeconds}s`);
      return;
    }

    recordCommandExecution(message.author.id, message.channelId);

    try {
      log.info(`Executing command "${command.name}" for ${message.author.tag} (${message.author.id})`);
      await command.execute(message, parsed.args);
    } catch (error) {
      log.error(`Error executing command "${command.name}":`, error);
      const embed = createBrandEmbed(message)
        .setTitle('Execution Error')
        .setDescription('An unexpected error occurred while executing this command.');
      await sendEmbed(message, embed).catch(() => {});
    }
    return;
  }

  // Handle auto-responder for natural language website questions
  if (isWebsiteQuery(content)) {
    const cooldown = checkCooldown(message.author.id, message.channelId);
    if (cooldown.onCooldown) {
      return;
    }

    recordCommandExecution(message.author.id, message.channelId);

    log.info(`Auto-responder triggered by ${message.author.tag} (${message.author.id}): "${content}"`);
    const websiteCommand = getDiscordCommand('website');
    if (websiteCommand) {
      try {
        await websiteCommand.execute(message, []);
      } catch (error) {
        log.error('Failed to dispatch auto-responder website embed:', error);
      }
    }
  }
}
