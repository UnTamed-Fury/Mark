import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLogger,
  getLogsAfterId,
  getLogsSince,
  getLastLogId,
  type LogEntry,
} from '../src/core/logger.js';
import {
  setAfk,
  clearAfk,
  drainRecentAfkEvents,
  getActiveAfkList,
  purgeHistoricalData,
  clearAllAfk,
} from '../src/core/afkManager.js';
import {
  createSyncCode,
  claimSyncCode,
  unlinkUser,
  drainRecentSyncEvents,
  clearAllSync,
} from '../src/core/syncManager.js';
import {
  splitIntoChunks,
  createEmbedBatches,
  type EmbedPayload,
} from '../src/core/periodicLogger.js';

describe('Debug Data & Telemetry Test Suite', () => {
  beforeEach(() => {
    clearAllAfk();
    clearAllSync();
  });

  describe('Logger Sequence & Memory Ring Buffer', () => {
    const testLog = createLogger('DebugTestContext');

    it('ensures log IDs increment strictly monotonically without gaps or collisions', () => {
      const initialId = getLastLogId();

      testLog.info('Sequence checkpoint 1');
      testLog.info('Sequence checkpoint 2');
      testLog.warn('Sequence checkpoint 3');

      const logs = getLogsAfterId(initialId);
      expect(logs).toHaveLength(3);
      expect(logs[0]!.id).toBe(initialId + 1);
      expect(logs[1]!.id).toBe(initialId + 2);
      expect(logs[2]!.id).toBe(initialId + 3);
      expect(getLastLogId()).toBe(initialId + 3);
    });

    it('captures structured context, log levels, and stringifies complex argument payloads', () => {
      const startId = getLastLogId();
      const meta = { userId: '12345', details: { code: 200, success: true } };

      testLog.info('Event occurred with metadata:', meta);

      const [entry] = getLogsAfterId(startId) as [LogEntry];
      expect(entry).toBeDefined();
      expect(entry.context).toBe('DebugTestContext');
      expect(entry.level).toBe('info');
      expect(entry.message).toContain('Event occurred with metadata:');
      expect(entry.message).toContain('"userId":"12345"');
      expect(entry.message).toContain('"success":true');
    });

    it('caps internal ring buffer at MAX_LOG_BUFFER (500) during heavy log surges', () => {
      // Flood with 600 log messages
      for (let i = 0; i < 600; i++) {
        testLog.info(`Stress log flood entry ${i}`);
      }

      // Querying all buffered entries (id > 0)
      const allBufferedLogs = getLogsAfterId(0);
      expect(allBufferedLogs.length).toBeLessThanOrEqual(500);

      // Verify that the oldest surviving log entry is from the recent batch (not 0)
      const lastEntry = allBufferedLogs[allBufferedLogs.length - 1]!;
      expect(lastEntry.message).toContain('Stress log flood entry 599');
    });

    it('filters logs by timestamp cutoff correctly with getLogsSince', () => {
      const cutoff = Date.now();
      testLog.info('Pre-cutoff or exact cutoff event');

      const logs = getLogsSince(cutoff);
      expect(logs.length).toBeGreaterThanOrEqual(1);
      for (const log of logs) {
        expect(log.timestamp).toBeGreaterThanOrEqual(cutoff);
      }
    });

    it('returns an empty array when getLogsAfterId is passed the latest ID', () => {
      const currentId = getLastLogId();
      expect(getLogsAfterId(currentId)).toEqual([]);
    });
  });

  describe('AFK Manager Telemetry & Historical Purge', () => {
    it('records AFK set and cleared telemetry events and drains cleanly', () => {
      // Initially no events
      expect(drainRecentAfkEvents()).toHaveLength(0);

      // Set AFK
      setAfk('telemetry_user_1', 'global', 'discord', null, null, 'coding test');
      const setEvents = drainRecentAfkEvents();
      expect(setEvents).toHaveLength(1);
      expect(setEvents[0]!.type).toBe('set');
      expect(setEvents[0]!.userId).toBe('telemetry_user_1');
      expect(setEvents[0]!.reason).toBe('coding test');

      // Second drain must be empty
      expect(drainRecentAfkEvents()).toHaveLength(0);

      // Clear AFK
      clearAfk('telemetry_user_1', 'discord');
      const clearEvents = drainRecentAfkEvents();
      expect(clearEvents).toHaveLength(1);
      expect(clearEvents[0]!.type).toBe('cleared');
      expect(clearEvents[0]!.durationMs).toBeGreaterThanOrEqual(0);

      // Third drain must be empty
      expect(drainRecentAfkEvents()).toHaveLength(0);
    });

    it('provides accurate active AFK state snapshots via getActiveAfkList', () => {
      expect(getActiveAfkList()).toHaveLength(0);

      setAfk('active_user_1', 'global', 'discord', null, null, 'at store');
      setAfk('active_user_2', 'server', 'fluxer', 'guild_10', 'Guild 10', 'sleeping');

      const active = getActiveAfkList();
      expect(active).toHaveLength(2);
      expect(active.map((u) => u.userId)).toContain('active_user_1');
      expect(active.map((u) => u.userId)).toContain('active_user_2');

      clearAfk('active_user_1', 'discord');
      expect(getActiveAfkList()).toHaveLength(1);
      expect(getActiveAfkList()[0]!.userId).toBe('active_user_2');
    });

    it('purgeHistoricalData cleans expired throttle entries without removing active AFKs', () => {
      setAfk('preserved_afk_user', 'global', 'discord', null, null, 'preserved');

      // Purge should not alter active records
      purgeHistoricalData();

      expect(getActiveAfkList()).toHaveLength(1);
      expect(getActiveAfkList()[0]!.userId).toBe('preserved_afk_user');
    });
  });

  describe('Sync Manager Telemetry Events', () => {
    it('records account link and unlink telemetry events and drains cleanly', () => {
      expect(drainRecentSyncEvents()).toHaveLength(0);

      const code = createSyncCode('discord_sync_telemetry_user', 'discord');
      claimSyncCode(code, 'fluxer_sync_telemetry_user', 'fluxer');

      const linkEvents = drainRecentSyncEvents();
      expect(linkEvents).toHaveLength(1);
      expect(linkEvents[0]!.type).toBe('link');
      expect(linkEvents[0]!.discordId).toBe('discord_sync_telemetry_user');
      expect(linkEvents[0]!.fluxerId).toBe('fluxer_sync_telemetry_user');

      // Subsequent drain is empty
      expect(drainRecentSyncEvents()).toHaveLength(0);

      // Unlink
      unlinkUser('discord_sync_telemetry_user', 'discord');
      const unlinkEvents = drainRecentSyncEvents();
      expect(unlinkEvents).toHaveLength(1);
      expect(unlinkEvents[0]!.type).toBe('unlink');
      expect(unlinkEvents[0]!.discordId).toBe('discord_sync_telemetry_user');

      // Final drain is empty
      expect(drainRecentSyncEvents()).toHaveLength(0);
    });
  });

  describe('Periodic Logger Batching & Chunking Telemetry', () => {
    it('splits text streams into bounded chunks without dropping data', () => {
      const sampleText = Array.from({ length: 50 }, (_, i) => `Log entry #${i + 1}: Status OK`).join('\n');
      const maxChunk = 200;

      const chunks = splitIntoChunks(sampleText, maxChunk);
      expect(chunks.length).toBeGreaterThan(1);

      // Verify every chunk is within bounds
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(maxChunk);
      }

      // Verify original content can be reconstructed
      const reconstructed = chunks.join('\n');
      expect(reconstructed).toBe(sampleText);
    });

    it('batches embed payloads within Discord 5,500 total character limit and 10 embeds per message', () => {
      const embeds: EmbedPayload[] = Array.from({ length: 25 }, (_, i) => ({
        title: `Batch Embed #${i + 1}`,
        description: `Payload description for embed ${i + 1} with some padding content...`,
        color: 0x3498db,
      }));

      const batches = createEmbedBatches(embeds, 5500, 10);

      // 25 embeds / 10 per batch = 3 batches (10, 10, 5)
      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(10);
      expect(batches[1]).toHaveLength(10);
      expect(batches[2]).toHaveLength(5);

      for (const batch of batches) {
        const totalChars = batch.reduce(
          (sum, e) => sum + e.title.length + e.description.length,
          0
        );
        expect(totalChars).toBeLessThanOrEqual(5500);
      }
    });
  });
});
