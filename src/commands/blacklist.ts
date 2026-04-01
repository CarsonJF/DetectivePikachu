import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, PermissionsBitField, User, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import db from '../database';
import { clanTagCache } from '../index';

export default {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage the blacklist rules.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => 
      sub.setName('add').setDescription('Add a new blacklist rule')
        .addStringOption(opt => opt.setName('pattern').setDescription('The exact string or regex pattern.').setRequired(true))
        .addStringOption(opt => opt.setName('type').setDescription('Target type: guild_tag or activity').setRequired(true).addChoices(
          { name: 'guild_tag', value: 'guild_tag' },
          { name: 'activity', value: 'activity' }
        ))
        .addBooleanOption(opt => opt.setName('is_regex').setDescription('Treat this pattern as a Regex?').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('fromuser').setDescription('Copy a tag or activity from a user into the blacklist')
        .addUserOption(opt => opt.setName('target').setDescription('The user to copy from').setRequired(true))
        .addStringOption(opt => opt.setName('type').setDescription('What to copy').setRequired(true).addChoices(
          { name: 'guild_tag', value: 'guild_tag' },
          { name: 'activity', value: 'activity' }
        ))
    )
    .addSubcommand(sub => 
      sub.setName('remove').setDescription('Remove a blacklist rule')
        .addStringOption(opt => opt.setName('rule').setDescription('The rule to remove').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub => 
      sub.setName('list').setDescription('List all current waitlist rules')
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    
    // Fetch all records for the autocomplete search
    const rules = db.prepare('SELECT pattern, type, isRegex FROM blacklist_rules').all() as { pattern: string, type: string, isRegex: number }[];
    
    // Filter them down based on what the user typed
    const filtered = rules.filter(r => r.pattern.toLowerCase().includes(focusedValue) || r.type.toLowerCase().includes(focusedValue));
    
    // Build the visual text for the dropdown
    await interaction.respond(
      filtered.slice(0, 25).map(choice => {
        const mode = choice.isRegex ? 'REGEX' : 'EXACT';
        const typeStr = choice.type.toUpperCase();
        return {
          name: `[${typeStr}] [${mode}] ${choice.pattern}`.substring(0, 100),
          value: `${choice.pattern}___${choice.type}` 
        };
      })
    );
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    const successEmbed = (msg: string) => new EmbedBuilder().setColor(0x00FF00).setDescription(`✅ ${msg}`);
    const errorEmbed = (msg: string) => new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ ${msg}`);

    if (subcommand === 'add') {
      const pattern = interaction.options.getString('pattern', true);
      const type = interaction.options.getString('type', true);
      const isRegex = interaction.options.getBoolean('is_regex') ? 1 : 0;
      
      if (isRegex) {
        try { new RegExp(pattern); } catch (e: any) {
          return interaction.reply({ embeds: [errorEmbed(`Invalid Regex Pattern:\n\`\`\`\n${e.message}\n\`\`\``)], ephemeral: true });
        }
      }

      db.prepare('INSERT INTO blacklist_rules (pattern, type, isRegex) VALUES (?, ?, ?)').run(pattern, type, isRegex);
      return interaction.reply({ embeds: [successEmbed(`Added rule for ` + (isRegex ? 'Regex' : 'Exact string') + ` match on **${type}**:\n\`${pattern}\``)] });
    } 
    
    else if (subcommand === 'fromuser') {
      const targetUser = interaction.options.getUser('target', true) as User;
      const type = interaction.options.getString('type', true);
      const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

      if (!member) return interaction.reply({ embeds: [errorEmbed('Member not found in this server.')], ephemeral: true });

      let pattern = '';
      if (type === 'guild_tag') {
        pattern = clanTagCache.get(targetUser.id) || '';
        if (!pattern) return interaction.reply({ embeds: [errorEmbed('That user does not have an official Discord Guild/Clan Tag tracked in the cache.')], ephemeral: true });
      } else if (type === 'activity') {
        const activities = member.presence?.activities || [];
        if (activities.length === 0) return interaction.reply({ embeds: [errorEmbed('That user has no active activity.')], ephemeral: true });
        
        const a = activities.find(act => act.type !== 4) || activities[0];
        pattern = `${a.name} ${a.state || ''} ${a.details || ''}`.trim();
      }

      if (!pattern) return interaction.reply({ embeds: [errorEmbed('Could not resolve a pattern from that user.')], ephemeral: true });

      db.prepare('INSERT INTO blacklist_rules (pattern, type, isRegex) VALUES (?, ?, ?)').run(pattern, type, 0);
      return interaction.reply({ embeds: [successEmbed(`Successfully copied **${type}** from <@${targetUser.id}> as an EXACT match:\n\`${pattern}\``)] });
    }

    else if (subcommand === 'remove') {
      const payload = interaction.options.getString('rule', true);
      const [pattern, ruleType] = payload.split('___');

      if (!pattern || !ruleType) return interaction.reply({ embeds: [errorEmbed('Invalid rule mapping.')], ephemeral: true });

      const result = db.prepare('DELETE FROM blacklist_rules WHERE pattern = ? AND type = ?').run(pattern, ruleType);
      if (result.changes > 0) {
        return interaction.reply({ embeds: [successEmbed('Successfully deleted the blacklist rule.')] });
      } else {
        return interaction.reply({ embeds: [errorEmbed('Rule not found. It may have already been deleted.')], ephemeral: true });
      }
    }
    
    else if (subcommand === 'list') {
      const rules = db.prepare('SELECT pattern, type, isRegex FROM blacklist_rules').all() as { pattern: string, type: string, isRegex: number }[];
      if (rules.length === 0) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x0000FF).setTitle('📋 Blacklist').setDescription('The blacklist is empty.')], ephemeral: true });
      
      await interaction.deferReply({ ephemeral: true }); // Prevent timeout on longer processing

      const ITEMS_PER_PAGE = 5;
      const totalPages = Math.ceil(rules.length / ITEMS_PER_PAGE);
      let currentPage = 0;

      const generateEmbed = (page: number) => {
        const start = page * ITEMS_PER_PAGE;
        const currentRules = rules.slice(start, start + ITEMS_PER_PAGE);
        
        const description = currentRules.map((r, index) => `> **Rule #:** \`${start + index + 1}\`\n> **Type:** \`${r.type.toUpperCase()}\`\n> **${r.isRegex ? 'Regex' : 'Exact'}:** \`${r.pattern}\`\n`).join('\n');
        
        return new EmbedBuilder()
          .setColor(0x0000FF)
          .setTitle('🚨 Active Blacklist Rules')
          .setDescription(description)
          .setFooter({ text: `Page ${page + 1} of ${totalPages}  |  Total Rules: ${rules.length}` });
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
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 }); // 5 min timeout
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
