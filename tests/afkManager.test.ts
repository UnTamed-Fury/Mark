import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setAfk,
  getAfk,
  clearAfk,
  canNotifyAfk,
  recordAfkNotification,
  formatDuration,
  getRelativeTimestamp,
  clearAllAfk,
} from '../src/core/afkManager.js';

describe('AFK Manager', () => {
  beforeEach(() => {
    clearAllAfk();
  });

  afterEach(() => {
    clearAllAfk();
  });

  describe('setAfk and getAfk', () => {
    it('sets and retrieves global AFK status', () => {
      const entry = setAfk('user1', 'global', 'discord', 'guild1', 'Guild One', 'Eating lunch');
      expect(entry.userId).toBe('user1');
      expect(entry.scope).toBe('global');
      expect(entry.reason).toBe('Eating lunch');

      // Should be found on discord in same guild
      expect(getAfk('user1', 'discord', 'guild1')).toEqual(entry);
      // Should be found on discord in different guild
      expect(getAfk('user1', 'discord', 'guild2')).toEqual(entry);
      // Should be found on fluxer in any guild
      expect(getAfk('user1', 'fluxer', 'guild3')).toEqual(entry);
    });

    it('defaults to AFK if reason is empty or whitespace', () => {
      const entry = setAfk('user2', 'global', 'discord', 'guild1', 'Guild One', '   ');
      expect(entry.reason).toBe('AFK');
    });

    it('sets and retrieves server-only AFK status', () => {
      const entry = setAfk('user3', 'server', 'discord', 'guild1', 'Guild One', 'Studying');
      expect(entry.scope).toBe('server');

      // Should match in guild1 on discord
      expect(getAfk('user3', 'discord', 'guild1')).toEqual(entry);

      // Should NOT match in guild2 on discord
      expect(getAfk('user3', 'discord', 'guild2')).toBeNull();

      // Should NOT match in guild1 on fluxer
      expect(getAfk('user3', 'fluxer', 'guild1')).toBeNull();
    });

    it('replaces existing AFK when setting new AFK', () => {
      setAfk('user4', 'server', 'discord', 'guild1', 'Guild One', 'First reason');
      const updated = setAfk('user4', 'global', 'discord', 'guild1', 'Guild One', 'New global reason');

      expect(getAfk('user4', 'discord', 'guild1')?.reason).toBe('New global reason');
      expect(getAfk('user4', 'discord', 'guild2')?.reason).toBe('New global reason');
    });
  });

  describe('clearAfk', () => {
    it('clears global AFK status and returns the cleared entry', () => {
      setAfk('user5', 'global', 'discord', 'guild1', 'Guild One', 'Sleeping');
      const cleared = clearAfk('user5', 'discord', 'guild2');

      expect(cleared).not.toBeNull();
      expect(cleared?.reason).toBe('Sleeping');
      expect(getAfk('user5', 'discord', 'guild1')).toBeNull();
    });

    it('clears server AFK status only in matching guild', () => {
      setAfk('user6', 'server', 'discord', 'guild1', 'Guild One', 'Working');

      // Trying to clear in different guild does nothing
      const notCleared = clearAfk('user6', 'discord', 'guild2');
      expect(notCleared).toBeNull();
      expect(getAfk('user6', 'discord', 'guild1')).not.toBeNull();

      // Clearing in same guild succeeds
      const cleared = clearAfk('user6', 'discord', 'guild1');
      expect(cleared).not.toBeNull();
      expect(getAfk('user6', 'discord', 'guild1')).toBeNull();
    });

    it('returns null when clearing non-existent AFK', () => {
      expect(clearAfk('nobody', 'discord', 'guild1')).toBeNull();
    });
  });

  describe('Notification Cooldown (Anti-spam)', () => {
    it('throttles notifications per user per channel', () => {
      expect(canNotifyAfk('user7', 'chan1')).toBe(true);

      recordAfkNotification('user7', 'chan1');
      expect(canNotifyAfk('user7', 'chan1')).toBe(false);

      // Different channel should still be allowed
      expect(canNotifyAfk('user7', 'chan2')).toBe(true);

      // Different user should still be allowed
      expect(canNotifyAfk('user8', 'chan1')).toBe(true);
    });
  });

  describe('Formatting Helpers', () => {
    it('formats durations properly', () => {
      expect(formatDuration(5_000)).toBe('5s');
      expect(formatDuration(90_000)).toBe('1m 30s');
      expect(formatDuration(3_665_000)).toBe('1h 1m');
      expect(formatDuration(90_000_000)).toBe('1d 1h');
    });

    it('generates relative discord timestamp markdown', () => {
      const now = 1726000000000;
      expect(getRelativeTimestamp(now)).toBe(`<t:1726000000:R>`);
    });
  });
});
