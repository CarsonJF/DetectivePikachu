import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField, AttachmentBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('debuguser')
    .setDescription('Dump the raw API payload for a user to find their Guild/Clan tags')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addUserOption(opt => opt.setName('target').setDescription('The user to debug').setRequired(true)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser('target', true);
    await interaction.deferReply({ ephemeral: true });
    
    try {
      // Use the discord.js REST manager to bypass the cache and fetch RAW payloads
      const rawUser = await interaction.client.rest.get(`/users/${target.id}`) as any;
      
      let rawMember = null;
      if (interaction.guild) {
        rawMember = await interaction.client.rest.get(`/guilds/${interaction.guild.id}/members/${target.id}`).catch(() => null) as any;
      }
      
      const payload = {
        api_user: rawUser,
        api_member: rawMember,
      };

      const buffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: `debug_${target.id}.json` });

      await interaction.editReply({ 
        content: `Here is the completely raw, unfiltered API dump for <@${target.id}>.\\nCheck the attached JSON file to look for \`identity_guild_id\`, \`identity_enabled\`, and \`tag\` inside it!`,
        files: [attachment] 
      });
    } catch (e: any) {
      await interaction.editReply(`Failed to fetch raw API data: ${e.message}`);
    }
  }
};
