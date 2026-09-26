import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { createLogger } from './logger.js';
import { getDataDir, getAfkFilePath } from './dataDir.js';
import { getLinkedDiscordId, getLinkedFluxerId, migrateSyncStoreToV2, type MigrationResult } from './syncManager.js';

const log = createLogger('AfkManager');

export type AfkScope = 'global' | 'server';

export interface AfkUserEntry {
  readonly userId: string;
  readonly scope: AfkScope;
  readonly platform: 'discord' | 'fluxer';
  readonly guildId?: string | null;
  readonly guildName?: string | null;
  readonly reason: string;
  readonly timestamp: number;
}

export interface AfkActivityEvent {
  readonly userId: string;
  readonly platform: 'discord' | 'fluxer';
  readonly type: 'set' | 'cleared';
  readonly reason: string;
  readonly timestamp: number;
  readonly durationMs?: number;
  readonly scope?: AfkScope;
}

export type AfkEventListener = (event: AfkActivityEvent) => void;
const afkEventListeners = new Set<AfkEventListener>();

export function onAfkEvent(listener: AfkEventListener): () => void {
  afkEventListeners.add(listener);
  return () => afkEventListeners.delete(listener);
}

function emitAfkEvent(event: AfkActivityEvent): void {
  recentAfkEvents.push(event);
  for (const listener of afkEventListeners) {
    try {
      listener(event);
    } catch (err) {
      log.error('Error in afk event listener:', err);
    }
  }
}

// Memory cache:
// Global entries: key = `global:${userId}`
// Server entries: key = `server:${platform}:${guildId}:${userId}`
const afkStore = new Map<string, AfkUserEntry>();

// Anti-spam notification cooldown: key = `${targetUserId}:${channelId}`
const afkNotifyCooldowns = new Map<string, number>();
const NOTIFY_COOLDOWN_MS = (config.afkMentionCooldownSec || 10) * 1000;

// Recent AFK activity buffer (for 5-min batch logs)
const recentAfkEvents: AfkActivityEvent[] = [];

export interface GlobalAfkRecordV2 {
  readonly id: string;
  readonly syncStatus: 'synced' | 'unlinked';
  readonly accounts: {
    readonly discordId: string | null;
    readonly fluxerId: string | null;
  };
  readonly reason: string;
  readonly origin: {
    readonly platform: 'discord' | 'fluxer';
    readonly guildId: string | null;
    readonly guildName: string | null;
  };
  readonly startedAt: number;
  readonly startedAtIso: string;
}

export interface ServerAfkRecordV2 {
  readonly id: string;
  readonly syncStatus: 'synced' | 'unlinked';
  readonly accounts: {
    readonly discordId: string | null;
    readonly fluxerId: string | null;
  };
  readonly platform: 'discord' | 'fluxer';
  readonly guildId: string;
  readonly guildName: string;
  readonly reason: string;
  readonly startedAt: number;
  readonly startedAtIso: string;
}

export interface AfkStoreDocumentV2 {
  readonly version: string;
  readonly updatedAt: string;
  readonly stats: {
    readonly totalActive: number;
    readonly globalCount: number;
    readonly serverCount: number;
  };
  readonly global: GlobalAfkRecordV2[];
  readonly server: ServerAfkRecordV2[];
}

