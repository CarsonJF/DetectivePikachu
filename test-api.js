require('dotenv').config();

async function run() {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=10`, {
    headers: { 'Authorization': `Bot ${token}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data[0], null, 2));
}

run();
