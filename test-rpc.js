require('dotenv').config();
const DiscordRPC = require('discord-rpc');
const clientId = process.env.DISCORD_CLIENT_ID;

if (!clientId) {
  console.error("Please add DISCORD_CLIENT_ID to your .env file! It's required for RPC to attach to your desktop client.");
  process.exit(1);
}

// You must explicitly register the client ID for Discord to recognize this process as the app
DiscordRPC.register(clientId);

console.log("Connecting to Discord desktop client...");
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

rpc.on('ready', () => {
  rpc.setActivity({
    details: 'Refract',
    state: 'Doin some botter things (NOT REAL)',
    largeImageKey: 'icon',
    largeImageText: 'Secret Icon',
    instance: false,
  });

  console.log(`\n================================`);
  console.log(`✅ Activity successfully set!`);
  console.log(`Logged into Discord as: ${rpc.user.username}`);
  console.log(`================================`);
  console.log('You can now verify this in the Discord desktop app.');
  console.log('Your bot can now detect this if you use `/blacklist fromuser` or `/scan` !');
  console.log('Press Ctrl+C to stop the activity script.');
});

rpc.login({ clientId }).catch((e) => {
  console.error("Failed to connect to Discord desktop client. Is Discord running natively on this PC?");
  console.error(e);
});
