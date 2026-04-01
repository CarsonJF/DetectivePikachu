import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField, EmbedBuilder } from 'discord.js';
import { lastScanTime, scanIntervalMs } from '../index';

export default {
    data: new SlashCommandBuilder()
        .setName('nextscan')
        .setDescription('Shows the exact time until the next periodic background scan.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),

    async execute(interaction: ChatInputCommandInteraction) {
        const nextScanTime = lastScanTime + scanIntervalMs;
        const timeRemainingMs = nextScanTime - Date.now();

        if (timeRemainingMs < 0) {
            return interaction.reply({ 
                embeds: [new EmbedBuilder().setColor(0x00A2FF).setDescription('A background scan is triggering right now!')], 
                ephemeral: true 
            });
        }

        const discordTimestamp = `<t:${Math.floor(nextScanTime / 1000)}:R>`;
        
        const embed = new EmbedBuilder()
            .setColor(0x00A2FF)
            .setDescription(`⏱️ The next background scan will occur ${discordTimestamp}.`);

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
