import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection, Events, REST, Routes } from 'discord.js';
import { sendBatchedWebhook } from './webhookLogger';
import { scanMembers } from './scanner';
import { getScanIntervalMinutes, isPaused } from './configManager';
import fs from 'fs';
import path from 'path';

export const clanTagCache = new Map<string, string>();
export let lastScanTime = Date.now();
export let scanIntervalMs = getScanIntervalMinutes() * 60 * 1000;
let scannerTimer: NodeJS.Timeout | null = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User]
});

// Removed legacy webhook init

const commands = new Collection<string, any>();
const commandsPath = path.join(__dirname, 'commands');

export function loadCommands() {
  if (!fs.existsSync(commandsPath)) fs.mkdirSync(commandsPath, { recursive: true });
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath).default;
    if (command && 'data' in command && 'execute' in command) {
      commands.set(command.data.name, command);
    }
  }
}

// -------------------------------------------------------------------------
// WebSocket Interceptor: discord.js strips undocumented fields (like clan).
// We MUST intercept raw packets to build an offline cache of everyone's official Clan Tag!
// -------------------------------------------------------------------------
client.on(Events.Raw, (packet: any) => {
  const extractClan = (u: any) => u?.clan?.tag || u?.primary_guild?.tag || '';
  
  if (packet.t === 'GUILD_CREATE' || packet.t === 'GUILD_MEMBERS_CHUNK') {
    packet.d.members?.forEach((m: any) => {
      const tag = extractClan(m.user);
      if (tag) clanTagCache.set(m.user.id, tag);
    });
  } else if (packet.t === 'GUILD_MEMBER_ADD' || packet.t === 'GUILD_MEMBER_UPDATE') {
    const m = packet.d;
    const tag = extractClan(m.user);
    if (tag) clanTagCache.set(m.user.id, tag);
    else clanTagCache.delete(m.user.id);
  } else if (packet.t === 'PRESENCE_UPDATE') {
    const u = packet.d.user;
    if (u) {
      const tag = extractClan(u);
      if (tag) clanTagCache.set(u.id, tag);
      // We don't delete on missing presence update because presence doesn't always contain the full user object
    }
  }
});

client.once(Events.ClientReady, async c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);

  loadCommands();
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

  try {
    const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
    const guildId = process.env.DISCORD_GUILD_ID || client.guilds.cache.first()?.id;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(c.user.id, guildId), { body: commandData });
      console.log('Successfully reloaded local guild (/) commands.');
    } else {
      await rest.put(Routes.applicationCommands(c.user.id), { body: commandData });
      console.log('Successfully reloaded global (/) commands.');
    }
  } catch (error) {
    console.error('Error refreshing commands:', error);
  }

  const guildID = process.env.DISCORD_GUILD_ID || client.guilds.cache.first()?.id;
  if (guildID) {
    const guild = client.guilds.cache.get(guildID);
    if (guild) {
      console.log(`Ready to scan guild: ${guild.name}. (Member fetching deferred to runtime)`);
    } else {
      console.warn('Guild not found. Is the bot invited to the server?');
    }
  }

  rebootScanner();
});

export function rebootScanner() {
  if (scannerTimer) clearInterval(scannerTimer);

  scanIntervalMs = getScanIntervalMinutes() * 60 * 1000;
  console.log(`[Config] Setting up periodic scan every ${scanIntervalMs / 60000} minutes.`);
  
  lastScanTime = Date.now();

  scannerTimer = setInterval(async () => {
    lastScanTime = Date.now();
    
    if (isPaused()) {
      console.log('[Periodic Scan] Skipped because bot is PAUSED.');
      return;
    }

    const guildID = process.env.DISCORD_GUILD_ID || client.guilds.cache.first()?.id;
    if(!guildID) return;
    const guild = client.guilds.cache.get(guildID);
    if (!guild) return;

    console.log(`[Periodic Scan] Starting background chunked scan...`);
    
    let lastId = '0';
    let keepFetching = true;
    const allFlags = [];
    let totalScanned = 0;

    while (keepFetching) {
      const members = await guild.members.list({ limit: 1000, after: lastId });
      if (members.size === 0) {
        keepFetching = false;
        break;
      }

      totalScanned += members.size;
      const flags = await scanMembers(members.values());
      if (flags.length > 0) {
        allFlags.push(...flags);
      }

      // Sweep cache to prevent memory leaks during massive 100k+ scans
      for (const member of members.values()) {
        guild.members.cache.delete(member.id);
        client.users.cache.delete(member.id);
      }

      lastId = members.last()!.id;
      await new Promise(r => setTimeout(r, 500)); // Delay between chunks
    }

    console.log(`[Periodic Scan] Completed. Scanned ${totalScanned} members. Found ${allFlags.length} violations.`);
    
    if (allFlags.length > 0) {
      await sendBatchedWebhook(allFlags);
    }
  }, scanIntervalMs);
}

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    }
  } else if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(error);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
