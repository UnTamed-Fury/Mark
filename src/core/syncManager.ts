import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from '../config.js';
import { createLogger } from './logger.js';
import { getDataDir, getSyncFilePath } from './dataDir.js';

const log = createLogger('SyncManager');

export interface UserLink {
  readonly discordId: string;
  readonly fluxerId: string;
  readonly linkedAt: number;
}

export interface SyncEvent {
  readonly discordId: string;
  readonly fluxerId: string;
  readonly timestamp: number;
  readonly type: 'link' | 'unlink';
}

interface PendingSyncCode {
  readonly code: string;
  readonly sourcePlatform: 'discord' | 'fluxer';
  readonly sourceUserId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

const CODE_LIFETIME_MS = (config.syncCodeExpirySec || 30) * 1000; // Configurable (default 30s)

// Maps:
// discordId -> UserLink
const discordToLink = new Map<string, UserLink>();
// fluxerId -> UserLink
const fluxerToLink = new Map<string, UserLink>();

// Pending codes: code -> PendingSyncCode
const pendingCodes = new Map<string, PendingSyncCode>();

// Recent sync events (for 5-min batch logs)
const recentSyncEvents: SyncEvent[] = [];

export type SyncEventListener = (event: SyncEvent) => void;
const syncEventListeners = new Set<SyncEventListener>();

export function onSyncEvent(listener: SyncEventListener): () => void {
  syncEventListeners.add(listener);
  return () => syncEventListeners.delete(listener);
}

function emitSyncEvent(event: SyncEvent): void {
  recentSyncEvents.push(event);
  for (const listener of syncEventListeners) {
    try {
      listener(event);
    } catch (err) {
      log.error('Error in sync event listener:', err);
    }
  }
}

export function loadSyncStore(): void {
  try {
    const filePath = getSyncFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed: UserLink[] = JSON.parse(data);
      discordToLink.clear();
      fluxerToLink.clear();
      for (const link of parsed) {
        discordToLink.set(link.discordId, link);
        fluxerToLink.set(link.fluxerId, link);
      }
      log.info(`Loaded ${discordToLink.size} account links from disk`);
    }
  } catch (error) {
    log.error('Failed to load sync store from disk:', error);
  }

  // Ensure known owner account link for Fury is established
  if (!discordToLink.has('1130510553266278501')) {
    const furyLink: UserLink = {
      discordId: '1130510553266278501',
      fluxerId: '1475646107256324606',
      linkedAt: 1758760653000,
    };
    discordToLink.set(furyLink.discordId, furyLink);
    fluxerToLink.set(furyLink.fluxerId, furyLink);
    saveSyncStore();
    log.info(`Ensured account link for Fury (${furyLink.discordId} <-> ${furyLink.fluxerId})`);
  }
}

