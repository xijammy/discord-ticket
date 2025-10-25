# MFG Review Bot (Railway + GitHub Ready)

This bot watches your Ticket Tool transcript channel and automatically DMs the Ticket Owner asking for a review. It logs each DM (success or failure) in a log channel with a green/red embed and includes a "View Transcript" button.

## Env Vars (Railway -> Variables)
DISCORD_TOKEN=your bot token
TRANSCRIPT_CHANNEL_ID=ID of 🎟-transcripts
LOG_CHANNEL_ID=ID of review-dm-logs
REVIEW_CHANNEL_ID=ID of 📝-𝙧𝙚𝙫𝙞𝙚𝙬𝙨
IGNORE_USERS=liamtweaks,aidanmo__

## Deploy
1) Upload these files to a GitHub repo
2) Railway: New Project -> Deploy from GitHub
3) Add variables above
4) Invite bot with: View Channels, Read Message History, Send Messages, Embed Links, Send DMs
