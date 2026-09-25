import { type Message } from '@fluxerjs/core';
import { config } from '../../config.js';
import { BRAND } from '../../constants.js';
import {
  AFK_COMMAND_META,
  SYNC_COMMAND_META,
  BACKUP_COMMAND_META,
} from '../../core/commandsData.js';
import {
  STANDARD_COMMANDS,
  buildHelpPayload,
  type StandardCommandDef,
} from '../../core/commandEngine.js';
import { setAfk, getRelativeTimestamp, type AfkScope } from '../../core/afkManager.js';
import { createSyncCode, claimSyncCode, getLinkedDiscordId, unlinkUser } from '../../core/syncManager.js';
import { performCloudBackup, restoreFromCloud } from '../../core/cloudBackup.js';
import { createLogger } from '../../core/logger.js';
import { createFluxerBrandEmbed, sendFluxerEmbed } from './embeds.js';
import { getDiscordClient } from '../discord/client.js';
import { EmbedBuilder as DiscordEmbedBuilder } from 'discord.js';

const log = createLogger('FluxerCommands');

export interface FluxerCommand {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  execute(message: Message, args: string[]): Promise<void>;
}

function adaptStandardFluxerCommand(cmd: StandardCommandDef): FluxerCommand {
  return {
    name: cmd.name,
    aliases: cmd.aliases,
    description: cmd.description,
    async execute(message: Message, args: string[]): Promise<void> {
      let wsPing = -1;
      try {
        wsPing = Math.round(message.client.ws.ping);
      } catch {
        // ws not yet connected or in mock test environment
      }

      const payload = cmd.getPayload({ wsPing, args, platform: 'fluxer' });
      const embed = createFluxerBrandEmbed(message)
        .setTitle(payload.title)
        .setDescription(payload.description);

      if (payload.fields && payload.fields.length > 0) {
        embed.addFields(...payload.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
      }

      if (payload.url) {
        embed.setURL(payload.url);
      }

      await sendFluxerEmbed(message, embed);
    },
  };
}

const standardFluxerCommands: FluxerCommand[] = STANDARD_COMMANDS
  .filter((cmd) => cmd.name !== BACKUP_COMMAND_META.name)
  .map(adaptStandardFluxerCommand);

const helpCommand: FluxerCommand = {
  name: 'help',
  aliases: ['h', 'commands', 'cmd', 'cmds'],
  description: 'Lists available commands or details for a specific command.',
  async execute(message: Message, args: string[]): Promise<void> {
    const payload = buildHelpPayload(COMMANDS, args[0]);
    const embed = createFluxerBrandEmbed(message)
      .setTitle(payload.title)
      .setDescription(payload.description);

    if (payload.fields && payload.fields.length > 0) {
      embed.addFields(...payload.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
    }

    await sendFluxerEmbed(message, embed);
  },
};

const afkCommand: FluxerCommand = {
  name: AFK_COMMAND_META.name,
  aliases: AFK_COMMAND_META.aliases,
  description: AFK_COMMAND_META.description,
  async execute(message: Message, args: string[]): Promise<void> {
    const reason = args.join(' ').trim() || 'AFK';
    const serverName = 'this server';

    const embed = createFluxerBrandEmbed(message)
      .setTitle('AFK Configuration')
      .setDescription(
        `React below to choose your AFK scope for reason: **${reason}**\n\n` +
        `🌐 **Global AFK**: Set AFK across all servers (Discord & Fluxer).\n` +
        `🏠 **Server Only**: Set AFK only in this server.\n` +
        `❌ **Cancel**: Cancel AFK setup.`
      );

    const promptMsg = await sendFluxerEmbed(message, embed);

    await promptMsg.react('🌐').catch(() => {});
    await promptMsg.react('🏠').catch(() => {});
    await promptMsg.react('❌').catch(() => {});

    try {
      const reactions = await promptMsg.awaitReactions({
        filter: (reaction, user) => {
          const name = reaction.emoji?.name || reaction.emojiIdentifier || '';
          return user.id === message.author.id && ['🌐', '🏠', '❌'].includes(name);
        },
        max: 1,
        time: 60_000,
      });

      const collected = reactions.first();
      const emojiName =
        collected?.reaction?.emoji?.name || collected?.reaction?.emojiIdentifier || '';

      if (!emojiName || emojiName === '❌') {
        const cancelEmbed = createFluxerBrandEmbed(message)
          .setTitle('AFK Cancelled')
          .setDescription('AFK setup was cancelled.');
        await promptMsg.edit({ embeds: [cancelEmbed] }).catch(() => {});
        return;
      }

      const scope: AfkScope = emojiName === '🌐' ? 'global' : 'server';
      const entry = setAfk(message.author.id, scope, 'fluxer', message.guildId, serverName, reason);
      const relativeTime = getRelativeTimestamp(entry.timestamp, 'fluxer');
      const scopeLabel = scope === 'global' ? 'globally' : `in **${serverName}**`;

      const successEmbed = createFluxerBrandEmbed(message)
        .setTitle(`${message.author.username} is now AFK`)
        .setDescription(
          `You are now set as AFK ${scopeLabel}.\n\n` +
          `• **Reason**: ${entry.reason}\n` +
          `• **Started**: ${relativeTime}`
        );

      await promptMsg.edit({ embeds: [successEmbed] }).catch(() => {});
    } catch (err) {
      log.debug('Fluxer AFK reaction collector ended:', err);
    }
  },
};

const syncCommand: FluxerCommand = {
  name: SYNC_COMMAND_META.name,
  aliases: SYNC_COMMAND_META.aliases,
  description: SYNC_COMMAND_META.description,
  async execute(message: Message, args: string[]): Promise<void> {
    // 1. Immediately delete the user's message so no code/arguments leak in chat
    if (typeof message.delete === 'function') {
      message.delete().catch(() => {});
    }

    const codeArg = args[0]?.trim();

    if (!codeArg) {
      const existing = getLinkedDiscordId(message.author.id);
      if (existing) {
        const embed = createFluxerBrandEmbed(message)
          .setTitle('Account Already Linked')
          .setDescription(
            `Your Fluxer account is currently linked to Discord ID: \`${existing}\`.\n\n` +
            `• To re-link, run \`${config.prefix}sync <code>\` with a code generated from Discord.\n` +
            `• To unlink, run \`${config.prefix}sync unlink\`.`
          );
        const rep = await sendFluxerEmbed(message, embed);
        setTimeout(() => {
          if (typeof rep.delete === 'function') rep.delete().catch(() => {});
        }, 15_000).unref?.();
        return;
      }

      const code = createSyncCode(message.author.id, 'fluxer');

      // Attempt sending the code via private DM on Fluxer
      let dmSent = false;
      try {
        const dmEmbed = createFluxerBrandEmbed(message)
          .setTitle('Private Account Sync Code')
          .setDescription(
            `Your one-time link code is:\n\n` +
            `# \`${code}\`\n\n` +
            `Go to **Discord** within **${config.syncCodeExpirySec || 30} seconds** and send:\n` +
            `\`${config.prefix}sync ${code}\`\n\n` +
            `*(Valid for ${config.syncCodeExpirySec || 30} seconds. Do not share this code with anyone).*`
          );
        await message.author.send({ embeds: [dmEmbed] });
        dmSent = true;
      } catch {
        dmSent = false;
      }

      if (dmSent) {
        const noticeEmbed = createFluxerBrandEmbed(message)
          .setTitle('Account Sync • One-Time Code')
          .setDescription(
            `**A secret link code was sent to your private DMs.**\n\n` +
            `Go to **Discord** within **${config.syncCodeExpirySec || 30} seconds** to complete linking.\n` +
            `*(This notice auto-deletes in 15s)*`
          );
        const noticeMsg = await sendFluxerEmbed(message, noticeEmbed);
        setTimeout(() => {
          if (typeof noticeMsg.delete === 'function') noticeMsg.delete().catch(() => {});
        }, 15_000).unref?.();
      } else {
        const tempEmbed = createFluxerBrandEmbed(message)
          .setTitle('Account Sync Code')
          .setDescription(
            `**Could not DM you (DMs may be closed).**\n\n` +
            `Your one-time link code is:\n\n` +
            `# \`${code}\`\n\n` +
            `Go to **Discord** within **${config.syncCodeExpirySec || 30} seconds** and send:\n` +
            `\`${config.prefix}sync ${code}\`\n\n` +
            `*(Auto-deleting in ${config.syncCodeExpirySec || 30} seconds for security).*`
          );
        const sentMsg = await sendFluxerEmbed(message, tempEmbed);
        setTimeout(() => {
          if (typeof sentMsg.delete === 'function') sentMsg.delete().catch(() => {});
        }, (config.syncCodeExpirySec || 30) * 1000).unref?.();
      }
      return;
    }

    if (codeArg.toLowerCase() === 'unlink') {
      const existing = getLinkedDiscordId(message.author.id);
      if (!existing) {
        const embed = createFluxerBrandEmbed(message)
          .setTitle('Not Linked')
          .setDescription('Your Fluxer account is not currently linked to any Discord account.');
        const rep = await sendFluxerEmbed(message, embed);
        setTimeout(() => {
          if (typeof rep.delete === 'function') rep.delete().catch(() => {});
        }, 10_000).unref?.();
        return;
      }
      unlinkUser(message.author.id, 'fluxer');
      const embed = createFluxerBrandEmbed(message)
        .setTitle('Account Unlinked')
        .setDescription(`Successfully unlinked your Fluxer account from Discord ID \`${existing}\`.`);
      await sendFluxerEmbed(message, embed);
      return;
    }

    const result = claimSyncCode(codeArg, message.author.id, 'fluxer');
    if (!result.success) {
      const errorEmbed = createFluxerBrandEmbed(message)
        .setTitle('Sync Failed')
        .setDescription(result.message);
      const rep = await sendFluxerEmbed(message, errorEmbed);
      setTimeout(() => {
        if (typeof rep.delete === 'function') rep.delete().catch(() => {});
      }, 10_000).unref?.();
      return;
    }

    const user = message.author;
    const member = message.member;
    const fluxerDisplayName = member?.nick || user.globalName || user.username;
    const avatarUrl = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL() : undefined;

    // Look up Discord user and send connection notification to Discord as well
    let discordTag = `\`${result.link?.discordId}\``;
    const discordClient = getDiscordClient();
    if (discordClient && result.link?.discordId) {
      try {
        const discordUser = await discordClient.users.fetch(result.link.discordId);
        if (discordUser) {
          discordTag = `${discordUser.tag} (\`${discordUser.id}\`)`;

          // Send connection DM to Discord user!
          const discordConfirmEmbed = new DiscordEmbedBuilder()
            .setColor(config.embedColor || BRAND.color)
            .setTitle('Account Linked Successfully!')
            .setDescription(
              `🎉 Your Discord account was just linked with Fluxer!\n\n` +
              `• **Fluxer User**: ${fluxerDisplayName} (\`@${user.username}\`)\n` +
              `• **Fluxer ID**: \`${user.id}\`\n` +
              `• **Discord User**: ${discordUser.tag}\n\n` +
              `Your **Global AFK** status will now seamlessly synchronize across both Discord and Fluxer.`
            )
            .setTimestamp();

          if (avatarUrl) {
            discordConfirmEmbed.setThumbnail(avatarUrl);
          }

          await discordUser.send({ embeds: [discordConfirmEmbed] }).catch(() => {});
        }
      } catch {
        // Discord DM is best effort
      }
    }

    const successEmbed = createFluxerBrandEmbed(message)
      .setTitle('Account Linked Successfully!')
      .setDescription(
        `🎉 Successfully linked your Fluxer account with Discord!\n\n` +
        `• **Fluxer User**: ${fluxerDisplayName} (\`@${user.username}\`)\n` +
        `• **Fluxer ID**: \`${user.id}\`\n` +
        `• **Linked Discord**: ${discordTag}\n\n` +
        `Your **Global AFK** status will now seamlessly synchronize across both platforms.`
      );

    if (avatarUrl) {
      successEmbed.setThumbnail(avatarUrl);
    }

    await sendFluxerEmbed(message, successEmbed);
  },
};

const backupCommand: FluxerCommand = {
  name: BACKUP_COMMAND_META.name,
  aliases: BACKUP_COMMAND_META.aliases,
  description: BACKUP_COMMAND_META.description,
  async execute(message: Message, args: string[]): Promise<void> {
    const sub = (args[0] ?? '').toLowerCase();
    const linkedDiscordId = getLinkedDiscordId(message.author.id);
    const isOwner =
      message.author.id === '1475646107256324606' ||
      linkedDiscordId === '1130510553266278501' ||
      (!!config.ownerId && (message.author.id === config.ownerId || linkedDiscordId === config.ownerId));

    if (sub === 'now' || sub === 'snapshot') {
      if (!isOwner) {
        const embed = createFluxerBrandEmbed(message)
          .setTitle('Permission Denied')
          .setDescription('You do not have permission to trigger cloud backups. Restricted to bot administrators.');
        await sendFluxerEmbed(message, embed);
        return;
      }

      const pendingEmbed = createFluxerBrandEmbed(message)
        .setTitle('Cloud Backup In Progress')
        .setDescription('Creating snapshot of persistent data and dispatching to cloud backup channel...');
      const msg = await sendFluxerEmbed(message, pendingEmbed);

      const username = message.author?.username ?? 'admin';
      const success = await performCloudBackup(`manual_by_${username}`);
      const resultEmbed = createFluxerBrandEmbed(message)
        .setTitle(success ? 'Cloud Backup Successful' : 'Cloud Backup Failed')
        .setDescription(
          success
            ? 'State snapshot was successfully created, chunked, and dispatched to the cloud backup channel.'
            : 'Failed to dispatch cloud backup. Please check logs and channel permissions.'
        );
      if (msg && typeof (msg as any).edit === 'function') {
        await (msg as any).edit({ embeds: [resultEmbed] }).catch(() => sendFluxerEmbed(message, resultEmbed));
      } else {
        await sendFluxerEmbed(message, resultEmbed);
      }
      return;
    }

    if (sub === 'restore') {
      if (!isOwner) {
        const embed = createFluxerBrandEmbed(message)
          .setTitle('Permission Denied')
          .setDescription('You do not have permission to trigger state restoration. Restricted to bot administrators.');
        await sendFluxerEmbed(message, embed);
        return;
      }

      const pendingEmbed = createFluxerBrandEmbed(message)
        .setTitle('Disaster Recovery In Progress')
        .setDescription('Fetching latest cloud backup snapshot and restoring state...');
      const msg = await sendFluxerEmbed(message, pendingEmbed);

      const success = await restoreFromCloud(true);
      const resultEmbed = createFluxerBrandEmbed(message)
        .setTitle(success ? 'Cloud Restore Successful' : 'Cloud Restore Failed')
        .setDescription(
          success
            ? 'Persistent data successfully restored from cloud backup. In-memory stores have been reloaded.'
            : 'Failed to restore state from cloud backup. Please check logs and channel permissions.'
        );
      if (msg && typeof (msg as any).edit === 'function') {
        await (msg as any).edit({ embeds: [resultEmbed] }).catch(() => sendFluxerEmbed(message, resultEmbed));
      } else {
        await sendFluxerEmbed(message, resultEmbed);
      }
      return;
    }

    const standardDef = STANDARD_COMMANDS.find((c) => c.name === BACKUP_COMMAND_META.name);
    if (standardDef) {
      const payload = standardDef.getPayload({ platform: 'fluxer', args });
      const embed = createFluxerBrandEmbed(message)
        .setTitle(payload.title)
        .setDescription(payload.description);
      if (payload.fields && payload.fields.length > 0) {
        embed.addFields(...payload.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
      }
      await sendFluxerEmbed(message, embed);
    }
  },
};

export const COMMANDS: readonly FluxerCommand[] = [
  ...standardFluxerCommands,
  afkCommand,
  syncCommand,
  backupCommand,
  helpCommand,
];

const commandLookup = new Map<string, FluxerCommand>();

for (const command of COMMANDS) {
  registerCommand(command);
}

function registerCommand(command: FluxerCommand): void {
  commandLookup.set(command.name, command);
  for (const alias of command.aliases ?? []) {
    commandLookup.set(alias, command);
  }
}

export function getFluxerCommand(name: string): FluxerCommand | null {
  return commandLookup.get(name) ?? null;
}
