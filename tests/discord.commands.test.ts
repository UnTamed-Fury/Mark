import { describe, it, expect, vi } from 'vitest';
import type { Message, User, Client } from 'discord.js';
import { COMMANDS, getDiscordCommand } from '../src/platforms/discord/commands.js';
import { FAQ_CATEGORIES } from '../src/constants.js';

function createMockDiscordMessage(content: string, authorId = '123456789'): {
  message: Message;
  replies: Array<{ embeds?: any[]; content?: string; allowedMentions?: any }>;
} {
  const replies: Array<{ embeds?: any[]; content?: string; allowedMentions?: any }> = [];

  const mockUser: Partial<User> = {
    id: authorId,
    username: 'TestUser',
    displayName: 'TestUser',
    displayAvatarURL: () => 'https://example.com/avatar.png',
  };

  const mockClient: Partial<Client> = {
    user: mockUser as User,
    ws: { ping: 42 } as any,
  };

  const mockMessage: Partial<Message> = {
    content,
    author: mockUser as User,
    channelId: 'channel-123',
    client: mockClient as Client,
    reply: vi.fn(async (options: any) => {
      replies.push(options);
      return mockMessage as Message;
    }),
  };

  return {
    message: mockMessage as Message,
    replies,
  };
}

describe('Discord Commands Registry and Executors', () => {
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
    expect(commandNames).toContain('faq');
    expect(commandNames).toContain('help');
  });

  it('should resolve aliases correctly', () => {
    expect(getDiscordCommand('site')?.name).toBe('website');
    expect(getDiscordCommand('kissasian')?.name).toBe('drama');
    expect(getDiscordCommand('nineanime')?.name).toBe('9anime');
    expect(getDiscordCommand('brb')?.name).toBe('afk');
    expect(getDiscordCommand('perks')?.name).toBe('boost');
    expect(getDiscordCommand('rule')?.name).toBe('rules');
    expect(getDiscordCommand('info')?.name).toBe('anime');
    expect(getDiscordCommand('support')?.name).toBe('ticket');
    expect(getDiscordCommand('dl')?.name).toBe('download');
    expect(getDiscordCommand('latency')?.name).toBe('ping');
    expect(getDiscordCommand('qna')?.name).toBe('faq');
    expect(getDiscordCommand('commands')?.name).toBe('help');
  });

  it('should execute website command and send branded embed', async () => {
    const { message, replies } = createMockDiscordMessage('+website');
    const cmd = getDiscordCommand('website');
    expect(cmd).not.toBeNull();

    await cmd!.execute(message, []);
    expect(replies).toHaveLength(1);
    expect(replies[0].embeds).toHaveLength(1);
    expect(replies[0].embeds![0].data.title).toContain('Official Website');
  });

  it('should execute ping command and report latency', async () => {
    const { message, replies } = createMockDiscordMessage('+ping');
    const cmd = getDiscordCommand('ping');
    expect(cmd).not.toBeNull();

    await cmd!.execute(message, []);
    expect(replies).toHaveLength(1);
    expect(replies[0].embeds![0].data.description).toContain('42ms');
  });

  it('should execute faq command with all categories', async () => {
    for (const category of FAQ_CATEGORIES) {
      const { message, replies } = createMockDiscordMessage(`+faq ${category}`);
      const cmd = getDiscordCommand('faq');
      await cmd!.execute(message, [category]);

      expect(replies).toHaveLength(1);
      expect(replies[0].embeds![0].data.title).toContain('FAQ');
    }
  });

  it('should execute faq index when no category is provided', async () => {
    const { message, replies } = createMockDiscordMessage('+faq');
    const cmd = getDiscordCommand('faq');
    await cmd!.execute(message, []);

    expect(replies).toHaveLength(1);
    expect(replies[0].embeds![0].data.title).toContain('FAQ Index');
  });

  it('should execute help command for all commands and index', async () => {
    const { message, replies } = createMockDiscordMessage('+help');
    const cmd = getDiscordCommand('help');
    await cmd!.execute(message, []);

    expect(replies).toHaveLength(1);
    expect(replies[0].embeds![0].data.title).toContain('Commands');

    const { message: msgDetail, replies: detailReplies } = createMockDiscordMessage('+help website');
    await cmd!.execute(msgDetail, ['website']);

    expect(detailReplies).toHaveLength(1);
    expect(detailReplies[0].embeds![0].data.title).toContain('Help • +website');
  });
});
