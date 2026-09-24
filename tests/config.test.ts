import { describe, it, expect } from 'vitest';
import { config } from '../src/config.js';

describe('Config Module', () => {
  it('loads default server and owner settings', () => {
    expect(config.ownerId).toBeDefined();
    expect(config.discordServerId).toBeDefined();
  });

  it('provides default timers and intervals', () => {
    expect(config.logFlushIntervalSec).toBeGreaterThan(0);
    expect(config.afkSummaryIntervalSec).toBeGreaterThan(0);
    expect(config.syncSummaryIntervalSec).toBeGreaterThan(0);
    expect(config.afkCleanupIntervalMin).toBeGreaterThan(0);
    expect(config.afkMentionCooldownSec).toBeGreaterThan(0);
    expect(config.syncCodeExpirySec).toBeGreaterThan(0);
  });

  it('provides default command cooldowns', () => {
    expect(config.sameChannelCooldownSec).toBe(15);
    expect(config.crossChannelCooldownSec).toBe(5);
  });

  it('provides default brand portal and sister site links', () => {
    expect(config.brandName).toBe('AnimeX');
    expect(config.websiteUrl).toContain('animex.one');
    expect(config.kissasianUrl).toContain('kissasian');
    expect(config.nineAnimeUrl).toContain('9anime');
    expect(typeof config.embedColor).toBe('number');
  });

  it('provides cloud backup and disaster recovery settings', () => {
    expect(typeof config.cloudBackupEnabled).toBe('boolean');
    expect(['discord', 'fluxer']).toContain(config.cloudBackupPlatform);
    expect(config.cloudBackupIntervalMin).toBeGreaterThanOrEqual(1);
    expect(typeof config.cloudBackupAutoRestore).toBe('boolean');
    expect(config.cloudBackupMaxPartSizeMb).toBeGreaterThanOrEqual(1);
  });
});

