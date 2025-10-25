import { Client, GatewayIntentBits, Partials, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("channelDelete", async (channel) => {
  if (!channel.name.startsWith("ticket-")) return;

  const topic = channel.topic;
  const userId = topic?.match(/\d{17,19}/)?.[0];
  if (!userId) {
    console.log(`⚠️ No user ID found in topic for ${channel.name}`);
    return;
  }

  try {
    const user = await client.users.fetch(userId);
    const embed = new EmbedBuilder()
      .setColor("#ff00ff")
      .setTitle("🎯 We'd Love Your Feedback!")
      .setDescription(
        `Your ticket **${channel.name}** has been closed.\n\nWe’d really appreciate a quick review — it helps us improve and grow!\n\n💬 Please leave your review in our Discord review channel.\n\nThank you for choosing **MaxFramesGained** 💙💗`
      );

    await user.send({ embeds: [embed] });
    console.log(`✅ Sent review DM to ${user.tag}`);
  } catch (err) {
    console.error(`❌ Couldn't DM user for ${channel.name}:`, err);
  }
});

client.login(process.env.DISCORD_TOKEN);
