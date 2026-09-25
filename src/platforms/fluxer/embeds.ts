import { EmbedBuilder, type Message } from '@fluxerjs/core';
import { BRAND } from '../../constants.js';

export function createFluxerBrandEmbed(message?: Message): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND.color)
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  if (message?.client.user) {
    const avatarUrl =
      typeof message.client.user.displayAvatarURL === 'function'
        ? message.client.user.displayAvatarURL()
        : undefined;

    embed.setAuthor({
      name: message.client.user.username,
      iconURL: avatarUrl,
    });
  }

  return embed;
}

export async function sendFluxerEmbed(message: Message, embed: EmbedBuilder): Promise<Message> {
  const options = {
    embeds: [embed],
    allowedMentions: {
      repliedUser: false,
      parse: [],
    },
  };

  if (message.channel && typeof message.channel.send === 'function') {
    try {
      return await message.channel.send(options);
    } catch {
      // Fallback to reply if channel.send fails
    }
  }

  return message.reply(options);
}
