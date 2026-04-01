import { WebhookClient, EmbedBuilder } from 'discord.js';

import { getWebhookUrl, getLogFormat } from './configManager';

let webhookClient: WebhookClient | null = null;
let currentUrl: string | null = null;

export function initWebhook() {
  const url = getWebhookUrl();
  if (!url) {
    webhookClient = null;
    currentUrl = null;
    return;
  }
  if (url !== currentUrl) {
    webhookClient = new WebhookClient({ url });
    currentUrl = url;
  }
}

export type FlaggedItem = {
  userId: string;
  tag: string;
  reason: string;
  pattern: string;
};

export async function sendBatchedWebhook(flaggedItems: FlaggedItem[]) {
  initWebhook(); // Reload config actively before sending
  if (!webhookClient || flaggedItems.length === 0) return;

  // Group users by the rule pattern that caught them
  const grouped = new Map<string, string[]>();
  for (const item of flaggedItems) {
    const key = `Hit: ${item.pattern} (${item.reason})`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(`<@${item.userId}>`);
  }

  const format = getLogFormat();

  if (format === 'TEXT') {
    let currentMessage = '🚨 **Detective Pikachu Report**\n\n';
    
    for (const [key, users] of grouped.entries()) {
      let block = `**${key}**\n${users.join(', ')}\n\n`;
      
      if (currentMessage.length + block.length > 1900) {
        try {
          await webhookClient.send({ content: currentMessage });
          await new Promise(r => setTimeout(r, 1000)); // Rate limit buffer
        } catch (e) {
          console.error('Failed to send text webhook:', e);
        }
        currentMessage = '🚨 **(Continued)**\n\n' + block;
      } else {
        currentMessage += block;
      }
    }
    
    if (currentMessage.trim().length > 0 && currentMessage !== '🚨 **(Continued)**\n\n' && currentMessage !== '🚨 **Detective Pikachu Report**\n\n') {
      try {
         await webhookClient.send({ content: currentMessage });
      } catch (e) {
         console.error('Failed to send text webhook:', e);
      }
    }
  } else {
    const embeds: EmbedBuilder[] = [];
    let currentEmbed = new EmbedBuilder().setColor(0xff0000).setTitle('🚨 Detective Pikachu Report').setTimestamp();
    let fieldCount = 0;

    for (const [key, users] of grouped.entries()) {
      if (fieldCount === 25) {
        embeds.push(currentEmbed);
        currentEmbed = new EmbedBuilder().setColor(0xff0000).setTitle('🚨 Detective Pikachu Report (Continued)').setTimestamp();
        fieldCount = 0;
      }

      let userString = users.join(', '); // Comma separated to save space instead of newlines
      if (userString.length > 1024) userString = userString.substring(0, 1020) + '...';

      currentEmbed.addFields({
        name: key,
        value: userString,
        inline: false
      });
      fieldCount++;
    }
    
    if (fieldCount > 0) {
      embeds.push(currentEmbed);
    }

    // Chunk embeds into groups of 10 maximum per message
    for (let i = 0; i < embeds.length; i += 10) {
      const chunk = embeds.slice(i, i + 10);
      try {
        await webhookClient.send({ embeds: chunk });
        if (i + 10 < embeds.length) {
            await new Promise(r => setTimeout(r, 1000)); // Rate limit buffer
        }
      } catch (e) {
        console.error('Failed to send embed webhook chunk:', e);
      }
    }
  }
}
