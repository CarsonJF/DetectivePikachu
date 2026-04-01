import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField, Role } from 'discord.js';
import { scanMembers } from '../scanner';
import { sendBatchedWebhook } from '../webhookLogger';
import db from '../database';

export default {
  data: new SlashCommandBuilder()
    .setName('scan')
    .setDescription('Manually trigger a scan of members.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addSubcommand(sub => 
      sub.setName('all').setDescription('Scan all cached members in the server')
    )
    .addSubcommand(sub => 
      sub.setName('role').setDescription('Scan only members with a specific role')
        .addRoleOption(opt => opt.setName('target').setDescription('The role to scan').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('watchlist').setDescription('Scan only users currently on the watchlist')
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return interaction.reply({ content: 'Must be used in a guild.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'all' || subcommand === 'role') {
      await interaction.editReply(`Starting a massive deep-scan. This may take a while...`);
      let targetsScanned = 0;
      let lastId = '0';
      let keepFetching = true;
      const allFlags: any[] = [];
      const roleId = subcommand === 'role' ? interaction.options.getRole('target')?.id : null;

      while(keepFetching) {
        const members = await interaction.guild.members.list({ limit: 1000, after: lastId });
        if (members.size === 0) {
           keepFetching = false;
           break;
        }

        let chunk = Array.from(members.values());
        if (roleId) {
           chunk = chunk.filter(m => m.roles.cache.has(roleId));
        }
        
        targetsScanned += chunk.length;

        if (chunk.length > 0) {
            const flags = await scanMembers(chunk);
            if (flags.length > 0) allFlags.push(...flags);
        }

        for (const member of members.values()) {
           interaction.guild.members.cache.delete(member.id);
           interaction.client.users.cache.delete(member.id);
        }

        lastId = members.last()!.id;
        await new Promise(r => setTimeout(r, 100));
      }

      if (allFlags.length > 0) {
        await sendBatchedWebhook(allFlags);
        return interaction.editReply(`Scan complete! Checked ${targetsScanned} targets. Found **${allFlags.length}** violations. They have been logged to the webhook.`);
      } else {
        return interaction.editReply(`Scan complete! All **${targetsScanned}** targets are clean.`);
      }
    } else if (subcommand === 'watchlist') {
      const dbUsers = db.prepare('SELECT userId FROM watchlist').all() as { userId: string }[];
      if (dbUsers.length === 0) return interaction.editReply('Watchlist is empty.');

      let targetsScanned = 0;
      const allFlags: any[] = [];
      for (const row of dbUsers) {
        try {
          const member = await interaction.guild.members.fetch(row.userId);
          const flags = await scanMembers([member]);
          if (flags.length > 0) allFlags.push(...flags);
          
          interaction.guild.members.cache.delete(member.id);
          interaction.client.users.cache.delete(member.id);
          targetsScanned++;
        } catch (e) {
          // user left the server
        }
      }

      if (allFlags.length > 0) {
        await sendBatchedWebhook(allFlags);
        return interaction.editReply(`Scan complete! Checked ${targetsScanned} watchlist users. Found **${allFlags.length}** violations. They have been logged.`);
      } else {
        return interaction.editReply(`Scan complete! All **${targetsScanned}** watchlist targets are clean.`);
      }
    }
  }
};
