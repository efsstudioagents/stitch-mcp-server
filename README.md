# stitch-mcp-server

MCP server for [Google Stitch](https://stitch.withgoogle.com/) — AI-powered UI generation.

Dynamically registers all tools from the `@google/stitch-sdk` at startup, so new Stitch tools are automatically available without code changes.

## Tools

All tools are prefixed with `stitch_` and auto-discovered from the SDK at runtime (e.g. `stitch_create_project`, `stitch_list_screens`, `stitch_generate_component`, etc).

## Setup

### 1. Get your Stitch API key

Go to [Stitch Dashboard](https://stitch.withgoogle.com/) → Settings → API Keys.

### 2. Install and build

```bash
npm install
npm run build
```

### 3. Configure Claude Code

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "stitch": {
      "command": "node",
      "args": ["/path/to/stitch-mcp-server/dist/index.js"],
      "env": {
        "STITCH_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Restart Claude Code — the tools will be available immediately.

## Requirements

- Node.js >= 18
- Google Stitch account + API key