export function saveSyncStore(): void {
  try {
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = getSyncFilePath();
    const list = Array.from(discordToLink.values());
    const tempFile = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (error) {
    log.error('Failed to save sync store to disk:', error);
  }
}

export function pruneExpiredSyncCodes(): void {
  const now = Date.now();
  for (const [code, pending] of pendingCodes.entries()) {
    if (now > pending.expiresAt) {
      pendingCodes.delete(code);
    }
  }
}

export function createSyncCode(userId: string, platform: 'discord' | 'fluxer'): string {
  // Prune any expired pending codes
  pruneExpiredSyncCodes();

  // Prune any existing pending code for this specific user
  for (const [code, pending] of pendingCodes.entries()) {
    if (pending.sourceUserId === userId && pending.sourcePlatform === platform) {
      pendingCodes.delete(code);
    }
  }

  // Generate cryptographically secure 6-digit numeric code
  const code = crypto.randomInt(100000, 1000000).toString();
  const now = Date.now();

  pendingCodes.set(code, {
    code,
    sourcePlatform: platform,
    sourceUserId: userId,
    createdAt: now,
    expiresAt: now + CODE_LIFETIME_MS,
  });

  return code;
}

export function claimSyncCode(
  code: string,
  targetUserId: string,
  targetPlatform: 'discord' | 'fluxer',
): { success: boolean; message: string; link?: UserLink } {
  const cleanCode = code.trim();
  const pending = pendingCodes.get(cleanCode);

  if (!pending) {
    return { success: false, message: 'Invalid or expired sync code. Please generate a new code.' };
  }

  if (Date.now() > pending.expiresAt) {
    pendingCodes.delete(cleanCode);
    return { success: false, message: 'Sync code has expired (30s limit). Please generate a new code.' };
  }

  if (pending.sourcePlatform === targetPlatform) {
    return {
      success: false,
      message: `You cannot link two accounts on ${targetPlatform}. Please generate the code on one platform and redeem it on the other.`,
    };
  }

  const discordId = pending.sourcePlatform === 'discord' ? pending.sourceUserId : targetUserId;
  const fluxerId = pending.sourcePlatform === 'fluxer' ? pending.sourceUserId : targetUserId;

  const link: UserLink = {
    discordId,
    fluxerId,
    linkedAt: Date.now(),
  };

  // Remove any previous links for either account
  const oldDiscordLink = discordToLink.get(discordId);
  if (oldDiscordLink) {
    fluxerToLink.delete(oldDiscordLink.fluxerId);
  }
  const oldFluxerLink = fluxerToLink.get(fluxerId);
  if (oldFluxerLink) {
    discordToLink.delete(oldFluxerLink.discordId);
  }

  discordToLink.set(discordId, link);
  fluxerToLink.set(fluxerId, link);
  pendingCodes.delete(cleanCode);

  emitSyncEvent({
    discordId,
    fluxerId,
    timestamp: Date.now(),
    type: 'link',
  });

  saveSyncStore();
  log.info(`Linked Discord (${discordId}) with Fluxer (${fluxerId})`);

  return {
    success: true,
    message: 'Accounts successfully linked! Your global AFK status is now synchronized across Discord and Fluxer.',
    link,
  };
}

export function getLinkedFluxerId(discordId: string): string | null {
  return discordToLink.get(discordId)?.fluxerId ?? null;
}

export function getLinkedDiscordId(fluxerId: string): string | null {
  return fluxerToLink.get(fluxerId)?.discordId ?? null;
}

export function getLinkForUser(userId: string): UserLink | null {
  return discordToLink.get(userId) || fluxerToLink.get(userId) || null;
}

export function unlinkUser(userId: string, platform: 'discord' | 'fluxer'): boolean {
  const link = platform === 'discord' ? discordToLink.get(userId) : fluxerToLink.get(userId);
  if (!link) return false;

  discordToLink.delete(link.discordId);
  fluxerToLink.delete(link.fluxerId);

  emitSyncEvent({
    discordId: link.discordId,
    fluxerId: link.fluxerId,
    timestamp: Date.now(),
    type: 'unlink',
  });

  saveSyncStore();
  log.info(`Unlinked Discord (${link.discordId}) and Fluxer (${link.fluxerId})`);
  return true;
}

export function drainRecentSyncEvents(): SyncEvent[] {
  return recentSyncEvents.splice(0, recentSyncEvents.length);
}

export function getAllLinks(): readonly UserLink[] {
  return Array.from(discordToLink.values());
}

export function clearAllSync(): void {
  discordToLink.clear();
  fluxerToLink.clear();
  pendingCodes.clear();
  recentSyncEvents.length = 0;
  try {
    const filePath = getSyncFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore error
  }
}

export function linkUsersManually(discordId: string, fluxerId: string): UserLink {
  const link: UserLink = {
    discordId,
    fluxerId,
    linkedAt: Date.now(),
  };
  discordToLink.set(discordId, link);
  fluxerToLink.set(fluxerId, link);
  saveSyncStore();
  emitSyncEvent({
    discordId,
    fluxerId,
    timestamp: Date.now(),
    type: 'link',
  });
  log.info(`Manually linked Discord (${discordId}) with Fluxer (${fluxerId})`);
  return link;
}

// Initial load
loadSyncStore();

// Code cleanup interval
setInterval(pruneExpiredSyncCodes, 10_000).unref();

// Auto-dispatch cloud backup on account link / unlink
onSyncEvent((event) => {
  import('./cloudBackup.js')
    .then(({ performCloudBackup }) => {
      performCloudBackup(`sync_${event.type}_${event.discordId}`).catch(() => {});
    })
    .catch(() => {});
});

