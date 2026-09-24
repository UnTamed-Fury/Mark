import { type Client as DiscordClient, EmbedBuilder as DiscordEmbedBuilder } from 'discord.js';
import { EmbedBuilder as FluxerEmbedBuilder } from '@fluxerjs/core';
import { config } from '../config.js';
import { BRAND } from '../constants.js';
import { drainRecentAfkEvents, getActiveAfkList, formatDuration } from './afkManager.js';
import { createLogger, getLogsAfterId } from './logger.js';
import { drainRecentSyncEvents, getAllLinks } from './syncManager.js';
import { getDiscordClient } from '../platforms/discord/client.js';
import { getFluxerClient } from '../platforms/fluxer/client.js';

const log = createLogger('PeriodicLogger');

const COLOR_ERROR = 0xed4245;
const COLOR_WARN = 0xfee75c;

let timersStarted = false;
let discordClientInstance: DiscordClient | null = null;
let lastFlushedLogId = 0;
const warnedMissingChannels = new Set<string>();

export interface EmbedPayload {
  title: string;
  description: string;
  color: number;
  timestamp?: Date;
}

interface UnifiedLogTarget {
  platform: 'discord' | 'fluxer';
  channelId: string;
  sendBatches: (payloads: EmbedPayload[]) => Promise<void>;
}

