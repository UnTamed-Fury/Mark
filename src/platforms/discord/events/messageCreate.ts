import type { Message } from 'discord.js';
import { config } from '../../../config.js';
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
  const mentionPrefix = botId ? `<@${botId}>` : null;
  const nickMentionPrefix = botId ? `<@!${botId}>` : null;

  // Check if content is empty (indicates missing Message Content Intent in Discord Developer Portal)
  if (content.length === 0) {
    if (botId && message.mentions.users.has(botId)) {
      log.warn(`Received empty mention message from ${message.author.tag}. Ensure "Message Content Intent" is enabled in Discord Developer Portal.`);
      const embed = createBrandEmbed(message)
        .setTitle('AnimeX Bot')
        .setDescription(`Hello <@${message.author.id}>! Use \`${config.prefix}help\` to see available commands.`);
      await sendEmbed(message, embed).catch(() => {});
    }
    return;
  }

  let commandBody: string | null = null;

  if (content.startsWith(config.prefix)) {
    commandBody = content.slice(config.prefix.length).trim();
  } else if (mentionPrefix && content.startsWith(mentionPrefix)) {
    commandBody = content.slice(mentionPrefix.length).trim();
  } else if (nickMentionPrefix && content.startsWith(nickMentionPrefix)) {
    commandBody = content.slice(nickMentionPrefix.length).trim();
  }

  // Handle prefix & mention commands
  if (commandBody !== null) {
    if (commandBody.length === 0) {
      const embed = createBrandEmbed(message)
        .setTitle('AnimeX Bot')
        .setDescription(`Hello <@${message.author.id}>! Type \`${config.prefix}help\` to view all commands.`);
      await sendEmbed(message, embed).catch(() => {});
      return;
    }

    const rawArgs = commandBody.split(/\s+/);
    const commandName = rawArgs[0]?.toLowerCase();
    const args = rawArgs.slice(1);

    if (!commandName) return;

    const command = getDiscordCommand(commandName);
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
      await command.execute(message, args);
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
