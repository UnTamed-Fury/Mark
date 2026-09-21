import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger.js';

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

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AFK_FILE = path.join(DATA_DIR, 'afk.json');

// Memory cache:
// Global entries: key = `global:${userId}`
// Server entries: key = `server:${platform}:${guildId}:${userId}`
const afkStore = new Map<string, AfkUserEntry>();

// Anti-spam notification cooldown: key = `${targetUserId}:${channelId}`
const afkNotifyCooldowns = new Map<string, number>();
const NOTIFY_COOLDOWN_MS = 10_000;

export function loadAfkStore(): void {
  try {
    if (fs.existsSync(AFK_FILE)) {
      const data = fs.readFileSync(AFK_FILE, 'utf-8');
      const parsed: AfkUserEntry[] = JSON.parse(data);
      afkStore.clear();
      for (const entry of parsed) {
        const key = getStorageKey(entry.userId, entry.scope, entry.platform, entry.guildId);
        afkStore.set(key, entry);
      }
      log.info(`Loaded ${afkStore.size} AFK records from disk`);
    }
  } catch (error) {
    log.error('Failed to load AFK store from disk:', error);
  }
}

export function saveAfkStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(afkStore.values());
    fs.writeFileSync(AFK_FILE, JSON.stringify(list, null, 2), 'utf-8');
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
  // Clean any previous entries for this user in this scope or opposite scope
  if (scope === 'global') {
    // If setting global, remove all server entries for this user
    for (const [k, v] of afkStore.entries()) {
      if (v.userId === userId) {
        afkStore.delete(k);
      }
    }
  } else {
    // If setting server, remove any global entry for this user
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
  saveAfkStore();
  return entry;
}

export function getAfk(
  userId: string,
  platform: 'discord' | 'fluxer',
  guildId?: string | null,
): AfkUserEntry | null {
  // 1. Check global entry
  const globalEntry = afkStore.get(`global:${userId}`);
  if (globalEntry) {
    return globalEntry;
  }

  // 2. Check server entry
  if (guildId) {
    const serverKey = `server:${platform}:${guildId}:${userId}`;
    const serverEntry = afkStore.get(serverKey);
    if (serverEntry) {
      return serverEntry;
    }
  }

  return null;
}

export function clearAfk(
  userId: string,
  platform: 'discord' | 'fluxer',
  guildId?: string | null,
): AfkUserEntry | null {
  // Check if user is currently AFK
  const entry = getAfk(userId, platform, guildId);
  if (!entry) {
    return null;
  }

  const key = getStorageKey(entry.userId, entry.scope, entry.platform, entry.guildId);
  afkStore.delete(key);
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

export function getRelativeTimestamp(timestampMs: number): string {
  return `<t:${Math.floor(timestampMs / 1000)}:R>`;
}

export function clearAllAfk(): void {
  afkStore.clear();
  afkNotifyCooldowns.clear();
  try {
    if (fs.existsSync(AFK_FILE)) {
      fs.unlinkSync(AFK_FILE);
    }
  } catch {
    // Ignore unlink error
  }
}

// Initial load
loadAfkStore();

// Anti-spam cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of afkNotifyCooldowns.entries()) {
    if (now - timestamp > NOTIFY_COOLDOWN_MS * 2) {
      afkNotifyCooldowns.delete(key);
    }
  }
}, 60_000).unref();
