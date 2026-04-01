import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField, User, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import db from '../database';

export default {
  data: new SlashCommandBuilder()
    .setName('watchlist')
    .setDescription('Manage the persistent watchlist.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => 
      sub.setName('add').setDescription('Add a user to the watchlist')
        .addUserOption(opt => opt.setName('user').setDescription('The user to add').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('remove').setDescription('Remove a user from the watchlist')
        .addUserOption(opt => opt.setName('user').setDescription('The user to remove').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('list').setDescription('List all current waitlist users')
    ),
    
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    const successEmbed = (msg: string) => new EmbedBuilder().setColor(0x00FF00).setDescription(`✅ ${msg}`);
    const errorEmbed = (msg: string) => new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ ${msg}`);

    if (subcommand === 'add') {
      const user = interaction.options.getUser('user', true) as User;
      try {
        db.prepare('INSERT INTO watchlist (userId) VALUES (?)').run(user.id);
        return interaction.reply({ embeds: [successEmbed(`Successfully added <@${user.id}> to the watchlist.`)] });
      } catch (e: any) {
        if (e.message.includes('UNIQUE')) {
          return interaction.reply({ embeds: [errorEmbed(`User <@${user.id}> is already on the watchlist!`)], ephemeral: true });
        }
        return interaction.reply({ embeds: [errorEmbed('An error occurred adding user to database.')], ephemeral: true });
      }
    } 
    
    else if (subcommand === 'remove') {
      const user = interaction.options.getUser('user', true) as User;
      const result = db.prepare('DELETE FROM watchlist WHERE userId = ?').run(user.id);
      if (result.changes > 0) {
        return interaction.reply({ embeds: [successEmbed(`Successfully removed <@${user.id}> from the watchlist.`)] });
      } else {
        return interaction.reply({ embeds: [errorEmbed(`<@${user.id}> was not on the watchlist.`)], ephemeral: true });
      }
    }
    
    else if (subcommand === 'list') {
      const users = db.prepare('SELECT userId FROM watchlist').all() as { userId: string }[];
      if (users.length === 0) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x0000FF).setTitle('👀 Watchlist').setDescription('The watchlist is empty.')], ephemeral: true });
      
      await interaction.deferReply({ ephemeral: true });

      const ITEMS_PER_PAGE = 15;
      const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);
      let currentPage = 0;

      const generateEmbed = (page: number) => {
        const start = page * ITEMS_PER_PAGE;
        const currentUsers = users.slice(start, start + ITEMS_PER_PAGE);
        const description = currentUsers.map(u => `> 👤 <@${u.userId}>`).join('\n');
        
        return new EmbedBuilder()
          .setColor(0x0000FF)
          .setTitle('👀 Active Watchlist')
          .setDescription(description)
          .setFooter({ text: `Page ${page + 1} of ${totalPages}  |  Total Users: ${users.length}` });
      };

      const getButtons = (page: number) => {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
           new ButtonBuilder()
            .setCustomId('prev_page')
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('next_page')
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1)
        );
      };

      const embed = generateEmbed(0);
      const row = getButtons(0);

      const message = await interaction.editReply({ 
        embeds: [embed], 
        components: totalPages > 1 ? [row] : [] 
      });

      if (totalPages > 1) {
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
        collector.on('collect', async i => {
          if (i.customId === 'prev_page') currentPage--;
          else if (i.customId === 'next_page') currentPage++;
          await i.update({ embeds: [generateEmbed(currentPage)], components: [getButtons(currentPage)] });
        });
        
        collector.on('end', async () => {
           await interaction.editReply({ components: [] }).catch(() => {});
        });
      }
    }
  }
};
