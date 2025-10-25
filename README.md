# MFG Review Bot

Listens for Ticket Tool transcript logs, DMs ticket owner to leave a review, logs success/failure as embeds, and is restart-safe.

## Railway deploy
1) Push these files to a GitHub repo.
2) In Railway: New Project -> Deploy from GitHub.
3) Add variables:
   - DISCORD_TOKEN
   - TRANSCRIPT_LOG_CHANNEL (e.g. 🎟-transcripts)
   - REVIEW_CHANNEL (e.g. 📝-𝙧𝙚𝙫𝙞𝙚𝙬𝙨)
   - LOG_CHANNEL (e.g. review-dm-logs)
   - IGNORE_USERS (optional, comma separated username#discriminator or IDs)
4) Start the service. Invite bot with permissions to read/send in those channels.
