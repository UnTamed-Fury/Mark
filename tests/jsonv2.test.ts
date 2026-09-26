import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setAfk,
  getAfk,
  clearAllAfk,
  loadAfkStore,
  saveAfkStore,
} from '../src/core/afkManager.js';
import {
  linkUsersManually,
  clearAllSync,
  loadSyncStore,
  saveSyncStore,
  getAllLinks,
} from '../src/core/syncManager.js';
import { getAfkFilePath, getSyncFilePath, getDataDir } from '../src/core/dataDir.js';

describe('JSON v2 Data Architecture Test Suite', () => {
  beforeEach(() => {
    clearAllAfk();
    clearAllSync();
  });

  describe('sync.json v2 Specification & Migration', () => {
    it('saves sync.json in v2 structured format with stats and ISO timestamps', () => {
      linkUsersManually('1130510553266278501', '1475646107256324606');
      saveSyncStore();

      const filePath = getSyncFilePath();
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(raw.version).toBe('2.0.0');
      expect(typeof raw.updatedAt).toBe('string');
      expect(raw.stats.totalLinked).toBe(1);
      expect(Array.isArray(raw.links)).toBe(true);
      expect(raw.links[0].discordId).toBe('1130510553266278501');
      expect(raw.links[0].fluxerId).toBe('1475646107256324606');
      expect(typeof raw.links[0].linkedAtIso).toBe('string');
    });

    it('loads legacy v1 array format and seamlessly migrates to v2', () => {
      const filePath = getSyncFilePath();
      const legacyV1Data = [
        {
          discordId: '999111222',
          fluxerId: '888333444',
          linkedAt: 1700000000000,
        },
      ];
      fs.writeFileSync(filePath, JSON.stringify(legacyV1Data), 'utf-8');

      loadSyncStore();
      const links = getAllLinks();
      expect(links.some((l) => l.discordId === '999111222' && l.fluxerId === '888333444')).toBe(true);

      saveSyncStore();
      const migrated = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(migrated.version).toBe('2.0.0');
      expect(migrated.links.some((l: any) => l.discordId === '999111222')).toBe(true);
    });
  });

  describe('afk.json v2 Specification & Migration', () => {
    it('saves afk.json with global and server partitions and zero duplicate clones for synced users', () => {
      linkUsersManually('1130510553266278501', '1475646107256324606');

      setAfk('1130510553266278501', 'global', 'discord', null, null, 'Studying');
      saveAfkStore();

      const filePath = getAfkFilePath();
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      expect(raw.version).toBe('2.0.0');
      expect(raw.stats.totalActive).toBe(1);
      expect(raw.stats.globalCount).toBe(1);
      expect(raw.stats.serverCount).toBe(0);
      expect(raw.global.length).toBe(1);
      expect(raw.global[0].syncStatus).toBe('synced');
      expect(raw.global[0].accounts.discordId).toBe('1130510553266278501');
      expect(raw.global[0].accounts.fluxerId).toBe('1475646107256324606');
      expect(raw.global[0].reason).toBe('Studying');
      expect(typeof raw.global[0].startedAtIso).toBe('string');
    });

    it('loads legacy v1 AFK array format cleanly', () => {
      const filePath = getAfkFilePath();
      const legacyV1Data = [
        {
          userId: 'legacy_user_1',
          scope: 'global',
          platform: 'discord',
          guildId: null,
          guildName: null,
          reason: 'Legacy AFK',
          timestamp: 1700000000000,
        },
      ];
      fs.writeFileSync(filePath, JSON.stringify(legacyV1Data), 'utf-8');

      loadAfkStore();
      const entry = getAfk('legacy_user_1', 'discord');
      expect(entry).not.toBeNull();
      expect(entry?.reason).toBe('Legacy AFK');
    });

    it('handles the complex multi-user real-world scenario (4 syncs, 3 sync global, 2 sync server, 3 non-sync)', () => {
      // 1. Establish 4 Syncs
      linkUsersManually('1130510553266278501', '1475646107256324606'); // Sync 1: Fury
      linkUsersManually('1089274839201948573', '1540928374928174829'); // Sync 2: KuroDev
      linkUsersManually('928374650192837465', '1498273645192837465');  // Sync 3: Aria
      linkUsersManually('819283746501928374', '1487263548192837465');  // Sync 4: Zenith

      // 2. 3 Synced users using Global AFK
      setAfk('1130510553266278501', 'global', 'discord', '1320161905267970079', 'AnimeX™', 'fixing my pc');
      setAfk('1540928374928174829', 'global', 'fluxer', '1475654458820477346', 'AnimeX Fluxer', 'debugging kuro');
      setAfk('928374650192837465', 'global', 'discord', '1320161905267970079', 'AnimeX™', 'traveling');

      // 3. 2 Synced users using Server AFK (1 on Discord, 1 on Fluxer)
      // Zenith sets server AFK in Fury HQ on Discord
      setAfk('819283746501928374', 'server', 'discord', '1256614479836221532', 'Fury HQ', 'working on voice');
      // Zenith's linked account on Fluxer sets server AFK in AnimeX Fluxer
      setAfk('1487263548192837465', 'server', 'fluxer', '1475654458820477346', 'AnimeX Fluxer', 'lurking in fluxer');

      // 4. 3 Non-Synced users using AFK (2 on Discord diff servers, 1 on Fluxer)
      setAfk('1209384756102938475', 'server', 'discord', '1320161905267970079', 'AnimeX™', 'watching jjk s3');
      setAfk('1198273645102938472', 'server', 'discord', '1256614479836221532', 'Fury HQ', 'doing homework');
      setAfk('1552167756881727488', 'server', 'fluxer', '1475654458820477346', 'AnimeX Fluxer', 'eating dinner brb');

      // Save to disk in v2 format
      saveAfkStore();

      const raw = JSON.parse(fs.readFileSync(getAfkFilePath(), 'utf-8'));

      expect(raw.version).toBe('2.0.0');
      expect(raw.stats.totalActive).toBe(8);
      expect(raw.stats.globalCount).toBe(3);
      expect(raw.stats.serverCount).toBe(5);

      // Verify global entries are deduplicated and tagged "synced"
      expect(raw.global.length).toBe(3);
      expect(raw.global.every((g: any) => g.syncStatus === 'synced')).toBe(true);

      // Verify server entries contain both synced and unlinked users
      expect(raw.server.length).toBe(5);
      const syncedServer = raw.server.filter((s: any) => s.syncStatus === 'synced');
      const unlinkedServer = raw.server.filter((s: any) => s.syncStatus === 'unlinked');
      expect(syncedServer.length).toBe(2);
      expect(unlinkedServer.length).toBe(3);

      // Test that reloading the v2 file from disk reconstructs active in-memory lookups accurately
      const savedJson = fs.readFileSync(getAfkFilePath(), 'utf-8');
      clearAllAfk();
      fs.writeFileSync(getAfkFilePath(), savedJson, 'utf-8');
      loadAfkStore();

      // Check Fury on both Discord and Fluxer
      expect(getAfk('1130510553266278501', 'discord')?.reason).toBe('fixing my pc');
      expect(getAfk('1475646107256324606', 'fluxer')?.reason).toBe('fixing my pc');

      // Check Non-synced users
      expect(getAfk('1209384756102938475', 'discord', '1320161905267970079')?.reason).toBe('watching jjk s3');
      expect(getAfk('1552167756881727488', 'fluxer', '1475654458820477346')?.reason).toBe('eating dinner brb');
    });
  });
});