export function loadAfkStore(): void {
  try {
    const filePath = getAfkFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      afkStore.clear();

      let isLegacyV1 = false;
      if (Array.isArray(parsed)) {
        // Legacy v1 format
        isLegacyV1 = true;
        for (const entry of parsed) {
          if (!entry || !entry.userId) continue;
          const key = getStorageKey(entry.userId, entry.scope || 'global', entry.platform || 'discord', entry.guildId);
          afkStore.set(key, entry);
        }
      } else if (parsed && typeof parsed === 'object') {
        // v2 format with global & server partitions
        if (Array.isArray(parsed.global)) {
          for (const item of parsed.global) {
            const reason = item.reason || 'AFK';
            const timestamp = Number(item.startedAt) || Date.now();
            const originGuildId = item.origin?.guildId || null;
            const originGuildName = item.origin?.guildName || null;

            if (item.accounts?.discordId) {
              const dEntry: AfkUserEntry = {
                userId: String(item.accounts.discordId),
                scope: 'global',
                platform: 'discord',
                guildId: originGuildId,
                guildName: originGuildName,
                reason,
                timestamp,
              };
              afkStore.set(`global:${dEntry.userId}`, dEntry);
            }

            if (item.accounts?.fluxerId) {
              const fEntry: AfkUserEntry = {
                userId: String(item.accounts.fluxerId),
                scope: 'global',
                platform: 'fluxer',
                guildId: item.origin?.platform === 'fluxer' ? originGuildId : null,
                guildName: item.origin?.platform === 'fluxer' ? originGuildName : null,
                reason,
                timestamp,
              };
              afkStore.set(`global:${fEntry.userId}`, fEntry);
            }
          }
        }

        if (Array.isArray(parsed.server)) {
          for (const item of parsed.server) {
            const platform: 'discord' | 'fluxer' = item.platform === 'fluxer' ? 'fluxer' : 'discord';
            const userId = String(
              platform === 'discord'
                ? item.accounts?.discordId || item.userId || ''
                : item.accounts?.fluxerId || item.userId || ''
            );
            if (!userId) continue;

            const entry: AfkUserEntry = {
              userId,
              scope: 'server',
              platform,
              guildId: item.guildId || 'unknown_guild',
              guildName: item.guildName || null,
              reason: item.reason || 'AFK',
              timestamp: Number(item.startedAt) || Date.now(),
            };
            const key = getStorageKey(entry.userId, 'server', entry.platform, entry.guildId);
            afkStore.set(key, entry);
          }
        }

        // Support flat records array if present
        if (Array.isArray(parsed.records)) {
          for (const r of parsed.records) {
            if (!r || !r.userId) continue;
            const key = getStorageKey(r.userId, r.scope || 'global', r.platform || 'discord', r.guildId);
            afkStore.set(key, r);
          }
        }
      }

      log.info(`Loaded ${afkStore.size} active AFK records from disk`);

      if (isLegacyV1) {
        log.info(`Auto-migrating legacy v1 afk.json to v2 format (${afkStore.size} records)...`);
        saveAfkStore();
        log.info('Successfully auto-migrated afk.json to v2 format on disk');
      }
    }
  } catch (error) {
    log.error('Failed to load AFK store from disk:', error);
  }
}

export function saveAfkStore(): void {
  try {
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = getAfkFilePath();

    const globalRecords: GlobalAfkRecordV2[] = [];
    const serverRecords: ServerAfkRecordV2[] = [];
    const processedGlobalUserIds = new Set<string>();

    for (const entry of afkStore.values()) {
      if (entry.scope === 'global') {
        if (processedGlobalUserIds.has(entry.userId)) {
          continue;
        }

        const linkedDiscord = entry.platform === 'fluxer' ? getLinkedDiscordId(entry.userId) : null;
        const linkedFluxer = entry.platform === 'discord' ? getLinkedFluxerId(entry.userId) : null;

        const discordId = entry.platform === 'discord' ? entry.userId : (linkedDiscord || null);
        const fluxerId = entry.platform === 'fluxer' ? entry.userId : (linkedFluxer || null);

        processedGlobalUserIds.add(entry.userId);
        if (discordId) processedGlobalUserIds.add(discordId);
        if (fluxerId) processedGlobalUserIds.add(fluxerId);

        const isSynced = Boolean(discordId && fluxerId);
        const primaryId = discordId || fluxerId || entry.userId;

        globalRecords.push({
          id: `afk_global_${primaryId}`,
          syncStatus: isSynced ? 'synced' : 'unlinked',
          accounts: {
            discordId: discordId || null,
            fluxerId: fluxerId || null,
          },
          reason: entry.reason,
          origin: {
            platform: entry.platform,
            guildId: entry.guildId || null,
            guildName: entry.guildName || null,
          },
          startedAt: entry.timestamp,
          startedAtIso: new Date(entry.timestamp).toISOString(),
        });
      } else {
        // Server AFK
        const linkedDiscord = entry.platform === 'fluxer' ? getLinkedDiscordId(entry.userId) : null;
        const linkedFluxer = entry.platform === 'discord' ? getLinkedFluxerId(entry.userId) : null;

        const discordId = entry.platform === 'discord' ? entry.userId : (linkedDiscord || null);
        const fluxerId = entry.platform === 'fluxer' ? entry.userId : (linkedFluxer || null);
        const isSynced = Boolean(discordId && fluxerId);
        const targetGuildId = entry.guildId || 'unknown_guild';
        const targetGuildName = entry.guildName || (entry.platform === 'discord' ? 'Discord Server' : 'Fluxer Guild');

        serverRecords.push({
          id: `afk_server_${entry.userId}_${targetGuildId}`,
          syncStatus: isSynced ? 'synced' : 'unlinked',
          accounts: {
            discordId: discordId || null,
            fluxerId: fluxerId || null,
          },
          platform: entry.platform,
          guildId: targetGuildId,
          guildName: targetGuildName,
          reason: entry.reason,
          startedAt: entry.timestamp,
          startedAtIso: new Date(entry.timestamp).toISOString(),
        });
      }
    }

    const document: AfkStoreDocumentV2 = {
      version: '2.0.0',
      updatedAt: new Date().toISOString(),
      stats: {
        totalActive: globalRecords.length + serverRecords.length,
        globalCount: globalRecords.length,
        serverCount: serverRecords.length,
      },
      global: globalRecords,
      server: serverRecords,
    };

    const tempFile = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(document, null, 2), 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    log.error('Failed to save AFK store to disk:', error);
  }
}

