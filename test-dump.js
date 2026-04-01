require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  const guild = client.guilds.cache.first();
  await guild.members.fetch();
  const member = guild.members.cache.first();
  
  // Dump everything we can recursively about this member
  const serializeList = [
    member,
    member.user,
    member._roles,
    member.flags
  ];
  
  let out = "";
  for(const obj of serializeList) {
    if(!obj) continue;
    out += require('util').inspect(obj, { depth: 2, showHidden: true }) + "\n\n";
  }
  
  fs.writeFileSync('member_dump.txt', out);
  console.log("Dumped to member_dump.txt");
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
