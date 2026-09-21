import { config } from '../config.js';
import { SERVER } from '../constants.js';
import type { CooldownCheckResult } from '../types/index.js';

const getSameChannelCooldownMs = () => (config.sameChannelCooldownSec || 15) * 1000;
const getCrossChannelCooldownMs = () => (config.crossChannelCooldownSec || 5) * 1000;

const lastUserExecution = new Map<string, number>();
const lastUserChannelExecution = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  const maxCooldown = Math.max(getSameChannelCooldownMs(), getCrossChannelCooldownMs()) * 2;
  for (const [key, timestamp] of lastUserChannelExecution.entries()) {
    if (now - timestamp > maxCooldown) {
      lastUserChannelExecution.delete(key);
    }
  }
  for (const [userId, timestamp] of lastUserExecution.entries()) {
    if (now - timestamp > maxCooldown) {
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

  const globalUntil = lastGlobal ? lastGlobal + getCrossChannelCooldownMs() : 0;
  const channelUntil = lastChannel ? lastChannel + getSameChannelCooldownMs() : 0;

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
