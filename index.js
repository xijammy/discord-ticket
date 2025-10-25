// MFG Review Bot — Railway + GitHub ready
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import fs from 'fs';

const {
  DISCORD_TOKEN,
  TRANSCRIPT_CHANNEL_ID,
  LOG_CHANNEL_ID,
  REVIEW_CHANNEL_ID,
  IGNORE_USERS
} = process.env;

if (!DISCORD_TOKEN || !TRANSCRIPT_CHANNEL_ID || !LOG_CHANNEL_ID || !REVIEW_CHANNEL_ID) {
  console.error('❌ Missing required env vars.');
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

const STORE_PATH = './lastMessage.json';
function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); }
  catch { return { lastProcessedId: null, startedAt: Date.now() }; }
}
function saveStore(store) {
  try { fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8'); }
  catch (e) { console.error('⚠️ Failed to save lastMessage.json:', e.message); }
}
let store = loadStore();
if (!store.startedAt) { store.startedAt = Date.now(); saveStore(store); }

function isAfter(a, b) {
  if (!b) return true;
  try { return BigInt(a) > BigInt(b); } catch { return true; }
}

const ignoreSet = new Set((IGNORE_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
function isIgnored(user) {
  const id = (user.id || '').toLowerCase();
  const name = (user.username || '').toLowerCase();
  const tag = `${user.username}#${user.discriminator ?? '0'}`.toLowerCase();
  return ignoreSet.has(id) || ignoreSet.has(name) || ignoreSet.has(tag);
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🧠 Startup time: ${new Date(store.startedAt).toISOString()}`);
  console.log('🔎 Listening for new Ticket Tool transcripts...');
});

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (message.channelId !== TRANSCRIPT_CHANNEL_ID) return;
    if (message.createdTimestamp < store.startedAt) return;
    if (!isAfter(message.id, store.lastProcessedId)) return;
    if (!message.embeds?.length) { store.lastProcessedId = message.id; saveStore(store); return; }

    const embed = message.embeds[0];
    let ticketName =
      embed.fields?.find(f => (f.name || '').toLowerCase().includes('ticket'))?.value ||
      embed.title || 'N/A';

    let ownerMention = null;
    if (embed.fields?.length) {
      const fld = embed.fields.find(f => (f.name || '').toLowerCase().includes('ticket owner'));
      if (fld) ownerMention = fld.value;
    }
    if (!ownerMention && embed.description) {
      const m = embed.description.match(/Ticket Owner[:\s]+(.+)/i);
      if (m) ownerMention = m[1];
    }
    if (!ownerMention) {
      await postLogEmbed(message, { ok: false, userTag: 'Unknown', userId: 'Unknown', ticketName, reason: 'No Ticket Owner found' });
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    const mm = ownerMention.match(/<@!?(\d{10,})>/);
    if (!mm) {
      await postLogEmbed(message, { ok: false, userTag: 'Unknown', userId: 'Unknown', ticketName, reason: 'No valid mention in Ticket Owner' });
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    const userId = mm[1];
    const user = await message.client.users.fetch(userId).catch(() => null);
    if (!user) {
      await postLogEmbed(message, { ok: false, userTag: 'Unknown', userId, ticketName, reason: 'Could not fetch user' });
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    if (isIgnored(user)) {
      store.lastProcessedId = message.id; saveStore(store); return;
    }

    const reviewMention = `<#${REVIEW_CHANNEL_ID}>`;
    const dmText = `Hi! Thank you for using our service — could you please leave a review in ${reviewMention}? 🔥`;

    let ok = true, errMsg = '';
    await user.send(dmText).catch(err => { ok = false; errMsg = err?.message || 'Unknown DM error'; });

    await postLogEmbed(message, {
      ok,
      userTag: `${user.username}#${user.discriminator ?? '0'}`,
      userId: user.id,
      ticketName,
      reason: ok ? 'Delivered' : errMsg
    });

    store.lastProcessedId = message.id; saveStore(store);
  } catch (e) {
    console.error('⚠️ messageCreate error:', e);
  }
});

async function postLogEmbed(message, { ok, userTag, userId, ticketName, reason }) {
  const color = ok ? 0x00B060 : 0xFF0000;
  const title = ok ? '📩 Review DM Sent' : '🚫 Review DM Failed';

  const logEmbed = new EmbedBuilder()
    .setAuthor({ name: 'MFG Review Bot' })
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: 'User', value: `${userTag} (ID: ${userId})`, inline: false },
      { name: 'Ticket', value: `${ticketName}`, inline: true },
      { name: 'Time', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
      { name: 'Status', value: ok ? '✅ Delivered' : `❌ ${reason}`, inline: false }
    )
    .setFooter({ text: 'MaxFramesGained • Reviews' });

  const transcriptUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl)
  );

  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel?.isTextBased?.()) {
      await logChannel.send({ embeds: [logEmbed], components: [buttons] });
    } else {
      console.warn(`⚠️ Log channel ${LOG_CHANNEL_ID} not found or not text-based.`);
    }
  } catch (e) {
    console.warn('⚠️ Failed to post log embed:', e.message);
  }
}

client.login(DISCORD_TOKEN);
