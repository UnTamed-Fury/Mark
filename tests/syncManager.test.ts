import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSyncCode,
  claimSyncCode,
  getLinkedFluxerId,
  getLinkedDiscordId,
  getLinkForUser,
  drainRecentSyncEvents,
  clearAllSync,
} from '../src/core/syncManager.js';

describe('Sync Manager', () => {
  beforeEach(() => {
    clearAllSync();
  });

  afterEach(() => {
    clearAllSync();
  });

  it('generates a 6-digit sync code', () => {
    const code = createSyncCode('discord-user-1', 'discord');
    expect(code).toMatch(/^\d{6}$/);
  });

  it('links Discord account to Fluxer account using valid code', () => {
    const code = createSyncCode('discord-user-2', 'discord');
    const result = claimSyncCode(code, 'fluxer-user-2', 'fluxer');

    expect(result.success).toBe(true);
    expect(getLinkedFluxerId('discord-user-2')).toBe('fluxer-user-2');
    expect(getLinkedDiscordId('fluxer-user-2')).toBe('discord-user-2');
    expect(getLinkForUser('discord-user-2')?.fluxerId).toBe('fluxer-user-2');
  });

  it('links Fluxer account to Discord account using valid code', () => {
    const code = createSyncCode('fluxer-user-3', 'fluxer');
    const result = claimSyncCode(code, 'discord-user-3', 'discord');

    expect(result.success).toBe(true);
    expect(getLinkedFluxerId('discord-user-3')).toBe('fluxer-user-3');
    expect(getLinkedDiscordId('fluxer-user-3')).toBe('discord-user-3');
  });

  it('rejects claiming on the same platform', () => {
    const code = createSyncCode('discord-user-4', 'discord');
    const result = claimSyncCode(code, 'discord-user-5', 'discord');

    expect(result.success).toBe(false);
    expect(result.message).toContain('cannot link two accounts');
  });

  it('rejects invalid code', () => {
    const result = claimSyncCode('000000', 'fluxer-user-6', 'fluxer');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid or expired');
  });

  it('records and drains recent sync events', () => {
    const code = createSyncCode('discord-user-7', 'discord');
    claimSyncCode(code, 'fluxer-user-7', 'fluxer');

    const events = drainRecentSyncEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.discordId).toBe('discord-user-7');
    expect(events[0]?.fluxerId).toBe('fluxer-user-7');

    // Subsequent drain should be empty
    expect(drainRecentSyncEvents().length).toBe(0);
  });
});
