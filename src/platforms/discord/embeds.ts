import { EmbedBuilder, type Message } from 'discord.js';
import { BRAND } from '../../constants.js';

export function createBrandEmbed(message?: Message): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRAND.color)
    .setFooter({ text: BRAND.footer })
    .setTimestamp();

  if (message?.client.user) {
    embed.setAuthor({
      name: message.client.user.displayName || message.client.user.username,
      iconURL: message.client.user.displayAvatarURL(),
    });
  }

  return embed;
}

export async function sendEmbed(message: Message, embed: EmbedBuilder): Promise<Message> {
  return message.reply({
    embeds: [embed],
    allowedMentions: {
      repliedUser: false,
      parse: [],
      users: [],
      roles: [],
    },
  });
}

