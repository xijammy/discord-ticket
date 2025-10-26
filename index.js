// MFG Review Bot — Railway + GitHub ready (ID-based version)
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import fs from 'fs';

// === Load environment variables ===
const {
  DISCORD_TOKEN,
  TRANSCRIPT_LOG_CHANNEL,
  REVIEW_CHANNEL,
  LOG_CHANNEL,
  IGNORE_USERS
} = process.env;

// --- Safety check ---
if (!DISCORD_TOKEN || !TRANSCRIPT_LOG_CHANNEL || !REVIEW_CHANNEL || !LOG_CHANNEL) {
  console.error('❌ Missing required environment variables. Check Railway.');
  console.log({
    DISCORD_TOKEN: !!DISCORD_TOKEN,
    TRANSCRIPT_LOG_CHANNEL,
    REVIEW_CHANNEL,
    LOG_CHANNEL
  });
  process.exit(1);
}

// === Discord client ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
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
if (!store.startedAt) { store.startedAt = Date.now(); saveStore(store); }

function isAfter(idA, idB) {
  if (!idB) return true;
  try { return BigInt(idA) > BigInt(idB); } catch { return true; }
}

// === Utility helpers ===
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

function buildLogEmbed({ title, color, userTag, userId, ticketName, status }) {
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
    .setFooter({ text: 'MaxFramesGained • Reviews' });
}

async function logToChannel(guild, embed) {
  try {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL);
    if (logChannel) await logChannel.send({ embeds: [embed] });
    else console.warn(`⚠️ Log channel not found in guild ${guild?.name}`);
  } catch (e) {
    console.warn('⚠️ Failed to send log embed:', e.message);
  }
}

// === Main event handler ===
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🧠 Startup time: ${new Date(store.startedAt).toISOString()}`);
  console.log('🔎 Watching for new Ticket Tool transcripts...');
});

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (message.createdTimestamp < store.startedAt) return;
    if (!isAfter(message.id, store.lastProcessedId)) return;
    if (message.channelId !== TRANSCRIPT_LOG_CHANNEL) return;
    if (!message.embeds?.length) return;

    const embed = message.embeds[0];
    let ownerMention = null;

    if (embed.fields?.length) {
      const ownerField = embed.fields.find(f => (f.name || '').toLowerCase().includes('ticket owner'));
      if (ownerField) ownerMention = ownerField.value;
    }

    if (!ownerMention && embed.description) {
      const match = embed.description.match(/Ticket Owner[:\s]+(.+)/i);
      if (match) ownerMention = match[1];
    }

    if (!ownerMention) {
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    const mentionMatch = ownerMention.match(/<@!?(\d{10,})>/);
    if (!mentionMatch) {
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    const userId = mentionMatch[1];
    const user = await client.users.fetch(userId).catch(() => null);

    if (!user) {
      await logToChannel(message.guild, buildLogEmbed({
        title: '🚫 Review DM Failed',
        color: 0xFF0000,
        userTag: 'Unknown User',
        userId,
        ticketName: embed.fields?.find(f => (f.name || '').toLowerCase().includes('ticket name'))?.value || 'N/A',
        status: 'Could not fetch user.'
      }));
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    const userTagLower = getUserTag(user);
    if (ignoreList.has(userTagLower) || ignoreList.has(user.id.toLowerCase())) {
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    const reviewMention = `<#${REVIEW_CHANNEL}>`;
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

    await logToChannel(message.guild, logEmbed);
    store.lastProcessedId = message.id; saveStore(store);
  } catch (err) {
    console.error('⚠️ messageCreate handler error:', err);
  }
});

client.login(DISCORD_TOKEN);