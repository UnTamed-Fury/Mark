import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger.js';

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

import { config } from '../config.js';

function resolveDataDir(): string {
  if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    return process.env.DATA_DIR;
  }
  if (fs.existsSync('/data')) {
    return '/data';
  }
  return path.resolve(process.cwd(), 'data');
}

const DATA_DIR = resolveDataDir();
const SYNC_FILE = path.join(DATA_DIR, 'sync.json');
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

export function loadSyncStore(): void {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      const data = fs.readFileSync(SYNC_FILE, 'utf-8');
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
}

export function saveSyncStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(discordToLink.values());
    fs.writeFileSync(SYNC_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (error) {
    log.error('Failed to save sync store to disk:', error);
  }
}

export function createSyncCode(userId: string, platform: 'discord' | 'fluxer'): string {
  // Prune any existing pending code for this user
  for (const [code, pending] of pendingCodes.entries()) {
    if (pending.sourceUserId === userId && pending.sourcePlatform === platform) {
      pendingCodes.delete(code);
    }
  }

  // Generate 6-digit numeric code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
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

  recentSyncEvents.push({
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

  recentSyncEvents.push({
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
    if (fs.existsSync(SYNC_FILE)) {
      fs.unlinkSync(SYNC_FILE);
    }
  } catch {
    // Ignore error
  }
}

// Initial load
loadSyncStore();

// Code cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [code, pending] of pendingCodes.entries()) {
    if (now > pending.expiresAt) {
      pendingCodes.delete(code);
    }
  }
}, 10_000).unref();
