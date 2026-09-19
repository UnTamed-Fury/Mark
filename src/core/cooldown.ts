import { config } from '../config.js';
import { SERVER } from '../constants.js';
import type { CooldownCheckResult } from '../types/index.js';

const SAME_CHANNEL_COOLDOWN_MS = 15_000;
const CROSS_CHANNEL_COOLDOWN_MS = 5_000;

const lastUserExecution = new Map<string, number>();
const lastUserChannelExecution = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of lastUserChannelExecution.entries()) {
    if (now - timestamp > SAME_CHANNEL_COOLDOWN_MS * 2) {
      lastUserChannelExecution.delete(key);
    }
  }
  for (const [userId, timestamp] of lastUserExecution.entries()) {
    if (now - timestamp > SAME_CHANNEL_COOLDOWN_MS * 2) {
      lastUserExecution.delete(userId);
    }
  }
}, 60_000).unref();

export function checkCooldown(userId: string, channelId: string): CooldownCheckResult {
  if (userId === config.ownerId || userId === SERVER.developerId) {
    return { onCooldown: false, cooldownUntilMs: 0 };
  }

  const now = Date.now();
  const lastGlobal = lastUserExecution.get(userId);
  const lastChannel = lastUserChannelExecution.get(`${userId}:${channelId}`);

  if (!lastGlobal && !lastChannel) {
    return { onCooldown: false, cooldownUntilMs: 0 };
  }

  const globalUntil = lastGlobal ? lastGlobal + CROSS_CHANNEL_COOLDOWN_MS : 0;
  const channelUntil = lastChannel ? lastChannel + SAME_CHANNEL_COOLDOWN_MS : 0;

  const cooldownUntilMs = Math.max(globalUntil, channelUntil);

  if (now < cooldownUntilMs) {
    return { onCooldown: true, cooldownUntilMs };
  }

  return { onCooldown: false, cooldownUntilMs: 0 };
}

export function recordCommandExecution(userId: string, channelId: string): void {
  const now = Date.now();
  lastUserExecution.set(userId, now);
  lastUserChannelExecution.set(`${userId}:${channelId}`, now);
}

export function clearCooldowns(): void {
  lastUserExecution.clear();
  lastUserChannelExecution.clear();
}