function getStorageKey(userId: string, scope: AfkScope, platform: 'discord' | 'fluxer', guildId?: string | null): string {
  if (scope === 'global') {
    return `global:${userId}`;
  }
  return `server:${platform}:${guildId ?? 'dm'}:${userId}`;
}

export function setAfk(
  userId: string,
  scope: AfkScope,
  platform: 'discord' | 'fluxer',
  guildId: string | null | undefined,
  guildName: string | null | undefined,
  reason: string,
  timestamp: number = Date.now(),
): AfkUserEntry {
  // Clean any previous entries for this user
  if (scope === 'global') {
    for (const [k, v] of afkStore.entries()) {
      if (v.userId === userId) {
        afkStore.delete(k);
      }
    }
  } else {
    afkStore.delete(`global:${userId}`);
  }

  const entry: AfkUserEntry = {
    userId,
    scope,
    platform,
    guildId: guildId ?? null,
    guildName: guildName ?? null,
    reason: reason.trim() || 'AFK',
    timestamp,
  };

  const key = getStorageKey(userId, scope, platform, guildId);
  afkStore.set(key, entry);

  // If global AFK and user has a linked account on the other platform, mirror global AFK
  if (scope === 'global') {
    const linkedId = platform === 'discord' ? getLinkedFluxerId(userId) : getLinkedDiscordId(userId);
    const otherPlatform = platform === 'discord' ? 'fluxer' : 'discord';
    if (linkedId) {
      const mirroredEntry: AfkUserEntry = {
        userId: linkedId,
        scope: 'global',
        platform: otherPlatform,
        guildId: null,
        guildName: null,
        reason: entry.reason,
        timestamp,
      };
      afkStore.set(`global:${linkedId}`, mirroredEntry);
    }
  }

  emitAfkEvent({
    userId,
    platform,
    type: 'set',
    reason: entry.reason,
    timestamp,
    scope,
  });

  saveAfkStore();
  return entry;
}

export function getAfk(
  userId: string,
  platform: 'discord' | 'fluxer',
  guildId?: string | null,
): AfkUserEntry | null {
  // 1. Check direct global entry
  const globalEntry = afkStore.get(`global:${userId}`);
  if (globalEntry) {
    return globalEntry;
  }

  // 2. Check linked account global entry
  const linkedId = getLinkedFluxerId(userId) || getLinkedDiscordId(userId);
  if (linkedId) {
    const linkedGlobal = afkStore.get(`global:${linkedId}`);
    if (linkedGlobal) {
      return linkedGlobal;
    }
  }

  // 3. Check server entry
  if (guildId) {
    const serverKey = `server:${platform}:${guildId}:${userId}`;
    const serverEntry = afkStore.get(serverKey);
    if (serverEntry) {
      return serverEntry;
    }
  }

  return null;
}

export function isAfk(
  userId: string,
  platform: 'discord' | 'fluxer',
  guildId?: string | null,
): boolean {
  return getAfk(userId, platform, guildId) !== null;
}

