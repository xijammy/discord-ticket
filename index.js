// MFG Review Bot — Welcome DM + Review DM on /complete only
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import fs from 'fs';

// === Load environment variables ===
const {
  DISCORD_TOKEN,
  REVIEW_CHANNEL,
  LOG_CHANNEL,
  IGNORE_USERS,
  WELCOME_MESSAGE
} = process.env;

// === Fixed channel IDs ===
const COMPLETE_LOG_CHANNEL = '1493316746088808508';
const WELCOME_CHANNEL_ID = '1454402793157824603'; // fresh-spawn channel

// === Safety check ===
if (!DISCORD_TOKEN || !REVIEW_CHANNEL || !LOG_CHANNEL) {
  console.error('❌ Missing required environment variables. Check Railway.');
  console.log({
    DISCORD_TOKEN: !!DISCORD_TOKEN,
    REVIEW_CHANNEL,
    LOG_CHANNEL
  });
  process.exit(1);
}

// === Discord client ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// === Local memory tracking ===
const STORE_PATH = './lastMessage.json';

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return { lastProcessedId: null, startedAt: Date.now() };
  }
}

function saveStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('⚠️ Failed to save lastMessage.json:', err.message);
  }
}

let store = loadStore();

if (!store.startedAt) {
  store.startedAt = Date.now();
  saveStore(store);
}

function isAfter(idA, idB) {
  if (!idB) return true;
  try {
    return BigInt(idA) > BigInt(idB);
  } catch {
    return true;
  }
}

// === Ignore list ===
const ignoreList = new Set(
  (IGNORE_USERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase())
);

function getUserTag(user) {
  return `${user.username}#${user.discriminator ?? '0'}`.toLowerCase();
}

// === Embeds ===
function buildLogEmbed({ title, color, userTag, userId, ticketName, status, footer = 'MaxFramesGained • Reviews' }) {
  return new EmbedBuilder()
    .setAuthor({ name: 'MFG Review Bot' })
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: 'User', value: `${userTag} (ID: ${userId})`, inline: false },
      { name: 'Ticket', value: ticketName || 'N/A', inline: true },
      { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
      { name: 'Status', value: status, inline: false }
    )
    .setFooter({ text: footer });
}

function buildWelcomeLogEmbed({ title, color, userTag, userId, status }) {
  return new EmbedBuilder()
    .setAuthor({ name: 'MFG Review Bot' })
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: 'User', value: `${userTag} (ID: ${userId})`, inline: false },
      { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
      { name: 'Status', value: status, inline: true }
    )
    .setFooter({ text: 'MaxFramesGained • Welcome DM' });
}

async function logToChannel(guild, embed) {
  try {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL);
    if (logChannel) {
      await logChannel.send({ embeds: [embed] });
    } else {
      console.warn(`⚠️ Log channel not found in guild ${guild?.name}`);
    }
  } catch (e) {
    console.warn('⚠️ Failed to send log embed:', e.message);
  }
}

// === Welcome DM text ===
function getWelcomeMessage(member) {
  const freshSpawnMention = `<#${WELCOME_CHANNEL_ID}>`;

  if (WELCOME_MESSAGE && WELCOME_MESSAGE.trim()) {
    return WELCOME_MESSAGE
      .replaceAll('{user}', `<@${member.id}>`)
      .replaceAll('{fresh_spawn_channel}', freshSpawnMention);
  }

  return (
    `Hi ${member.user.username}, thank you for joining MaxFramesGained.\n\n` +
    `Please go to ${freshSpawnMention} and follow the instructions there if you would like to book an optimisation or enquire about a service.\n\n` +
    `If a ticket is not created within 24 hours, you will be removed and can rejoin once you are ready to purchase, when you create a tciket make sure you follow the bots prompts or you will be kicked.\n\n` +
    `Please also make sure you read the important information categories before booking.`
  );
}

