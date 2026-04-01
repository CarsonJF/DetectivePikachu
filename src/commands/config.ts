import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField, EmbedBuilder, TextChannel } from 'discord.js';
import { setConfig, getScanIntervalMinutes, isPaused, getConfig, getLogFormat } from '../configManager';
import { rebootScanner } from '../index';

export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure Detective Pikachu behavioral settings.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(sub => 
      sub.setName('channel').setDescription('Bind the reporting logs to a specific channel.')
        .addChannelOption(opt => opt.setName('target').setDescription('The channel to receive logs').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('interval').setDescription('Set how often the background scanner runs.')
        .addIntegerOption(opt => opt.setName('minutes').setDescription('Interval in minutes').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('pause').setDescription('Pause or unpause the background scanner.')
        .addBooleanOption(opt => opt.setName('state').setDescription('True = Paused, False = Running').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('logformat').setDescription('Choose how logs are output to the webhook.')
        .addStringOption(opt => opt.setName('format').setDescription('TEXT or EMBED').setRequired(true).addChoices(
          { name: 'Text (Default)', value: 'TEXT' },
          { name: 'Embed (Max 10 per message)', value: 'EMBED' }
        ))
    )
    .addSubcommand(sub => 
      sub.setName('view').setDescription('View current configuration state.')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();
    const e = (msg: string, color: number = 0x00FF00) => new EmbedBuilder().setColor(color).setDescription(msg);

    if (subcommand === 'channel') {
      await interaction.deferReply({ ephemeral: true });
      const channel = interaction.options.getChannel('target', true) as TextChannel;
      
      if (!channel.isTextBased() || !('createWebhook' in channel)) {
         return interaction.editReply({ embeds: [e('❌ You must select a generic Text Channel!', 0xFF0000)] });
      }

      try {
         const webhooks = await channel.fetchWebhooks();
         let hook = webhooks.find(w => w.owner?.id === interaction.client.user?.id);
         
         if (!hook) {
            hook = await channel.createWebhook({
                name: 'Detective Pikachu Logs',
                avatar: interaction.client.user?.displayAvatarURL()
            });
         }
         
         setConfig('webhook_url', hook.url);
         return interaction.editReply({ embeds: [e(`✅ Reporting channel bound to <#${channel.id}> successfully!`)] });
      } catch (err: any) {
         return interaction.editReply({ embeds: [e(`❌ Failed to create webhook. Ensure bot has "Manage Webhooks" permission!\n${err.message}`, 0xFF0000)] });
      }
    } 
    
    else if (subcommand === 'interval') {
      const mins = interaction.options.getInteger('minutes', true);
      if (mins < 1) return interaction.reply({ embeds: [e('❌ Interval must be at least 1 minute.', 0xFF0000)], ephemeral: true });
      
      setConfig('scan_interval', mins.toString());
      rebootScanner();
      
      return interaction.reply({ embeds: [e(`✅ Scan interval updated to run every **${mins}** minutes.\nThe internal clock has automatically updated!`)], ephemeral: true });
    }

    else if (subcommand === 'pause') {
      const state = interaction.options.getBoolean('state', true);
      setConfig('is_paused', state ? 'true' : 'false');
      
      return interaction.reply({ embeds: [e(`✅ Background scanner is now **${state ? 'PAUSED' : 'ACTIVE'}**.`)], ephemeral: true });
    }

    else if (subcommand === 'logformat') {
      const format = interaction.options.getString('format', true);
      setConfig('log_format', format);
      
      return interaction.reply({ embeds: [e(`✅ Webhook log format is now set to **${format}**.`)] });
    }

    else if (subcommand === 'view') {
      const paused = isPaused();
      const interval = getScanIntervalMinutes();
      const wh = getConfig('webhook_url') ? '✅ Fully Bound to Database' : (process.env.WEBHOOK_URL ? '⚠️ Legacy .Env Load-bearing fallback' : '❌ Completely Disabled. Unbound.');

      const embed = new EmbedBuilder()
        .setColor(0x00A2FF)
        .setTitle('⚙️ System Configuration')
        .addFields(
            { name: 'Background Scanner', value: paused ? '⏸️ Paused' : '▶️ Active', inline: true },
            { name: 'Scan Interval', value: `⏱️ Every ${interval} mins`, inline: true },
            { name: 'Log Format', value: `📄 ${getLogFormat()}`, inline: true },
            { name: 'Reporting Engine Status', value: wh, inline: false }
        );
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
