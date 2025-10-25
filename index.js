// MFG Review Bot — Railway + GitHub ready
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import fs from 'fs';

const {
  DISCORD_TOKEN,
  TRANSCRIPT_LOG_CHANNEL,
  REVIEW_CHANNEL,
  LOG_CHANNEL,
  IGNORE_USERS
} = process.env;

if (!DISCORD_TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in environment variables.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ---- Memory safeguard (restart-safe) ----
const STORE_PATH = './lastMessage.json';
function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { lastProcessedId: null, startedAt: Date.now() };
  }
}
function saveStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('⚠️ Failed to save lastMessage.json:', e.message);
  }
}
let store = loadStore();
if (!store.startedAt) { store.startedAt = Date.now(); saveStore(store); }

function isAfter(idA, idB) {
  if (!idB) return true;
  try { return BigInt(idA) > BigInt(idB); } catch { return true; }
}

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

function findChannelByName(guild, name) {
  if (!guild || !name) return null;
  return guild.channels.cache.find(ch => ch.name === name && ch.isTextBased?.()) || null;
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🧠 Startup time: ${new Date(store.startedAt).toISOString()}`);
  console.log('🔎 Listening for new Ticket Tool transcripts...');
});

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (message.createdTimestamp < store.startedAt) return;
    if (!isAfter(message.id, store.lastProcessedId)) return;
    if (message.channel?.name !== TRANSCRIPT_LOG_CHANNEL) return;
    if (!message.embeds || message.embeds.length === 0) return;
    const embed = message.embeds[0];

    let ownerMention = null;
    if (embed.fields && embed.fields.length) {
      const ownerField = embed.fields.find(f => (f.name || '').toLowerCase().includes('ticket owner'));
      if (ownerField) ownerMention = ownerField.value;
    }
    if (!ownerMention && embed.description) {
      const match = embed.description.match(/Ticket Owner[:\s]+(.+)/i);
      if (match) ownerMention = match[1];
    }
    if (!ownerMention) { store.lastProcessedId = message.id; saveStore(store); return; }

    const mentionMatch = ownerMention.match(/<@!?(\d{10,})>/);
    if (!mentionMatch) { store.lastProcessedId = message.id; saveStore(store); return; }

    const userId = mentionMatch[1];
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) {
      await logToChannel(message, buildLogEmbed({
        title: '🚫 Review DM Failed',
        color: 0xFF0000,
        userTag: 'Unknown User',
        userId,
        ticketName: message.embeds?.[0]?.fields?.find(f => (f.name || '').toLowerCase().includes('ticket name'))?.value || message.channel?.name || 'N/A',
        status: 'Could not fetch user.'
      }));
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    const userTagLower = getUserTag(user);
    if (ignoreList.has(userTagLower) || ignoreList.has(user.id.toLowerCase())) {
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    const reviewChannel = findChannelByName(message.guild, REVIEW_CHANNEL);
    const reviewMention = reviewChannel ? `<#${reviewChannel.id}>` : REVIEW_CHANNEL;

    const dmText = `Hi! Thank you for using our service — could you please leave a review in ${reviewMention}? 🔥`;

    let sentOK = true; let errorReason = '';
    await user.send(dmText).catch(err => { sentOK = false; errorReason = err?.message || 'Unknown DM error'; });

    const logEmbed = buildLogEmbed({
      title: sentOK ? '📩 Review DM Sent' : '🚫 Review DM Failed',
      color: sentOK ? 0x00B060 : 0xFF0000,
      userTag: `${user.username}#${user.discriminator}`,
      userId: user.id,
      ticketName: embed.fields?.find(f => (f.name || '').toLowerCase().includes('ticket name'))?.value || 'N/A',
      status: sentOK ? '✅ Delivered' : `❌ ${errorReason}`,
    });

    await logToChannel(message, logEmbed);

    store.lastProcessedId = message.id; saveStore(store);

  } catch (err) {
    console.error('⚠️ messageCreate handler error:', err);
  }
});

function buildLogEmbed({ title, color, userTag, userId, ticketName, status }) {
  return new EmbedBuilder()
    .setAuthor({ name: 'MFG Review Bot' })
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: 'User', value: `${userTag} (ID: ${userId})`, inline: false },
      { name: 'Ticket', value: `${ticketName}`, inline: true },
      { name: 'Time', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
      { name: 'Status', value: status, inline: false }
    )
    .setFooter({ text: 'MaxFramesGained • Reviews' });
}

async function logToChannel(message, embed) {
  try {
    const logChannel = findChannelByName(message.guild, LOG_CHANNEL);
    if (logChannel) { await logChannel.send({ embeds: [embed] }); }
    else { console.warn(`⚠️ Log channel "${LOG_CHANNEL}" not found in guild ${message.guild?.name}`); }
  } catch (e) {
    console.warn('⚠️ Failed to post log embed:', e.message);
  }
}

client.login(DISCORD_TOKEN);
