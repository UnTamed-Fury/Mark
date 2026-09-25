import {
  Collection,
  type Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import { config } from '../../config.js';
import { BRAND } from '../../constants.js';
import {
  AFK_COMMAND_META,
  SYNC_COMMAND_META,
} from '../../core/commandsData.js';
import {
  STANDARD_COMMANDS,
  buildHelpPayload,
  type StandardCommandDef,
} from '../../core/commandEngine.js';
import { setAfk, getRelativeTimestamp, type AfkScope } from '../../core/afkManager.js';
import { createSyncCode, claimSyncCode, getLinkedFluxerId, unlinkUser } from '../../core/syncManager.js';
import { createLogger } from '../../core/logger.js';
import { createBrandEmbed, sendEmbed } from './embeds.js';
import { getFluxerClient } from '../fluxer/client.js';
import { createFluxerBrandEmbed } from '../fluxer/embeds.js';

const log = createLogger('DiscordCommands');

export interface DiscordCommand {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  execute(message: Message, args: string[]): Promise<void>;
}

function adaptStandardDiscordCommand(cmd: StandardCommandDef): DiscordCommand {
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

      const payload = cmd.getPayload({ wsPing, args, platform: 'discord' });
      const embed = createBrandEmbed(message)
        .setTitle(payload.title)
        .setDescription(payload.description);

      if (payload.fields && payload.fields.length > 0) {
        embed.addFields(payload.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
      }

      if (payload.url) {
        embed.setURL(payload.url);
      }

      await sendEmbed(message, embed);
    },
  };
}

const standardDiscordCommands: DiscordCommand[] = STANDARD_COMMANDS.map(adaptStandardDiscordCommand);

