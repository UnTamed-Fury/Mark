# AnimeX Unified Mark Bot

A high-performance, cross-platform utility bot for AnimeX across **Discord** (`discord.js` v14) and **Fluxer** (`@fluxerjs/core` v3.0).

---

## Features

- **Unified Cross-Platform Core**: Shared auto-responder engine, centralized command data, FAQ database, and cooldown manager.
- **Dynamic Platform Bootloader**: Automatically starts Discord, Fluxer, or both concurrently based on configured environment tokens.
- **5-Stage Filter Auto-Responder**: Natural language scanner with typo tolerance and exclusion gates to answer website queries.
- **Rate Limit & Anti-Spam**: 15s same-channel and 5s cross-channel cooldowns with VIP bypass for owner and developer.
- **Obsidian Black Embeds**: Custom branded embeds with timestamping and official links.

---

## Commands

| Command | Aliases | Description |
|---|---|---|
| `+website` | `site`, `url`, `link`, `domain`, `web`, `address` | Official AnimeX website and portal links |
| `+drama` | `kissasian`, `asiandrama`, `asian`, `kdrama`, `dramas` | KissAsian sister site for Asian dramas & movies |
| `+9anime` | `nineanime`, `9a` | 9Anime legacy streaming portal |
| `+boost` | `perks`, `serverboost`, `boosts`, `nitro` | Server boost perks and role rewards |
| `+rules` | `rule`, `guidelines` | Server rules and guidelines channel |
| `+anime` | `info`, `about`, `bot`, `status`, `animex` | About AnimeX and sister portals |
| `+ticket` | `support`, `tickets`, `contact`, `helpdesk`, `issue` | Support tickets channel |
| `+download` | `downloads`, `dl`, `save` | Download guide and batch drive instructions |
| `+ping` | `latency`, `ms`, `pong` | WebSocket connection latency |
| `+faq [category]` | `questions`, `qna`, `ask` | 11 FAQ categories or full FAQ index |
| `+help [command]` | `h`, `commands`, `cmd`, `cmds` | Command list or specific command documentation |

---

## Quick Start

```bash
# 1. Clone & Install
git clone https://github.com/UnTamed-Fury/Mark.git
cd Mark
pnpm install

# 2. Configure Environment
cp .env.example .env
# Add your secret tokens to .env (DISCORD_BOT_TOKEN / FLUXER_BOT_TOKEN)
# Non-secret options (prefix, server IDs) can be tuned in .config.mark or .config.mark.local

# 3. Verify & Build
pnpm lint
pnpm test
pnpm build

# 4. Start Bot
pnpm start
```

---

## License

[MIT](LICENSE) © 2026 AnimeX Team
