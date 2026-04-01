import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField, EmbedBuilder } from 'discord.js';
import { addWhitelistedRole, removeWhitelistedRole, getWhitelistedRoles } from '../configManager';

export default {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage which roles can access limited bot commands')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => 
      sub.setName('add').setDescription('Allow a role to use the bot')
        .addRoleOption(opt => opt.setName('role').setDescription('The role to whitelist').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('remove').setDescription('Remove a role from the whitelist')
        .addRoleOption(opt => opt.setName('role').setDescription('The role to remove').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('list').setDescription('List all whitelisted roles')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return interaction.reply({ content: 'Must be used in a guild.', ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    const successEmbed = (msg: string) => new EmbedBuilder().setColor(0x00FF00).setDescription(`✅ ${msg}`);

    if (subcommand === 'add') {
      const role = interaction.options.getRole('role', true);
      addWhitelistedRole(role.id);
      return interaction.reply({ embeds: [successEmbed(`Role <@&${role.id}> has been whitelisted.`)] });
    }
    
    else if (subcommand === 'remove') {
      const role = interaction.options.getRole('role', true);
      removeWhitelistedRole(role.id);
      return interaction.reply({ embeds: [successEmbed(`Role <@&${role.id}> has been removed from the whitelist.`)] });
    }
    
    else if (subcommand === 'list') {
      const roles = getWhitelistedRoles();
      if (roles.length === 0) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x0000FF).setTitle('🛡️ Whitelisted Roles').setDescription('No roles are currently whitelisted.')] });
      }

      const description = roles.map(id => `• <@&${id}>`).join('\n');
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x0000FF).setTitle('🛡️ Whitelisted Roles').setDescription(description)] });
    }
  }
};
