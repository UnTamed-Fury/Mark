import { type Client, type TextChannel, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { BRAND } from '../constants.js';
import { drainRecentAfkEvents, getActiveAfkList, formatDuration } from './afkManager.js';
import { createLogger, getLogsSince } from './logger.js';
import { drainRecentSyncEvents, getAllLinks } from './syncManager.js';

const log = createLogger('PeriodicLogger');

let timersStarted = false;

function splitIntoChunks(text: string, maxChunkLength: number): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxChunkLength) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      // If a single line is absurdly long, slice it
      if (line.length > maxChunkLength) {
        chunks.push(line.slice(0, maxChunkLength));
        continue;
      }
    }
    currentChunk += (currentChunk.length > 0 ? '\n' : '') + line;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export function startPeriodicLogging(client: Client): void {
  if (timersStarted) return;
  timersStarted = true;

  const targetLogChannelId = config.logChannelId;
  const targetAfkChannelId = config.afkLogChannelId || targetLogChannelId;
  const targetSyncChannelId = config.syncLogChannelId || targetLogChannelId;

  const getChannel = async (id: string | null): Promise<TextChannel | null> => {
    if (!id) return null;
    try {
      const channel = await client.channels.fetch(id);
      if (channel && channel.isTextBased() && 'send' in channel) {
        return channel as TextChannel;
      }
    } catch {
      // Channel fetch error
    }
    return null;
  };

  // 1. Every 1 minute: Flush recent system & runtime logs (last 75 seconds / 1.2 min)
  setInterval(async () => {
    try {
      const channel = await getChannel(targetLogChannelId);
      if (!channel) return;

      const cutoff = Date.now() - 75_000;
      const recentLogs = getLogsSince(cutoff);
      if (recentLogs.length === 0) return;

      const logText = recentLogs
        .map((l) => {
          const time = new Date(l.timestamp).toISOString().split('T')[1]?.slice(0, 8);
          return `[${time}] [${l.level.toUpperCase()}] [${l.context}] ${l.message}`;
        })
        .join('\n');

      // Split into multi-embeds if description exceeds 3,800 chars
      const chunks = splitIntoChunks(logText, 3800);
      const embeds: EmbedBuilder[] = [];

      for (let i = 0; i < chunks.length && i < 10; i++) {
        const chunk = chunks[i]!;
        const embed = new EmbedBuilder()
          .setColor(BRAND.color)
          .setTitle(chunks.length > 1 ? `System Logs (${i + 1}/${chunks.length})` : 'System Logs (1-Min Batch)')
          .setDescription(`\`\`\`prolog\n${chunk}\n\`\`\``)
          .setTimestamp();
        embeds.push(embed);
      }

      if (embeds.length > 0) {
        await channel.send({ embeds }).catch(() => {});
      }
    } catch (err) {
      log.error('Error in 1-minute system logs dispatch:', err);
    }
  }, 60_000).unref();

  // 2. Every 5 minutes: AFK Activity Summary
  setInterval(async () => {
    try {
      const channel = await getChannel(targetAfkChannelId);
      if (!channel) return;

      const events = drainRecentAfkEvents();
      const activeAfks = getActiveAfkList();

      if (events.length === 0 && activeAfks.length === 0) {
        return;
      }

      const setList = events.filter((e) => e.type === 'set');
      const clearedList = events.filter((e) => e.type === 'cleared');

      const lines: string[] = [];
      lines.push(`• **Active AFKs**: ${activeAfks.length} user(s)`);

      if (setList.length > 0) {
        lines.push(`• **New AFK in 5m** (${setList.length}):`);
        for (const s of setList.slice(0, 10)) {
          lines.push(`  - <@${s.userId}> [${s.platform}]: "${s.reason}"`);
        }
      }

      if (clearedList.length > 0) {
        lines.push(`• **Returned in 5m** (${clearedList.length}):`);
        for (const c of clearedList.slice(0, 10)) {
          const dur = c.durationMs ? formatDuration(c.durationMs) : 'unknown';
          lines.push(`  - <@${c.userId}> returned (was AFK for ${dur})`);
        }
      }

      const embed = new EmbedBuilder()
        .setColor(BRAND.color)
        .setTitle('AFK Activity (5-Minute Summary)')
        .setDescription(lines.join('\n'))
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      log.error('Error in 5-minute AFK logs dispatch:', err);
    }
  }, 300_000).unref();

  // 3. Every 5 minutes (offset by 2.5 minutes / 150_000ms): Account Sync Summary
  setTimeout(() => {
    const runSyncSummary = async () => {
      try {
        const channel = await getChannel(targetSyncChannelId);
        if (!channel) return;

        const events = drainRecentSyncEvents();
        const allLinks = getAllLinks();

        if (events.length === 0) {
          return;
        }

        const lines: string[] = [];
        lines.push(`• **Total Linked Accounts**: ${allLinks.length}`);
        lines.push(`• **New Links in window** (${events.length}):`);
        for (const e of events.slice(0, 10)) {
          lines.push(`  - Discord \`${e.discordId}\` ↔ Fluxer \`${e.fluxerId}\``);
        }

        const embed = new EmbedBuilder()
          .setColor(BRAND.color)
          .setTitle('Account Sync Activity (5-Minute Summary)')
          .setDescription(lines.join('\n'))
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
      } catch (err) {
        log.error('Error in 5-minute sync logs dispatch:', err);
      }
    };

    // Run first time after 2.5 min offset, then repeat every 5 min
    runSyncSummary();
    setInterval(runSyncSummary, 300_000).unref();
  }, 150_000).unref();

  log.info('Periodic loggers initialized (1m system logs, 5m AFK, 5m Sync offset 2.5m)');
}
