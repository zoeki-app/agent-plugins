# Zoeki for AI assistants

<img src="assets/logo.png" alt="" width="96" height="96" align="right">

[Zoeki](https://zoeki.app) is your own food, body and training log. This repository packages the Zoeki connector for AI assistants and coding agents, so you can tell your assistant what you ate or how your workout went and it logs it in Zoeki, or ask how your protein is this week and it reads your log before answering.

Every package here points at one remote MCP server, `https://my.zoeki.app/mcp`. You sign in to Zoeki and approve what the assistant may read and log; nothing in this repository holds a key or a client id. Disconnect an assistant any time in Zoeki's settings.

A Zoeki account is required. New accounts start with a 14-day free trial.

<!-- generated:install -->
## Install

The server URL, for any assistant that takes one:

```
https://my.zoeki.app/mcp
```

### Claude (web, Desktop, mobile and Cowork)

[Add Zoeki as a custom connector](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Zoeki&connectorUrl=https%3A%2F%2Fmy.zoeki.app%2Fmcp), then choose **Connect** and sign in.

### Claude Code

```
/plugin marketplace add zoeki-app/agent-plugins
/plugin install zoeki@zoeki-plugins
```

This also adds the Zoeki Coach agent. For the connection alone:

```
claude mcp add --transport http zoeki https://my.zoeki.app/mcp
```

### Cursor and Grok Bot

Open this link to add the server to Cursor:

```
cursor://anysphere.cursor-deeplink/mcp/install?name=zoeki&config=eyJ1cmwiOiJodHRwczovL215LnpvZWtpLmFwcC9tY3AifQ==
```

In Grok Bot, ask in chat: "Add this MCP server: https://my.zoeki.app/mcp". Once Zoeki is listed in the Cursor Marketplace, install it from **Connect apps** instead.

### ChatGPT

In **Settings → Apps & Connectors → Advanced**, turn on **Developer mode**, then **Create** a connector with the server URL and OAuth authentication.

### Codex

```
codex plugin marketplace add zoeki-app/agent-plugins
codex plugin add zoeki@zoeki-plugins
```

Or the connection alone:

```
codex mcp add zoeki --url https://my.zoeki.app/mcp
codex mcp login zoeki
```

### VS Code and GitHub Copilot

```
code --add-mcp '{"name":"zoeki","type":"http","url":"https://my.zoeki.app/mcp"}'
```

### Grok Build

```
grok plugin install zoeki-app/agent-plugins --trust
```

### Gemini CLI

```
gemini extensions install https://github.com/zoeki-app/agent-plugins
```
<!-- /generated:install -->

## What the assistant can do

The server has the same tools everywhere:

- **Read:** your day, goals and nutrient targets, nutrient status against published references, where your nutrients came from, meals, workouts, weekly activity, body trends, strength progress and routines, plus food, barcode and exercise search.
- **Log:** meals, weigh-ins, blood pressure, workouts and lift sets (several in one go), and your own foods and recipes.
- **Change, after asking you:** goals and nutrient targets, and deleting an entry.

Two permissions are offered at sign-in: `read` and `log`.

The packages also include one agent role, **Zoeki Coach** ([`agents/zoeki-coach.md`](agents/zoeki-coach.md)), for platforms that install agents. It logs what you tell it without asking twice and always asks before deleting an entry or changing a goal or target. Assistants without agents get the same guidance from the server itself.

Zoeki describes where a value falls against a published reference. It is not medical advice.

## What's in this repository

| Path | For |
|---|---|
| `plugin.json`, `mcp.json` | [Agent Plugins 1.0](https://agent-plugins.org): Codex and ChatGPT, Cursor, VS Code, Grok Build |
| `.claude-plugin/marketplace.json` | Claude Code marketplace |
| `claude/` | The Claude Code plugin, with its own copies of the server, the agent and the logo |
| `.cursor-plugin/` | Cursor Marketplace, which also serves Grok Bot |
| `.agents/plugins/` | Codex marketplace |
| `.mcp.json` | The server for Cursor and Grok Build |
| `server.json` | MCP Registry (VS Code, GitHub Copilot, Zed) |
| `gemini-extension.json` | Gemini CLI |
| `agents/` | The Zoeki Coach role (Cursor and Grok Bot, Grok Build, Gemini CLI; Claude Code's copy is in `claude/agents/`) |
| `assets/` | Logos |

Every manifest is generated from [`zoeki.plugin.json`](zoeki.plugin.json) by `node scripts/generate.mjs`, which also copies the logo into `claude/`. Don't edit them by hand: `node scripts/check.mjs` (run in CI) fails when a committed file differs from what the generator writes.

## Support

- Help: support@zoeki.app, or [zoeki.app/support](https://zoeki.app/support)
- Privacy: privacy@zoeki.app, or [zoeki.app/privacy](https://zoeki.app/privacy)
- Terms: [zoeki.app/terms](https://zoeki.app/terms)

Zoeki is made by Sevenshores Software. The packaging in this repository is MIT licensed; the Zoeki service is not open source.
