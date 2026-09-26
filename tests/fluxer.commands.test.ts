import { describe, it, expect, vi } from 'vitest';
import type { Message } from '@fluxerjs/core';
import { COMMANDS, getFluxerCommand } from '../src/platforms/fluxer/commands.js';
import { FAQ_CATEGORIES } from '../src/constants.js';

function createMockFluxerMessage(content: string, authorId = '123456789'): {
  message: Message;
  replies: Array<{ embeds?: any[]; content?: string; allowedMentions?: any }>;
} {
  const replies: Array<{ embeds?: any[]; content?: string; allowedMentions?: any }> = [];

  const mockUser: any = {
    id: authorId,
    username: 'TestUser',
    displayName: 'TestUser',
    displayAvatarURL: () => 'https://example.com/avatar.png',
    send: vi.fn(async () => ({})),
  };

  const mockClient: any = {
    user: mockUser,
    ws: { ping: 55 },
  };

  const mockMessage: any = {
    content,
    author: mockUser,
    channelId: 'channel-123',
    client: mockClient,
    delete: vi.fn(async () => mockMessage),
    reply: vi.fn(async (options: any) => {
      replies.push(options);
      return mockMessage;
    }),
  };

  return {
    message: mockMessage as Message,
    replies,
  };
}

describe('Fluxer Commands Registry and Executors', () => {
  it('should register all expected commands', () => {
    const commandNames = COMMANDS.map((c) => c.name);
    expect(commandNames).toContain('website');
    expect(commandNames).toContain('drama');
    expect(commandNames).toContain('9anime');
    expect(commandNames).toContain('boost');
    expect(commandNames).toContain('rules');
    expect(commandNames).toContain('anime');
    expect(commandNames).toContain('ticket');
    expect(commandNames).toContain('download');
    expect(commandNames).toContain('ping');
    expect(commandNames).toContain('afk');
    expect(commandNames).toContain('sync');
    expect(commandNames).toContain('faq');
    expect(commandNames).toContain('help');
  });

  it('should resolve aliases correctly', () => {
    expect(getFluxerCommand('site')?.name).toBe('website');
    expect(getFluxerCommand('kissasian')?.name).toBe('drama');
    expect(getFluxerCommand('nineanime')?.name).toBe('9anime');
    expect(getFluxerCommand('brb')?.name).toBe('afk');
    expect(getFluxerCommand('link')?.name).toBe('sync');
    expect(getFluxerCommand('perks')?.name).toBe('boost');
    expect(getFluxerCommand('rule')?.name).toBe('rules');
    expect(getFluxerCommand('info')?.name).toBe('anime');
    expect(getFluxerCommand('support')?.name).toBe('ticket');
    expect(getFluxerCommand('dl')?.name).toBe('download');
    expect(getFluxerCommand('latency')?.name).toBe('ping');
    expect(getFluxerCommand('qna')?.name).toBe('faq');
    expect(getFluxerCommand('commands')?.name).toBe('help');
  });

  it('should execute website command and send branded embed', async () => {
    const { message, replies } = createMockFluxerMessage('+website');
    const cmd = getFluxerCommand('website');
    expect(cmd).not.toBeNull();

    await cmd!.execute(message, []);
    expect(replies).toHaveLength(1);
    expect(replies[0].embeds).toHaveLength(1);
    expect(replies[0].embeds![0].data.title).toContain('Official Website');
  });

  it('should execute ping command and report latency', async () => {
    const { message, replies } = createMockFluxerMessage('+ping');
    const cmd = getFluxerCommand('ping');
    expect(cmd).not.toBeNull();

    await cmd!.execute(message, []);
    expect(replies).toHaveLength(1);
    expect(replies[0].embeds![0].data.description).toContain('55ms');
  });

  it('should execute faq command with all categories', async () => {
    for (const category of FAQ_CATEGORIES) {
      const { message, replies } = createMockFluxerMessage(`+faq ${category}`);
      const cmd = getFluxerCommand('faq');
      await cmd!.execute(message, [category]);

      expect(replies).toHaveLength(1);
      expect(replies[0].embeds![0].data.title).toContain('FAQ');
    }
  });

  it('should execute faq index when no category is provided', async () => {
    const { message, replies } = createMockFluxerMessage('+faq');
    const cmd = getFluxerCommand('faq');
    await cmd!.execute(message, []);

    expect(replies).toHaveLength(1);
    expect(replies[0].embeds![0].data.title).toContain('FAQ Index');
  });

  it('should execute help command for all commands and index', async () => {
    const { message, replies } = createMockFluxerMessage('+help');
    const cmd = getFluxerCommand('help');
    await cmd!.execute(message, []);

    expect(replies).toHaveLength(1);
    expect(replies[0].embeds![0].data.title).toContain('Commands');

    const { message: msgDetail, replies: detailReplies } = createMockFluxerMessage('+help website');
    await cmd!.execute(msgDetail, ['website']);

    expect(detailReplies).toHaveLength(1);
    expect(detailReplies[0].embeds![0].data.title).toContain('Help • +website');
  });

  it('supports direct CLI afk scope (+afk global [reason])', async () => {
    const { message, replies } = createMockFluxerMessage('+afk global Studying for exams', 'afk-cli-user');
    const cmd = getFluxerCommand('afk');
    await cmd!.execute(message, ['global', 'Studying', 'for', 'exams']);

    expect(replies).toHaveLength(1);
    expect(replies[0].embeds![0].data.title).toContain('TestUser is now AFK');
    expect(replies[0].embeds![0].data.description).toContain('Studying for exams');
  });

  it('rejects unprivileged users from running backup command', async () => {
    const { message, replies } = createMockFluxerMessage('+backup', 'random-user-id');
    const cmd = getFluxerCommand('backup');
    await cmd!.execute(message, []);

    expect(replies).toHaveLength(1);
    expect(replies[0].embeds![0].data.title).toContain('Permission Denied');
  });

  it('allows owner to run backup status command', async () => {
    const { message, replies } = createMockFluxerMessage('+backup', '1475646107256324606');
    const cmd = getFluxerCommand('backup');
    await cmd!.execute(message, []);

    expect(replies).toHaveLength(1);
    expect(replies[0].embeds![0].data.title).toContain('Disaster Recovery');
  });
});
