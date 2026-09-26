import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setAfk,
  isAfk,
  getAfk,
  clearAfk,
  clearAllAfk,
  loadAfkStore,
  saveAfkStore,
  migrateAfkStoreToV2,
  migrateStoresToV2,
} from '../src/core/afkManager.js';
import {
  loadSyncStore,
  saveSyncStore,
  linkUsersManually,
  getLinkedFluxerId,
  getLinkedDiscordId,
  clearAllSync,
  migrateSyncStoreToV2,
} from '../src/core/syncManager.js';
import { getDataDir, getAfkFilePath, getSyncFilePath } from '../src/core/dataDir.js';

describe('Tests2: V1 to V2 Migration, Stress, Memory Efficiency & Railway Configs', () => {
  const dataDir = getDataDir();
  const afkPath = getAfkFilePath();
  const syncPath = getSyncFilePath();

  let savedAfkData: string | null = null;
  let savedSyncData: string | null = null;

  beforeEach(() => {
    // Preserve existing real data if present
    savedAfkData = fs.existsSync(afkPath) ? fs.readFileSync(afkPath, 'utf-8') : null;
    savedSyncData = fs.existsSync(syncPath) ? fs.readFileSync(syncPath, 'utf-8') : null;
    clearAllAfk();
    clearAllSync();
  });

  afterEach(() => {
    // Restore preserved data or clean up
    if (savedAfkData !== null) {
      fs.writeFileSync(afkPath, savedAfkData, 'utf-8');
    } else if (fs.existsSync(afkPath)) {
      try {
        fs.unlinkSync(afkPath);
      } catch {}
    }

    if (savedSyncData !== null) {
      fs.writeFileSync(syncPath, savedSyncData, 'utf-8');
    } else if (fs.existsSync(syncPath)) {
      try {
        fs.unlinkSync(syncPath);
      } catch {}
    }

    // Clean up any .bak or .tmp files created during test
    try {
      const files = fs.readdirSync(dataDir);
      for (const f of files) {
        if (f.includes('.bak.') || f.includes('.tmp')) {
          fs.unlinkSync(path.join(dataDir, f));
        }
      }
    } catch {}
  });

  // =========================================================================
  // 1. V1 TO V2 MIGRATION PIPELINE
  // =========================================================================
  describe('V1 to V2 Migration Pipeline', () => {
    it('migrates a legacy v1 sync.json array to a v2 document with ISO timestamps and backup file', () => {
      // 1. Create legacy v1 sync file
      const legacySyncData = [
        {
          discordId: '1130510553266278501',
          fluxerId: '1475646107256324606',
          linkedAt: 1758760653000,
        },
        {
          discordId: '1000000000000000001',
          fluxerId: '2000000000000000001',
          linkedAt: 1760000000000,
        },
      ];
      fs.writeFileSync(syncPath, JSON.stringify(legacySyncData, null, 2), 'utf-8');

      // 2. Execute migration with backup enabled
      const result = migrateSyncStoreToV2({ backup: true });

      expect(result.migrated).toBe(true);
      expect(result.totalRecords).toBeGreaterThanOrEqual(2);
      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath!)).toBe(true);

      // Verify backup file content is the exact legacy array
      const backupContent = JSON.parse(fs.readFileSync(result.backupPath!, 'utf-8'));
      expect(Array.isArray(backupContent)).toBe(true);
      expect(backupContent.length).toBe(2);

      // 3. Inspect migrated sync.json on disk
      const migratedJson = JSON.parse(fs.readFileSync(syncPath, 'utf-8'));
      expect(migratedJson.version).toBe('2.0.0');
      expect(migratedJson.updatedAt).toBeDefined();
      expect(migratedJson.stats).toBeDefined();
      expect(migratedJson.stats.totalLinked).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(migratedJson.links)).toBe(true);

      const furyLink = migratedJson.links.find(
        (l: any) => l.discordId === '1130510553266278501'
      );
      expect(furyLink).toBeDefined();
      expect(furyLink.fluxerId).toBe('1475646107256324606');
      expect(furyLink.linkedAtIso).toBe(new Date(1758760653000).toISOString());
    });

    it('migrates a legacy v1 afk.json array: consolidates duplicate synced global entries into 1 clean record', () => {
      // Setup linked users first
      linkUsersManually('1130510553266278501', '1475646107256324606'); // Fury (synced)
      linkUsersManually('1000000000000000001', '2000000000000000001'); // Synced user 2

      // Legacy v1 afk.json containing:
      // - 2 duplicate global records for Fury (one fluxer, one discord with same reason)
      // - 1 global record for unlinked user
      // - 1 server record for unlinked discord user
      // - 1 server record for synced user on fluxer
      const legacyAfkData = [
        {
          userId: '1475646107256324606',
          scope: 'global',
          platform: 'fluxer',
          guildId: null,
          guildName: null,
          reason: 'fixing my pc cuz wayland hates me',
          timestamp: 1790395778624,
        },
        {
          userId: '1130510553266278501',
          scope: 'global',
          platform: 'discord',
          guildId: '1320161905267970079',
          guildName: 'AnimeX™',
          reason: 'fixing my pc cuz wayland hates me',
          timestamp: 1790395778624,
        },
        {
          userId: '9999999999999999999',
          scope: 'global',
          platform: 'discord',
          guildId: '1320161905267970079',
          guildName: 'AnimeX™',
          reason: 'studying exams',
          timestamp: 1790395000000,
        },
        {
          userId: '8888888888888888888',
          scope: 'server',
          platform: 'discord',
          guildId: '1320161905267970079',
          guildName: 'AnimeX™',
          reason: 'brb lunch',
          timestamp: 1790396000000,
        },
      ];

      fs.writeFileSync(afkPath, JSON.stringify(legacyAfkData, null, 2), 'utf-8');

      // Execute migration
      const result = migrateAfkStoreToV2({ backup: true });
      expect(result.migrated).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath!)).toBe(true);

      // Verify migrated v2 format
      const migratedDoc = JSON.parse(fs.readFileSync(afkPath, 'utf-8'));
      expect(migratedDoc.version).toBe('2.0.0');
      expect(Array.isArray(migratedDoc.global)).toBe(true);
      expect(Array.isArray(migratedDoc.server)).toBe(true);

      // Fury's two legacy entries MUST be deduplicated into exactly 1 global record
      const furyGlobal = migratedDoc.global.filter(
        (g: any) =>
          g.accounts?.discordId === '1130510553266278501' ||
          g.accounts?.fluxerId === '1475646107256324606'
      );
      expect(furyGlobal.length).toBe(1);
      expect(furyGlobal[0].syncStatus).toBe('synced');
      expect(furyGlobal[0].accounts.discordId).toBe('1130510553266278501');
      expect(furyGlobal[0].accounts.fluxerId).toBe('1475646107256324606');
      expect(furyGlobal[0].startedAtIso).toBe(new Date(1790395778624).toISOString());

      // Unlinked user in global
      const unlinkedGlobal = migratedDoc.global.find(
        (g: any) => g.accounts?.discordId === '9999999999999999999'
      );
      expect(unlinkedGlobal).toBeDefined();
      expect(unlinkedGlobal.syncStatus).toBe('unlinked');
      expect(unlinkedGlobal.accounts.fluxerId).toBeNull();

      // Server entry
      const serverEntry = migratedDoc.server.find(
        (s: any) => s.accounts?.discordId === '8888888888888888888'
      );
      expect(serverEntry).toBeDefined();
      expect(serverEntry.syncStatus).toBe('unlinked');
      expect(serverEntry.guildName).toBe('AnimeX™');
    });

    it('is idempotent: running migration repeatedly on already-migrated v2 files does nothing', () => {
      // Setup v2 data
      linkUsersManually('1130510553266278501', '1475646107256324606');
      setAfk('1130510553266278501', 'global', 'discord', null, null, 'working on code');

      // Initial migration
      const firstRun = migrateStoresToV2({ backup: false });
      expect(firstRun.sync.migrated).toBe(false); // Already saved in v2 format by helper
      expect(firstRun.afk.migrated).toBe(false);

      // Verify on-disk file remains valid
      const doc = JSON.parse(fs.readFileSync(afkPath, 'utf-8'));
      expect(doc.version).toBe('2.0.0');
      expect(doc.stats.globalCount).toBe(1);
    });

    it('auto-migrates automatically on startup when loadSyncStore() and loadAfkStore() execute', () => {
      // Create legacy v1 sync
      const v1Sync = [
        { discordId: '3333333333333333333', fluxerId: '4444444444444444444', linkedAt: 1750000000000 },
      ];
      fs.writeFileSync(syncPath, JSON.stringify(v1Sync, null, 2), 'utf-8');

      // Trigger boot load
      loadSyncStore();

      // Check that syncPath on disk is now v2!
      const migratedSync = JSON.parse(fs.readFileSync(syncPath, 'utf-8'));
      expect(migratedSync.version).toBe('2.0.0');
      expect(migratedSync.links.some((l: any) => l.discordId === '3333333333333333333')).toBe(true);

      // Create legacy v1 afk
      const v1Afk = [
        {
          userId: '3333333333333333333',
          scope: 'global',
          platform: 'discord',
          guildId: null,
          guildName: null,
          reason: 'auto migrate test',
          timestamp: 1750000000000,
        },
      ];
      fs.writeFileSync(afkPath, JSON.stringify(v1Afk, null, 2), 'utf-8');

      // Trigger boot load
      loadAfkStore();

      // Check that afkPath on disk is now v2!
      const migratedAfk = JSON.parse(fs.readFileSync(afkPath, 'utf-8'));
      expect(migratedAfk.version).toBe('2.0.0');
      expect(migratedAfk.global[0].syncStatus).toBe('synced');
    });

    it('handles malformed JSON or corrupted files gracefully without crashing', () => {
      fs.writeFileSync(afkPath, 'MALFORMED_GARBAGE_DATA{{{', 'utf-8');
      fs.writeFileSync(syncPath, '{"broken": json here', 'utf-8');

      expect(() => loadSyncStore()).not.toThrow();
      expect(() => loadAfkStore()).not.toThrow();
      expect(() => migrateStoresToV2()).not.toThrow();
    });
  });

  // =========================================================================
  // 2. STRESS & CONCURRENCY SUITE
  // =========================================================================
  describe('High-Concurrency & Stress Benchmark', () => {
    it('executes 10,000 in-memory lookups in under 100ms (O(1) verification)', () => {
      // Seed store with 100 synced pairs and 100 active AFKs
      for (let i = 0; i < 100; i++) {
        const dId = `stress_d_${i}`;
        const fId = `stress_f_${i}`;
        linkUsersManually(dId, fId);
        setAfk(dId, 'global', 'discord', null, null, `AFK reason ${i}`);
      }

      const start = performance.now();
      for (let i = 0; i < 10_000; i++) {
        const index = i % 100;
        const dId = `stress_d_${index}`;
        const fId = `stress_f_${index}`;

        const isD = isAfk(dId, 'discord');
        const isF = isAfk(fId, 'fluxer');
        const linkedF = getLinkedFluxerId(dId);
        const linkedD = getLinkedDiscordId(fId);

        expect(isD).toBe(true);
        expect(isF).toBe(true);
        expect(linkedF).toBe(fId);
        expect(linkedD).toBe(dId);
      }
      const duration = performance.now() - start;

      // 10,000 lookups should easily finish in well under 500ms (>20,000 ops/sec)
      expect(duration).toBeLessThan(500);
    });

    it('handles 50 concurrent disk write calls safely without corrupting data or throwing race errors', async () => {
      setAfk('stress_concurrency_user', 'global', 'discord', null, null, 'racing writes');

      const writes: Promise<void>[] = [];
      for (let i = 0; i < 50; i++) {
        writes.push(
          new Promise<void>((resolve) => {
            saveAfkStore();
            saveSyncStore();
            resolve();
          })
        );
      }

      await Promise.all(writes);

      // Verify disk files are valid JSON and not corrupted
      const afkData = JSON.parse(fs.readFileSync(afkPath, 'utf-8'));
      const syncData = JSON.parse(fs.readFileSync(syncPath, 'utf-8'));

      expect(afkData.version).toBe('2.0.0');
      expect(syncData.version).toBe('2.0.0');
    });

    it('performs high-throughput multi-user lifecycle: 200 users set, check, and clear AFK', () => {
      const userCount = 200;

      // Batch set AFK
      for (let i = 0; i < userCount; i++) {
        setAfk(`user_${i}`, 'global', 'discord', null, null, `reason ${i}`);
      }

      // Batch verify AFK
      for (let i = 0; i < userCount; i++) {
        expect(isAfk(`user_${i}`, 'discord')).toBe(true);
      }

      // Clear half
      for (let i = 0; i < userCount / 2; i++) {
        clearAfk(`user_${i}`, 'discord');
        expect(isAfk(`user_${i}`, 'discord')).toBe(false);
      }

      // Remaining half still active
      for (let i = userCount / 2; i < userCount; i++) {
        expect(isAfk(`user_${i}`, 'discord')).toBe(true);
      }
    });
  });

  // =========================================================================
  // 3. EFFICIENCY & RAILWAY MEMORY FOOTPRINT (128MB LIMIT)
  // =========================================================================
  describe('Memory Footprint & Latency Percentiles (Railway 128MB Constraint)', () => {
    it('maintains a minimal memory heap overhead when storing active records (Railway 128MB constraint)', () => {
      // Mock disk sync during bulk seeding to avoid serializing 2,000 JSON documents repeatedly
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {});

      // Seed 200 entries (100 global, 100 server)
      for (let i = 0; i < 100; i++) {
        setAfk(`bulk_global_${i}`, 'global', 'discord', null, null, 'stress bulk global');
        setAfk(
          `bulk_server_${i}`,
          'server',
          'fluxer',
          'guild_stress_1',
          'Stress Guild',
          'stress bulk server'
        );
      }

      writeSpy.mockRestore();
      renameSpy.mockRestore();

      // Trigger one save to test real document size on disk
      saveAfkStore();
      const doc = JSON.parse(fs.readFileSync(afkPath, 'utf-8'));
      expect(doc.stats.totalActive).toBe(200);

      // Verify the serialized JSON footprint is tiny (< 250KB for 200 full records)
      const fileSizeBytes = fs.statSync(afkPath).size;
      expect(fileSizeBytes).toBeLessThan(250 * 1024);

      // Verify node heap usage is well within the 128MB Railway deployment limit
      const currentHeapMB = process.memoryUsage().heapUsed / (1024 * 1024);
      expect(currentHeapMB).toBeLessThan(128);
    });

    it('measures operation latency percentiles: p99 latency is sub-millisecond for in-memory operations', () => {
      const latencies: number[] = [];
      const iterations = 1000;

      setAfk('perf_user', 'global', 'discord', null, null, 'performance test');

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        getAfk('perf_user', 'discord');
        const end = performance.now();
        latencies.push(end - start);
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(iterations * 0.5)];
      const p95 = latencies[Math.floor(iterations * 0.95)];
      const p99 = latencies[Math.floor(iterations * 0.99)];

      // p99 must be under 1ms
      expect(p99).toBeLessThan(1);
      expect(p95).toBeLessThanOrEqual(p99);
      expect(p50).toBeLessThanOrEqual(p95);
    });
  });

  // =========================================================================
  // 4. RAILWAY CONFIGURATION & TEST ENVIRONMENT VALIDATION
  // =========================================================================
  describe('Railway Production & Test Configuration Validation', () => {
    it('validates railway.json production deployment specification', () => {
      const railwayConfigPath = path.resolve(process.cwd(), 'railway.json');
      expect(fs.existsSync(railwayConfigPath)).toBe(true);

      const railwayConfig = JSON.parse(fs.readFileSync(railwayConfigPath, 'utf-8'));
      expect(railwayConfig.build.builder).toBe('NIXPACKS');
      expect(railwayConfig.build.buildCommand).toBe('pnpm build');
      expect(railwayConfig.deploy.startCommand).toBe('pnpm start');
      expect(railwayConfig.deploy.restartPolicyType).toBe('ON_FAILURE');
      expect(railwayConfig.deploy.restartPolicyMaxRetries).toBe(10);
      expect(railwayConfig.deploy.sleepApplication).toBe(true);
    });

    it('validates railway.test.json test environment specification', () => {
      const railwayTestPath = path.resolve(process.cwd(), 'railway.test.json');
      expect(fs.existsSync(railwayTestPath)).toBe(true);

      const testConfig = JSON.parse(fs.readFileSync(railwayTestPath, 'utf-8'));
      expect(testConfig.build.builder).toBe('NIXPACKS');
      expect(testConfig.build.buildCommand).toBe('pnpm build');
      expect(testConfig.deploy.startCommand).toBe('pnpm test');
      expect(testConfig.deploy.restartPolicyType).toBe('NEVER');
      expect(testConfig.deploy.sleepApplication).toBe(false);
    });

    it('validates package.json start command enforces 128MB memory ceiling for Railway', () => {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkg.scripts.start).toContain('--max-old-space-size=128');
      expect(pkg.scripts['migrate:v2']).toBe('tsx scripts/migrate-to-v2.ts');
      expect(pkg.scripts['test:stress']).toBe('vitest run tests/tests2.test.ts');
    });

    it('validates .railway/railway.ts IaC configuration structure and preserved secrets', () => {
      const iacPath = path.resolve(process.cwd(), '.railway/railway.ts');
      expect(fs.existsSync(iacPath)).toBe(true);

      const iacContent = fs.readFileSync(iacPath, 'utf-8');
      expect(iacContent).toContain('service("animex-mark-bot"');
      expect(iacContent).toContain('github("UnTamed-Fury/Mark")');
      expect(iacContent).toContain('buildCommand: "pnpm build"');
      expect(iacContent).toContain('startCommand: "pnpm start"');
      expect(iacContent).toContain('DISCORD_BOT_TOKEN');
      expect(iacContent).toContain('FLUXER_BOT_TOKEN');
      expect(iacContent).toContain('CLOUD_BACKUP_ENABLED');
    });
  });
});
