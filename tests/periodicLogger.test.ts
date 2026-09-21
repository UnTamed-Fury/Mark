import { describe, it, expect } from 'vitest';
import { splitIntoChunks, createEmbedBatches, type EmbedPayload } from '../src/core/periodicLogger.js';
import { createLogger, getLogsAfterId, getLastLogId } from '../src/core/logger.js';

describe('Periodic Logger Utilities', () => {
  describe('splitIntoChunks', () => {
    it('returns a single chunk if content is below maxChunkLength', () => {
      const text = 'line 1\nline 2\nline 3';
      const chunks = splitIntoChunks(text, 100);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('splits lines across multiple chunks when maxChunkLength is exceeded', () => {
      const text = 'aaaaa\nbbbbb\nccccc\nddddd';
      // max 12 chars per chunk: "aaaaa\nbbbbb" = 11 chars
      const chunks = splitIntoChunks(text, 12);
      expect(chunks.length).toBeGreaterThan(1);
      const rejoined = chunks.join('\n');
      expect(rejoined).toBe(text);
    });

    it('splits extraordinarily long single lines without losing characters', () => {
      const longLine = 'x'.repeat(100);
      const chunks = splitIntoChunks(longLine, 30);
      expect(chunks.length).toBe(4);
      expect(chunks.join('')).toBe(longLine);
    });
  });

  describe('createEmbedBatches', () => {
    it('groups embeds within the character and count limit', () => {
      const embeds: EmbedPayload[] = [
        { title: 'Title 1', description: 'Desc 1', color: 0x000001 },
        { title: 'Title 2', description: 'Desc 2', color: 0x000001 },
      ];

      const batches = createEmbedBatches(embeds, 5500, 10);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(2);
    });

    it('splits into multiple batches when total characters exceed 5,500', () => {
      // 3 embeds of 2,000 characters each -> total 6,000 > 5,500
      const embeds: EmbedPayload[] = [
        { title: 'E1', description: 'a'.repeat(2000), color: 0x000001 },
        { title: 'E2', description: 'b'.repeat(2000), color: 0x000001 },
        { title: 'E3', description: 'c'.repeat(2000), color: 0x000001 },
      ];

      const batches = createEmbedBatches(embeds, 5500, 10);
      expect(batches).toHaveLength(2);
      expect(batches[0]).toHaveLength(2); // 4000 + titles <= 5500
      expect(batches[1]).toHaveLength(1); // remaining embed
    });

    it('splits into multiple batches when maximum embeds per message (10) is reached', () => {
      const embeds: EmbedPayload[] = Array.from({ length: 15 }, (_, i) => ({
        title: `E${i}`,
        description: `short desc ${i}`,
        color: 0x000001,
      }));

      const batches = createEmbedBatches(embeds, 5500, 10);
      expect(batches).toHaveLength(2);
      expect(batches[0]).toHaveLength(10);
      expect(batches[1]).toHaveLength(5);
    });
  });

  describe('Logger Sequence and getLogsAfterId', () => {
    it('assigns monotonic IDs to log entries and fetches only new logs', () => {
      const testLog = createLogger('TestContext');
      const startId = getLastLogId();

      testLog.info('Message A');
      testLog.warn('Message B');

      const logsAfterStart = getLogsAfterId(startId);
      expect(logsAfterStart.length).toBeGreaterThanOrEqual(2);

      const lastSeenId = logsAfterStart[logsAfterStart.length - 1]!.id;
      expect(lastSeenId).toBeGreaterThan(startId);

      // Subsequent query with lastSeenId should return no logs until a new one is logged
      expect(getLogsAfterId(lastSeenId)).toHaveLength(0);

      testLog.error('Message C');
      const newLogs = getLogsAfterId(lastSeenId);
      expect(newLogs).toHaveLength(1);
      expect(newLogs[0]!.message).toContain('Message C');
    });
  });
});
