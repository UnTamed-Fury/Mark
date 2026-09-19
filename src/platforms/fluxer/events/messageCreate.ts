import type { Message } from '@fluxerjs/core';
import { config } from '../../../config.js';
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

  // Handle prefix commands
  if (message.content.startsWith(config.prefix)) {
    const rawArgs = message.content.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = rawArgs[0]?.toLowerCase();
    const args = rawArgs.slice(1);

    if (!commandName) return;

    const command = getFluxerCommand(commandName);
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
      await command.execute(message, args);
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
