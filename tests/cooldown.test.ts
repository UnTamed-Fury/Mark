import { describe, it, expect, beforeEach } from 'vitest';
import { SERVER } from '../src/constants.js';
import { checkCooldown, recordCommandExecution, clearCooldowns } from '../src/core/cooldown.js';

describe('Cooldown Management Engine', () => {
  const regularUserId = '999999999999999999';
  const channelA = '111111111111111111';
  const channelB = '222222222222222222';

  beforeEach(() => {
    clearCooldowns();
  });

  it('should not be on cooldown initially', () => {
    const result = checkCooldown(regularUserId, channelA);
    expect(result.onCooldown).toBe(false);
  });

  it('should enforce 15s same-channel cooldown after execution', () => {
    recordCommandExecution(regularUserId, channelA);

    const result = checkCooldown(regularUserId, channelA);
    expect(result.onCooldown).toBe(true);
    expect(result.cooldownUntilMs).toBeGreaterThan(Date.now());
  });

  it('should enforce 5s cross-channel cooldown after execution', () => {
    recordCommandExecution(regularUserId, channelA);

    const result = checkCooldown(regularUserId, channelB);
    expect(result.onCooldown).toBe(true);
    expect(result.cooldownUntilMs).toBeGreaterThan(Date.now());
  });

  it('should completely bypass cooldown for developer (VIP override)', () => {
    recordCommandExecution(SERVER.developerId, channelA);

    const result = checkCooldown(SERVER.developerId, channelA);
    expect(result.onCooldown).toBe(false);
    expect(result.cooldownUntilMs).toBe(0);
  });

  it('should completely bypass cooldown for owner (VIP override)', () => {
    recordCommandExecution(SERVER.ownerId, channelA);

    const result = checkCooldown(SERVER.ownerId, channelA);
    expect(result.onCooldown).toBe(false);
    expect(result.cooldownUntilMs).toBe(0);
  });
});