// === Ready ===
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🧠 Startup time: ${new Date(store.startedAt).toISOString()}`);
  console.log(`🔎 Watching for /complete log messages in ${COMPLETE_LOG_CHANNEL}...`);
});

// === Welcome DM on join ===
client.on('guildMemberAdd', async (member) => {
  try {
    if (!member || !member.user || member.user.bot) return;

    const userTag = `${member.user.username}#${member.user.discriminator ?? '0'}`;
    const dmText = getWelcomeMessage(member);

    let sentOK = true;
    let errorReason = '';

    await member.send(dmText).catch(err => {
      sentOK = false;
      errorReason = err?.message || 'Unknown DM error';
    });

    await logToChannel(
      member.guild,
      buildWelcomeLogEmbed({
        title: sentOK ? '📩 Welcome DM Sent' : '🚫 Welcome DM Failed',
        color: sentOK ? 0x00B060 : 0xFF0000,
        userTag,
        userId: member.id,
        status: sentOK ? '✅ Delivered' : `❌ ${errorReason}`
      })
    );
  } catch (err) {
    console.error('⚠️ guildMemberAdd handler error:', err);
  }
});

// === Review DM only when /complete has been used ===
client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (!message.author.bot) return;
    if (message.createdTimestamp < store.startedAt) return;
    if (!isAfter(message.id, store.lastProcessedId)) return;
    if (message.channelId !== COMPLETE_LOG_CHANNEL) return;
    if (!message.embeds?.length) return;

    const embed = message.embeds[0];

    let userId = null;
    let ticketName = 'N/A';

    if (embed.fields?.length) {
      const userField = embed.fields.find(f => (f.name || '').toLowerCase().includes('user'));
      const ticketField = embed.fields.find(f => (f.name || '').toLowerCase().includes('ticket'));

      if (userField) {
        const idMatch = userField.value.match(/(\d{10,})/);
        if (idMatch) userId = idMatch[1];
      }

      if (ticketField) {
        ticketName = ticketField.value || 'N/A';
      }
    }

    if (!userId && embed.description) {
      const idMatch = embed.description.match(/(\d{10,})/);
      if (idMatch) userId = idMatch[1];
    }

    if (!userId) {
      store.lastProcessedId = message.id;
      saveStore(store);
      return;
    }

    const user = await client.users.fetch(userId).catch(() => null);

    if (!user) {
      await logToChannel(message.guild, buildLogEmbed({
        title: '🚫 Review DM Failed',
        color: 0xFF0000,
        userTag: 'Unknown User',
        userId,
        ticketName,
        status: 'Could not fetch user.'
      }));
      store.lastProcessedId = message.id;
      saveStore(store);
      return;
    }

    const userTagLower = getUserTag(user);
    if (ignoreList.has(userTagLower) || ignoreList.has(user.id.toLowerCase())) {
      store.lastProcessedId = message.id;
      saveStore(store);
      return;
    }

    const reviewMention = `<#${REVIEW_CHANNEL}>`;
    const dmText =
      `Hi! Thank you for using our service — could you please leave a review in ${reviewMention}? 🔥\n\n` +
      `If you experience any issues within scope, please use your ticket rather than messaging staff directly.`;

    let sentOK = true;
    let errorReason = '';

    await user.send(dmText).catch(err => {
      sentOK = false;
      errorReason = err?.message || 'Unknown DM error';
    });

    const logEmbed = buildLogEmbed({
      title: sentOK ? '📩 Review DM Sent' : '🚫 Review DM Failed',
      color: sentOK ? 0x00B060 : 0xFF0000,
      userTag: `${user.username}#${user.discriminator ?? '0'}`,
      userId: user.id,
      ticketName,
      status: sentOK ? '✅ Delivered' : `❌ ${errorReason}`
    });

    await logToChannel(message.guild, logEmbed);

    store.lastProcessedId = message.id;
    saveStore(store);
  } catch (err) {
    console.error('⚠️ messageCreate handler error:', err);
  }
});

client.login(DISCORD_TOKEN);