export function clearAfk(
  userId: string,
  platform: 'discord' | 'fluxer',
  guildId?: string | null,
): AfkUserEntry | null {
  const entry = getAfk(userId, platform, guildId);
  if (!entry) {
    return null;
  }

  const key = getStorageKey(entry.userId, entry.scope, entry.platform, entry.guildId);
  afkStore.delete(key);
  afkStore.delete(`global:${userId}`);

  // If it was global, also clear linked account if present
  if (entry.scope === 'global') {
    const linkedId = getLinkedFluxerId(userId) || getLinkedDiscordId(userId);
    if (linkedId) {
      afkStore.delete(`global:${linkedId}`);
    }
  }

  const now = Date.now();
  const durationMs = now - entry.timestamp;

  emitAfkEvent({
    userId,
    platform,
    type: 'cleared',
    reason: entry.reason,
    timestamp: now,
    durationMs,
    scope: entry.scope,
  });

  saveAfkStore();
  return entry;
}

export function canNotifyAfk(targetUserId: string, channelId: string): boolean {
  const key = `${targetUserId}:${channelId}`;
  const now = Date.now();
  const lastTime = afkNotifyCooldowns.get(key) ?? 0;
  return now - lastTime >= NOTIFY_COOLDOWN_MS;
}

export function recordAfkNotification(targetUserId: string, channelId: string): void {
  const key = `${targetUserId}:${channelId}`;
  afkNotifyCooldowns.set(key, Date.now());
}

export function drainRecentAfkEvents(): AfkActivityEvent[] {
  return recentAfkEvents.splice(0, recentAfkEvents.length);
}

export function getActiveAfkList(): readonly AfkUserEntry[] {
  return Array.from(afkStore.values());
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) {
    return `${hours}h ${remMinutes}m`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

export function getRelativeTimestamp(timestampMs: number, platform: 'discord' | 'fluxer' = 'discord'): string {
  if (platform === 'fluxer') {
    const elapsed = Math.max(0, Date.now() - timestampMs);
    return `${formatDuration(elapsed)} ago`;
  }
  return `<t:${Math.floor(timestampMs / 1000)}:R>`;
}

export function purgeHistoricalData(): void {
  // Purges temporary buffers and old anti-spam throttle entries
  const now = Date.now();
  for (const [key, timestamp] of afkNotifyCooldowns.entries()) {
    if (now - timestamp > NOTIFY_COOLDOWN_MS * 2) {
      afkNotifyCooldowns.delete(key);
    }
  }
  // Trim recent events buffer if not drained
  if (recentAfkEvents.length > 500) {
    recentAfkEvents.splice(0, recentAfkEvents.length - 100);
  }
  saveAfkStore();
  log.info(`Pruned historical AFK temporary data. Active AFKs: ${afkStore.size}`);
}

export function clearAllAfk(): void {
  afkStore.clear();
  afkNotifyCooldowns.clear();
  recentAfkEvents.length = 0;
  try {
    const filePath = getAfkFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore unlink error
  }
}

export function migrateAfkStoreToV2(options: { backup?: boolean; filePath?: string } = {}): MigrationResult {
  const filePath = options.filePath || getAfkFilePath();
  if (!fs.existsSync(filePath)) {
    return { migrated: false, totalRecords: 0 };
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  let parsed: any;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return { migrated: false, totalRecords: 0 };
  }

  const isV1Array = Array.isArray(parsed);
  const isV2 =
    parsed &&
    typeof parsed === 'object' &&
    parsed.version === '2.0.0' &&
    Array.isArray(parsed.global) &&
    Array.isArray(parsed.server);

  if (!isV1Array && isV2) {
    return { migrated: false, totalRecords: parsed.global.length + parsed.server.length };
  }

  let backupPath: string | undefined;
  if (options.backup !== false) {
    backupPath = `${filePath}.v1.bak.${Date.now()}`;
    fs.writeFileSync(backupPath, rawData, 'utf-8');
  }

  loadAfkStore();
  saveAfkStore();

  return {
    migrated: true,
    totalRecords: afkStore.size,
    backupPath,
  };
}

export function migrateStoresToV2(options: { backup?: boolean } = {}): {
  sync: MigrationResult;
  afk: MigrationResult;
} {
  const sync = migrateSyncStoreToV2(options);
  const afk = migrateAfkStoreToV2(options);
  return { sync, afk };
}

// Initial load
loadAfkStore();

// Regular cleanup cycle to prevent data bloat
setInterval(() => {
  purgeHistoricalData();
}, (config.afkCleanupIntervalMin || 30) * 60_000).unref();
