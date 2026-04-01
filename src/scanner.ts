import db from './database';
import { GuildMember } from 'discord.js';
import { FlaggedItem } from './webhookLogger';
import { clanTagCache } from './index';

export type BlacklistRule = {
  pattern: string;
  type: string;
  isRegex: number;
};

export function evalRules(member: GuildMember, rules: BlacklistRule[]): FlaggedItem[] {
  const flags: FlaggedItem[] = [];
  // Retrieve their intercepted Clan/Guild Tag perfectly offline using our cache
  const guildTag = clanTagCache.get(member.id) || '';

  const activities = member.presence?.activities || [];
  const activityTexts = activities.map(a => `${a.name} ${a.state || ''} ${a.details || ''}`).join(' | ');

  for (const rule of rules) {
    const isRegex = rule.isRegex === 1;
    let rx: RegExp | null = null;
    if (isRegex) {
      try { rx = new RegExp(rule.pattern, 'i'); } catch (e) { continue; }
    }

    if (rule.type === 'guild_tag' && guildTag) {
      const isMatch = isRegex ? rx?.test(guildTag) : guildTag.toLowerCase().includes(rule.pattern.toLowerCase());
      if (isMatch) {
        flags.push({
          userId: member.user.id,
          tag: member.user.tag,
          reason: 'Guild Tag',
          pattern: rule.pattern
        });
      }
    }

    if (rule.type === 'activity' && activityTexts.length > 0) {
      const isMatch = isRegex ? rx?.test(activityTexts) : activityTexts.toLowerCase().includes(rule.pattern.toLowerCase());
      if (isMatch) {
        flags.push({
          userId: member.user.id,
          tag: member.user.tag,
          reason: 'Suspicious Activity',
          pattern: rule.pattern
        });
      }
    }
  }
  return flags;
}

export async function scanMembers(members: GuildMember[] | IterableIterator<GuildMember>): Promise<FlaggedItem[]> {
  const rules = db.prepare('SELECT * FROM blacklist_rules').all() as BlacklistRule[];

  const flaggedItems: FlaggedItem[] = [];
  let count = 0;
  for (const member of members) {
    const flags = evalRules(member, rules);
    if (flags.length > 0) {
      flaggedItems.push(...flags);
    }
    
    count++;
    if (count % 500 === 0) {
      await new Promise(r => setImmediate(r)); // Yield the event loop to keep the bot responsive
    }
  }
  return flaggedItems;
}
