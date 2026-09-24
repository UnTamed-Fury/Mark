import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  checkCooldown,
  recordCommandExecution,
  clearCooldowns,
} from '../src/core/cooldown.js';
import {
  setAfk,
  canNotifyAfk,
  recordAfkNotification,
  clearAllAfk,
} from '../src/core/afkManager.js';
import {
  createSyncCode,
  claimSyncCode,
  pruneExpiredSyncCodes,
  clearAllSync,
} from '../src/core/syncManager.js';
import { chunkBuffer } from '../src/core/cloudBackup.js';

describe('Stress & Throttling Test Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearCooldowns();
    clearAllAfk();
    clearAllSync();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Command Cooldown Engine Stress', () => {
    it('throttles rapid-fire bursts from a single user (1,000 rapid calls)', () => {
      const userId = 'user_stress_01';
      const channelId = 'channel_stress_01';

      // First call is permitted
      expect(checkCooldown(userId, channelId).onCooldown).toBe(false);
      recordCommandExecution(userId, channelId);

      // Remaining 999 calls must be throttled
      let throttledCount = 0;
      for (let i = 0; i < 999; i++) {
        const result = checkCooldown(userId, channelId);
        if (result.onCooldown) {
          throttledCount++;
        }
      }
      expect(throttledCount).toBe(999);
    });

    it('handles 1,000 concurrent distinct users without crosstalk or false throttling', () => {
      const channelId = 'shared_general_channel';
      const userCount = 1000;

      for (let i = 0; i < userCount; i++) {
        const userId = `unique_user_${i}`;
        const check = checkCooldown(userId, channelId);
        expect(check.onCooldown).toBe(false);
        recordCommandExecution(userId, channelId);
      }

      // Now verify every single user is individually on cooldown
      for (let i = 0; i < userCount; i++) {
        const userId = `unique_user_${i}`;
        const check = checkCooldown(userId, channelId);
        expect(check.onCooldown).toBe(true);
      }
    });

    it('accurately transitions between cross-channel (5s) and same-channel (15s) cooldowns', () => {
      const userId = 'user_channel_hopper';
      const channelA = 'channel_a';
      const channelB = 'channel_b';

      recordCommandExecution(userId, channelA);

      // Immediately: both channels throttled
      expect(checkCooldown(userId, channelA).onCooldown).toBe(true);
      expect(checkCooldown(userId, channelB).onCooldown).toBe(true);

      // Advance by 6 seconds (> 5s cross-channel cooldown, but < 15s same-channel cooldown)
      vi.advanceTimersByTime(6000);

      // Channel B should now be unthrottled, while Channel A remains on cooldown
      expect(checkCooldown(userId, channelB).onCooldown).toBe(false);
      expect(checkCooldown(userId, channelA).onCooldown).toBe(true);

      // Advance by 10 more seconds (total 16s > 15s)
      vi.advanceTimersByTime(10000);

      // Channel A is now also unthrottled
      expect(checkCooldown(userId, channelA).onCooldown).toBe(false);
    });
  });

  describe('AFK Mention Notification Throttling Stress', () => {
    it('handles 100 simultaneous pings to an AFK user in a single channel', () => {
      const afkUser = 'afk_target_01';
      const channelId = 'channel_afk_01';

      setAfk(afkUser, 'global', 'discord', null, null, 'sleeping');

      // First ping notification is permitted
      expect(canNotifyAfk(afkUser, channelId)).toBe(true);
      recordAfkNotification(afkUser, channelId);

      // Subsequent 99 pings in the same channel are throttled
      let blockedCount = 0;
      for (let i = 0; i < 99; i++) {
        if (!canNotifyAfk(afkUser, channelId)) {
          blockedCount++;
        }
      }
      expect(blockedCount).toBe(99);

      // Advance time by 10.5 seconds (past the 10s AFK notification cooldown)
      vi.advanceTimersByTime(10500);

      // Notification is allowed once again
      expect(canNotifyAfk(afkUser, channelId)).toBe(true);
    });

    it('isolates notification throttling across distinct channels for the same AFK user', () => {
      const afkUser = 'afk_target_02';
      const channel1 = 'channel_1';
      const channel2 = 'channel_2';

      setAfk(afkUser, 'global', 'discord', null, null, 'studying');

      // Ping in Channel 1
      expect(canNotifyAfk(afkUser, channel1)).toBe(true);
      recordAfkNotification(afkUser, channel1);

      // Immediate ping in Channel 2 is still permitted because channel throttle is separate
      expect(canNotifyAfk(afkUser, channel2)).toBe(true);
      recordAfkNotification(afkUser, channel2);

      // Both are now throttled in their respective channels
      expect(canNotifyAfk(afkUser, channel1)).toBe(false);
      expect(canNotifyAfk(afkUser, channel2)).toBe(false);
    });

    it('handles high-volume multi-target mentions independently', () => {
      const targetCount = 50;
      const channelId = 'burst_mention_channel';
      const users: string[] = [];

      for (let i = 0; i < targetCount; i++) {
        const u = `afk_batch_user_${i}`;
        users.push(u);
        setAfk(u, 'global', 'discord', null, null, 'away');
      }

      // First batch notification for all 50 users
      for (const u of users) {
        expect(canNotifyAfk(u, channelId)).toBe(true);
        recordAfkNotification(u, channelId);
      }

      // Second immediate pass: all 50 users must be throttled
      for (const u of users) {
        expect(canNotifyAfk(u, channelId)).toBe(false);
      }
    });
  });

  describe('Sync Code Generation & Rate Throttling Stress', () => {
    it('generates unique 6-digit codes across 500 simultaneous requests', () => {
      const codeSet = new Set<string>();
      const userCount = 500;

      for (let i = 0; i < userCount; i++) {
        const code = createSyncCode(`discord_user_${i}`, 'discord');
        expect(code).toMatch(/^\d{6}$/);
        codeSet.add(code);
      }

      // With 500 random 6-digit numbers (100,000..999,999), collisions are statistically tiny (< 0.1%),
      // and each user gets their own registered code
      expect(codeSet.size).toBeGreaterThanOrEqual(490);
    });

    it('enforces single pending code rule per user (subsequent requests overwrite old code)', () => {
      const userId = 'discord_rapid_sync_user';

      const code1 = createSyncCode(userId, 'discord');
      const code2 = createSyncCode(userId, 'discord');
      const code3 = createSyncCode(userId, 'discord');

      // Only the newest code (code3) should be claimable
      const claim1 = claimSyncCode(code1, 'fluxer_peer', 'fluxer');
      expect(claim1.success).toBe(false);

      const claim2 = claimSyncCode(code2, 'fluxer_peer', 'fluxer');
      expect(claim2.success).toBe(false);

      const claim3 = claimSyncCode(code3, 'fluxer_peer', 'fluxer');
      expect(claim3.success).toBe(true);
      expect(claim3.link?.discordId).toBe(userId);
      expect(claim3.link?.fluxerId).toBe('fluxer_peer');
    });

    it('expires and prunes pending codes after the configured lifetime', () => {
      const code = createSyncCode('discord_expiring_user', 'discord');

      // Advance time by 35 seconds (> 30s lifetime)
      vi.advanceTimersByTime(35000);
      pruneExpiredSyncCodes();

      // Claiming an expired code fails
      const claim = claimSyncCode(code, 'fluxer_late_user', 'fluxer');
      expect(claim.success).toBe(false);
      expect(claim.message).toContain('Invalid or expired');
    });

    it('prevents replay attacks / duplicate claims of the same code', () => {
      const code = createSyncCode('discord_single_use_user', 'discord');

      const claim1 = claimSyncCode(code, 'fluxer_first_claimer', 'fluxer');
      expect(claim1.success).toBe(true);

      const claim2 = claimSyncCode(code, 'fluxer_second_claimer', 'fluxer');
      expect(claim2.success).toBe(false);
    });
  });

  describe('Cloud Backup Chunking Buffer Stress', () => {
    it('chunks large binary buffers at exact boundary limits with 100% roundtrip integrity', () => {
      // Create a 17 MB buffer (spans across 3 chunks with 8MB max chunk size)
      const totalBytes = 17 * 1024 * 1024;
      const buffer = Buffer.alloc(totalBytes);
      for (let i = 0; i < totalBytes; i += 1024) {
        buffer.writeUInt32LE(i % 100000, i);
      }

      const chunkSize = 8 * 1024 * 1024; // 8 MB
      const chunks = chunkBuffer(buffer, chunkSize);

      expect(chunks).toHaveLength(3);
      expect(chunks[0]!.length).toBe(chunkSize);
      expect(chunks[1]!.length).toBe(chunkSize);
      expect(chunks[2]!.length).toBe(1 * 1024 * 1024);

      // Reassemble and verify exact byte parity
      const reassembled = Buffer.concat(chunks);
      expect(reassembled.equals(buffer)).toBe(true);
    });

    it('handles exact boundary size without creating spurious empty chunks', () => {
      const exact8Mb = 8 * 1024 * 1024;
      const buffer = Buffer.alloc(exact8Mb, 0xfa);

      const chunks = chunkBuffer(buffer, exact8Mb);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.length).toBe(exact8Mb);
    });

    it('handles single-byte overflow beyond boundary correctly', () => {
      const boundaryPlusOne = 8 * 1024 * 1024 + 1;
      const buffer = Buffer.alloc(boundaryPlusOne, 0xab);

      const chunks = chunkBuffer(buffer, 8 * 1024 * 1024);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]!.length).toBe(8 * 1024 * 1024);
      expect(chunks[1]!.length).toBe(1);
    });
  });
});