export function splitIntoChunks(text: string, maxChunkLength: number): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (line.length > maxChunkLength) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      let remainingLine = line;
      while (remainingLine.length > maxChunkLength) {
        chunks.push(remainingLine.slice(0, maxChunkLength));
        remainingLine = remainingLine.slice(maxChunkLength);
      }
      if (remainingLine.length > 0) {
        currentChunk = remainingLine;
      }
      continue;
    }

    if (currentChunk.length + line.length + 1 > maxChunkLength) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
    }
    currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export function createEmbedBatches(
  embedPayloads: EmbedPayload[],
  maxTotalChars = 5500,
  maxEmbedsPerMsg = 10
): EmbedPayload[][] {
  const batches: EmbedPayload[][] = [];
  let currentBatch: EmbedPayload[] = [];
  let currentBatchChars = 0;

  for (const payload of embedPayloads) {
    const payloadChars = (payload.title?.length || 0) + (payload.description?.length || 0);

    if (
      currentBatch.length >= maxEmbedsPerMsg ||
      (currentBatch.length > 0 && currentBatchChars + payloadChars > maxTotalChars)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchChars = 0;
    }

    currentBatch.push(payload);
    currentBatchChars += payloadChars;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function toDiscordEmbed(p: EmbedPayload): DiscordEmbedBuilder {
  const eb = new DiscordEmbedBuilder()
    .setTitle(p.title)
    .setDescription(p.description)
    .setColor(p.color);
  if (p.timestamp) eb.setTimestamp(p.timestamp);
  return eb;
}

function toFluxerEmbed(p: EmbedPayload): FluxerEmbedBuilder {
  const eb = new FluxerEmbedBuilder()
    .setTitle(p.title)
    .setDescription(p.description)
    .setColor(p.color);
  if (p.timestamp) eb.setTimestamp(p.timestamp);
  return eb;
}

async function sendBatchedEmbeds<T>(
  channel: { send: (opts: { embeds: T[] }) => Promise<unknown> },
  payloads: EmbedPayload[],
  renderEmbed: (p: EmbedPayload) => T,
): Promise<void> {
  const batches = createEmbedBatches(payloads);
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const embeds = batches[i]!.map(renderEmbed);
    await channel.send({ embeds });
  }
}

async function resolveLogTarget(
  channelId: string | null,
  channelRoleName: string
): Promise<UnifiedLogTarget | null> {
  if (!channelId) return null;

  // 1. Try Discord client
  const discord = discordClientInstance || getDiscordClient();
  if (discord && discord.isReady()) {
    try {
      const channel = await discord.channels.fetch(channelId);
      if (channel && channel.isTextBased() && 'send' in channel) {
        warnedMissingChannels.delete(channelId);
        return {
          platform: 'discord',
          channelId,
          sendBatches: (payloads: EmbedPayload[]) =>
            sendBatchedEmbeds(channel as any, payloads, toDiscordEmbed),
        };
      }
    } catch {
      // Not found on Discord, continue to Fluxer check
    }
  }

  // 2. Try Fluxer client
  const fluxer = getFluxerClient();
  if (fluxer && fluxer.isReady()) {
    try {
      const channel = await fluxer.channels.fetch(channelId);
      if (channel && channel.isTextBased() && 'send' in channel) {
        warnedMissingChannels.delete(channelId);
        return {
          platform: 'fluxer',
          channelId,
          sendBatches: (payloads: EmbedPayload[]) =>
            sendBatchedEmbeds(channel as any, payloads, toFluxerEmbed),
        };
      }
    } catch {
      // Not found on Fluxer
    }
  }

  // Channel could not be resolved on either platform
  if (!warnedMissingChannels.has(channelId)) {
    warnedMissingChannels.add(channelId);
    log.warn(
      `Configured ${channelRoleName} ("${channelId}") could not be found or accessed on Discord or Fluxer. ` +
        `Verify bot permissions ("View Channel" and "Send Messages") and channel ID in .config.mark`
    );
  }

  return null;
}

export async function flushSystemLogs(): Promise<void> {
  const targetLogChannelId = config.logChannelId;
  try {
    const rawLogs = getLogsAfterId(lastFlushedLogId);
    if (rawLogs.length === 0) return;

    lastFlushedLogId = rawLogs[rawLogs.length - 1]!.id;

    // Exclude PeriodicLogger logs to avoid feedback loops
    const recentLogs = rawLogs.filter((l) => l.context !== 'PeriodicLogger');
    if (recentLogs.length === 0) return;

    const target = await resolveLogTarget(targetLogChannelId, 'log_channel_id');
    if (!target) return;

    const hasError = recentLogs.some((l) => l.level === 'error');
    const hasWarn = recentLogs.some((l) => l.level === 'warn');
    const embedColor = hasError
      ? COLOR_ERROR
      : hasWarn
        ? COLOR_WARN
        : (config.embedColor || BRAND.color);

    const logText = recentLogs
      .map((l) => {
        const time = new Date(l.timestamp).toISOString().split('T')[1]?.slice(0, 8);
        return `[${time}] [${l.level.toUpperCase()}] [${l.context}] ${l.message}`;
      })
      .join('\n');

    const chunks = splitIntoChunks(logText, 1800);
    const embedPayloads: EmbedPayload[] = chunks.map((chunk, i) => ({
      title: chunks.length > 1 ? `System Logs (${i + 1}/${chunks.length})` : 'System Logs (Batch)',
      description: `\`\`\`prolog\n${chunk}\n\`\`\``,
      color: embedColor,
      timestamp: new Date(),
    }));

    try {
      await target.sendBatches(embedPayloads);
    } catch (err) {
      log.error(`Failed to dispatch system logs to ${target.platform} channel ${target.channelId}:`, err);
    }
  } catch (err) {
    log.error('Error in system logs dispatch loop:', err);
  }
}

export async function flushLogsImmediately(): Promise<void> {
  await flushSystemLogs();
}

export function startPeriodicLogging(client?: DiscordClient): void {
  if (client) {
    discordClientInstance = client;
  }

  if (timersStarted) return;
  timersStarted = true;

  const targetLogChannelId = config.logChannelId;
  const targetAfkChannelId = config.afkLogChannelId || targetLogChannelId;
  const targetSyncChannelId = config.syncLogChannelId || targetLogChannelId;

  // 1. Every 1 minute: Flush recent system & runtime logs
  setInterval(async () => {
    await flushSystemLogs();
  }, (config.logFlushIntervalSec || 60) * 1000).unref();

  // 2. AFK Activity Summary
  setInterval(async () => {
    try {
      const events = drainRecentAfkEvents();
      const activeAfks = getActiveAfkList();

      // Only send summary if there was actual AFK activity during this window
      if (events.length === 0) {
        return;
      }

      const target = await resolveLogTarget(targetAfkChannelId, 'afk_log_channel_id');
      if (!target) return;

      const setList = events.filter((e) => e.type === 'set');
      const clearedList = events.filter((e) => e.type === 'cleared');

      const lines: string[] = [];
      lines.push(`• **Active AFKs**: ${activeAfks.length} user(s)`);

      if (setList.length > 0) {
        lines.push(`• **New AFK in window** (${setList.length}):`);
        for (const s of setList.slice(0, 10)) {
          lines.push(`  - <@${s.userId}> [${s.platform}]: "${s.reason}"`);
        }
      }

      if (clearedList.length > 0) {
        lines.push(`• **Returned in window** (${clearedList.length}):`);
        for (const c of clearedList.slice(0, 10)) {
          const dur = c.durationMs ? formatDuration(c.durationMs) : 'unknown';
          lines.push(`  - <@${c.userId}> returned (was AFK for ${dur})`);
        }
      }

      const embedColor = config.embedColor || BRAND.color;
      const embedPayload: EmbedPayload = {
        title: 'AFK Activity Summary',
        description: lines.join('\n'),
        color: embedColor,
        timestamp: new Date(),
      };

      try {
        await target.sendBatches([embedPayload]);
      } catch (err) {
        log.error(`Failed to dispatch AFK summary to ${target.platform} channel ${target.channelId}:`, err);
      }
    } catch (err) {
      log.error('Error in AFK logs dispatch loop:', err);
    }
  }, (config.afkSummaryIntervalSec || 300) * 1000).unref();

  // 3. Account Sync Summary (offset by half the summary interval)
  const syncIntervalMs = (config.syncSummaryIntervalSec || 300) * 1000;
  const syncOffsetMs = Math.floor(syncIntervalMs / 2);

  setTimeout(() => {
    const runSyncSummary = async () => {
      try {
        const events = drainRecentSyncEvents();
        const allLinks = getAllLinks();

        if (events.length === 0) {
          return;
        }

        const target = await resolveLogTarget(targetSyncChannelId, 'sync_log_channel_id');
        if (!target) return;

        const lines: string[] = [];
        lines.push(`• **Total Linked Accounts**: ${allLinks.length}`);
        lines.push(`• **New Links in window** (${events.length}):`);
        for (const e of events.slice(0, 10)) {
          lines.push(`  - Discord \`${e.discordId}\` ↔ Fluxer \`${e.fluxerId}\``);
        }

        const embedColor = config.embedColor || BRAND.color;
        const embedPayload: EmbedPayload = {
          title: 'Account Sync Activity Summary',
          description: lines.join('\n'),
          color: embedColor,
          timestamp: new Date(),
        };

        try {
          await target.sendBatches([embedPayload]);
        } catch (err) {
          log.error(`Failed to dispatch sync summary to ${target.platform} channel ${target.channelId}:`, err);
        }
      } catch (err) {
        log.error('Error in sync logs dispatch loop:', err);
      }
    };

    // Run first time after offset, then repeat every syncIntervalMs
    runSyncSummary();
    setInterval(runSyncSummary, syncIntervalMs).unref();
  }, syncOffsetMs).unref();

  log.info(
    `Periodic loggers initialized (Flush: ${config.logFlushIntervalSec}s, AFK: ${config.afkSummaryIntervalSec}s, Sync: ${config.syncSummaryIntervalSec}s)`
  );
}