const helpCommand: DiscordCommand = {
  name: 'help',
  aliases: ['h', 'commands', 'cmd', 'cmds'],
  description: 'Lists available commands or details for a specific command.',
  async execute(message: Message, args: string[]): Promise<void> {
    const payload = buildHelpPayload(COMMANDS, args[0]);
    const embed = createBrandEmbed(message)
      .setTitle(payload.title)
      .setDescription(payload.description);

    if (payload.fields && payload.fields.length > 0) {
      embed.addFields(payload.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
    }

    await sendEmbed(message, embed);
  },
};

const afkCommand: DiscordCommand = {
  name: AFK_COMMAND_META.name,
  aliases: AFK_COMMAND_META.aliases,
  description: AFK_COMMAND_META.description,
  async execute(message: Message, args: string[]): Promise<void> {
    const reason = args.join(' ').trim() || 'AFK';
    const serverName = message.guild?.name ?? 'this server';

    const embed = createBrandEmbed(message)
      .setTitle('AFK Configuration')
      .setDescription(
        `Choose your AFK scope below for reason: **${reason}**\n\n` +
        `• **Global AFK**: Set AFK across all servers (Discord & Fluxer).\n` +
        `• **Server Only**: Set AFK only in **${serverName}**.\n` +
        `• **Cancel**: Cancel AFK setup.`
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`afk_global_${message.author.id}`)
        .setLabel('Global AFK')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`afk_server_${message.author.id}`)
        .setLabel('Server Only')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`afk_cancel_${message.author.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger),
    );

    const promptMsg = await message.reply({
      embeds: [embed],
      components: [row],
      allowedMentions: { repliedUser: false },
    });

    try {
      const interaction = await promptMsg.awaitMessageComponent({
        filter: (i: ButtonInteraction) => {
          if (i.user.id !== message.author.id) {
            i.reply({ content: 'This AFK prompt is not for you.', flags: MessageFlags.Ephemeral }).catch(() => {});
            return false;
          }
          return i.customId.startsWith('afk_');
        },
        componentType: ComponentType.Button,
        time: 60_000,
      });

      // Immediately acknowledge interaction within 3s window to prevent interaction failure
      await interaction.deferUpdate().catch(() => {});

      if (interaction.customId.startsWith('afk_cancel_')) {
        const cancelEmbed = createBrandEmbed(message)
          .setTitle('AFK Cancelled')
          .setDescription('AFK setup was cancelled.');
        try {
          await interaction.editReply({ embeds: [cancelEmbed], components: [] });
        } catch {
          await promptMsg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
        }
        return;
      }

      const scope: AfkScope = interaction.customId.startsWith('afk_global_') ? 'global' : 'server';
      const entry = setAfk(message.author.id, scope, 'discord', message.guildId, message.guild?.name, reason);
      const relativeTime = getRelativeTimestamp(entry.timestamp);
      const scopeLabel = scope === 'global' ? 'globally' : `in **${serverName}**`;

      const successEmbed = createBrandEmbed(message)
        .setTitle(`${message.author.displayName || message.author.username} is now AFK`)
        .setDescription(
          `You are now set as AFK ${scopeLabel}.\n\n` +
          `• **Reason**: ${entry.reason}\n` +
          `• **Started**: ${relativeTime}`
        );

      try {
        await interaction.editReply({ embeds: [successEmbed], components: [] });
      } catch {
        await promptMsg.edit({ embeds: [successEmbed], components: [] }).catch(() => {});
      }
    } catch (err) {
      log.debug('AFK interaction collector ended:', err);
      // Timeout after 60s
      await promptMsg.edit({ components: [] }).catch(() => {});
    }
  },
};

const syncCommand: DiscordCommand = {
  name: SYNC_COMMAND_META.name,
  aliases: SYNC_COMMAND_META.aliases,
  description: SYNC_COMMAND_META.description,
  async execute(message: Message, args: string[]): Promise<void> {
    // 1. Immediately delete user command message to avoid leaking any code in chat
    if (typeof message.delete === 'function') {
      message.delete().catch(() => {});
    }

    const codeArg = args[0]?.trim();

    if (!codeArg) {
      const existing = getLinkedFluxerId(message.author.id);
      if (existing) {
        const embed = createBrandEmbed(message)
          .setTitle('Account Already Linked')
          .setDescription(
            `Your Discord account is currently linked to Fluxer ID: \`${existing}\`.\n\n` +
            `• To re-link, run \`${config.prefix}sync <code>\` with a code generated from Fluxer.\n` +
            `• To unlink, run \`${config.prefix}sync unlink\`.`
          );
        const rep = await sendEmbed(message, embed);
        setTimeout(() => rep.delete().catch(() => {}), 15_000).unref?.();
        return;
      }

      const code = createSyncCode(message.author.id, 'discord');

      // Attempt direct DM first so the code never enters any public channel
      const dmEmbed = createBrandEmbed(message)
        .setTitle('Private Account Sync Code')
        .setDescription(
          `Your one-time link code is:\n\n` +
          `# \`${code}\`\n\n` +
          `Go to **Fluxer** within **${config.syncCodeExpirySec || 30} seconds** and send:\n` +
          `\`${config.prefix}sync ${code}\`\n\n` +
          `*(Valid for ${config.syncCodeExpirySec || 30} seconds. Keep this private).*`
        );

      let dmSent = false;
      try {
        await message.author.send({ embeds: [dmEmbed] });
        dmSent = true;
      } catch {
        dmSent = false;
      }

      // Render an ephemeral button in channel ("Only you can see this" - AutoMod style)
      const revealBtnId = `reveal_sync_${message.author.id}_${Date.now()}`;
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(revealBtnId)
          .setLabel('Click to Reveal One-Time Code')
          .setStyle(ButtonStyle.Primary)
      );

      const promptEmbed = createBrandEmbed(message)
        .setTitle('Account Sync • One-Time Code')
        .setDescription(
          dmSent
            ? `**A private link code was sent to your DMs.**\n\n` +
              `Or click the button below to reveal it ephemerally (*only you can see it*).\n` +
              `*(This prompt auto-deletes in ${config.syncCodeExpirySec || 30}s)*`
            : `**Could not DM you (DMs may be closed).**\n\n` +
              `Click the button below to reveal your secret code ephemerally (*only you can see it*).\n` +
              `*(This prompt auto-deletes in ${config.syncCodeExpirySec || 30}s)*`
        );

      const promptMsg =
        message.channel && typeof (message.channel as any).send === 'function'
          ? await (message.channel as any).send({
              embeds: [promptEmbed],
              components: [row],
            })
          : await message.reply({
              embeds: [promptEmbed],
              components: [row],
            });

      if (promptMsg && typeof promptMsg.createMessageComponentCollector === 'function') {
        const collector = promptMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: (config.syncCodeExpirySec || 30) * 1000,
        });

        collector.on('collect', async (btnInteraction: ButtonInteraction) => {
          try {
            if (btnInteraction.user.id !== message.author.id) {
              await btnInteraction.reply({
                content: 'This sync code prompt belongs to another user.',
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            await btnInteraction.reply({
              content:
                `**Your Secret One-Time Sync Code is:**\n\n` +
                `# \`${code}\`\n\n` +
                `Switch to **Fluxer** within **${config.syncCodeExpirySec || 30} seconds** and send:\n` +
                `\`${config.prefix}sync ${code}\`\n\n` +
                `*(Only you can see this message)*`,
              flags: MessageFlags.Ephemeral,
            });
          } catch {
            // Best-effort response for already acknowledged or expired interactions
          }
        });

        collector.on('end', () => {
          promptMsg.delete().catch(() => {});
        });
      } else if (promptMsg && typeof promptMsg.delete === 'function') {
        setTimeout(() => {
          promptMsg.delete().catch(() => {});
        }, (config.syncCodeExpirySec || 30) * 1000).unref?.();
      }
      return;
    }

    if (codeArg.toLowerCase() === 'unlink') {
      const existing = getLinkedFluxerId(message.author.id);
      if (!existing) {
        const embed = createBrandEmbed(message)
          .setTitle('Not Linked')
          .setDescription('Your Discord account is not currently linked to any Fluxer account.');
        const rep = await sendEmbed(message, embed);
        setTimeout(() => rep.delete().catch(() => {}), 10_000).unref?.();
        return;
      }
      unlinkUser(message.author.id, 'discord');
      const embed = createBrandEmbed(message)
        .setTitle('Account Unlinked')
        .setDescription(`Successfully unlinked your Discord account from Fluxer ID \`${existing}\`.`);
      await sendEmbed(message, embed);
      return;
    }

    const result = claimSyncCode(codeArg, message.author.id, 'discord');
    if (!result.success) {
      const errorEmbed = createBrandEmbed(message)
        .setTitle('Sync Failed')
        .setDescription(result.message);
      const rep = await sendEmbed(message, errorEmbed);
      setTimeout(() => rep.delete().catch(() => {}), 10_000).unref?.();
      return;
    }

    const member = message.member;
    const discordName = member?.nickname || message.author.displayName || message.author.username;
    const discordAvatar = message.author.displayAvatarURL();

    const successEmbed = createBrandEmbed(message)
      .setTitle('Account Linked Successfully!')
      .setDescription(
        `🎉 Successfully linked your Discord account with Fluxer!\n\n` +
        `• **Discord User**: ${discordName} (\`@${message.author.username}\`)\n` +
        `• **Discord ID**: \`${message.author.id}\`\n` +
        `• **Fluxer ID**: \`${result.link?.fluxerId}\`\n\n` +
        `Your **Global AFK** status will now seamlessly synchronize across both Discord and Fluxer.`
      );

    if (discordAvatar) {
      successEmbed.setThumbnail(discordAvatar);
    }
    await sendEmbed(message, successEmbed);

    // Cross-notify Fluxer client if online
    const fluxerClient = getFluxerClient();
    if (fluxerClient && result.link?.fluxerId) {
      try {
        const fluxerUser = await (fluxerClient as any).users?.fetch?.(result.link.fluxerId);
        if (fluxerUser && typeof fluxerUser.send === 'function') {
          const crossEmbed = createFluxerBrandEmbed()
            .setTitle('Account Linked Successfully!')
            .setDescription(
              `🎉 Your Fluxer account was just linked to Discord user **${discordName}** (\`@${message.author.username}\`)!\n\n` +
              `• **Discord ID**: \`${message.author.id}\`\n\n` +
              `Your **Global AFK** status will now seamlessly synchronize across both platforms.`
            );
          if (discordAvatar) {
            crossEmbed.setThumbnail(discordAvatar);
          }
          await fluxerUser.send({ embeds: [crossEmbed] }).catch(() => {});
        }
      } catch {
        // Cross notify is best effort
      }
    }
  },
};

export const COMMANDS: readonly DiscordCommand[] = [
  ...standardDiscordCommands,
  afkCommand,
  syncCommand,
  helpCommand,
];

const commandLookup = new Collection<string, DiscordCommand>();

for (const command of COMMANDS) {
  registerCommand(command);
}

function registerCommand(command: DiscordCommand): void {
  commandLookup.set(command.name, command);
  for (const alias of command.aliases ?? []) {
    commandLookup.set(alias, command);
  }
}

export function getDiscordCommand(name: string): DiscordCommand | null {
  return commandLookup.get(name) ?? null;
}
