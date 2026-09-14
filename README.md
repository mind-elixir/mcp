# Mind Elixir MCP Server

[![npm version](https://img.shields.io/npm/v/@mind-elixir/mcp.svg)](https://www.npmjs.com/package/@mind-elixir/mcp)
[![license](https://img.shields.io/npm/l/@mind-elixir/mcp.svg)](https://github.com/SSShooter/mind-elixir-desktop/blob/master/LICENSE)

**Let AI assistants build and edit real mind maps in [Mind Elixir Desktop](https://app.mind-elixir.com).**

This is the **stdio ↔ HTTP bridge** that connects stdio-only MCP clients — Claude Desktop, Claude Code, Cursor, VS Code, Cline, Roo Code, Windsurf — to the MCP server built into the Mind Elixir Desktop app.

> **Requires Mind Elixir Desktop to be installed and running.** This server is a local controller for the desktop app, not a standalone cloud service. The bridge forwards tool calls to `http://127.0.0.1:6595/mcp` and streams the results back.

- Registry name: `io.github.SSShooter/mind-elixir-mcp`
- npm package: [`@mind-elixir/mcp`](https://www.npmjs.com/package/@mind-elixir/mcp)
- Setup guide: <https://app.mind-elixir.com/blog/use-mcp>

---

## Contents

- [What you can do with it](#what-you-can-do-with-it)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Client configuration](#client-configuration)
- [Connecting without the bridge (HTTP)](#connecting-without-the-bridge-http)
- [Tools reference](#tools-reference)
- [Recommended agent workflow](#recommended-agent-workflow)
- [CLI reference](#cli-reference)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Security and privacy](#security-and-privacy)
- [Development](#development)
- [License](#license)

---

## What you can do with it

Seven tools let an assistant read and mutate the mind map that is currently open in the app:

- Start a fresh map, or replace the current one with a structure the model designed.
- Inspect every topic, node ID, and parent/child relationship in the current map.
- Rename nodes, add child nodes, and get back the ID of what was just created.
- Attach **summary nodes** that collapse a range of siblings into one idea.
- Draw **labelled arrows** between any two nodes to express relationships that the tree cannot.

Typical uses: turning a conversation or a document into a structured map, breaking a project down into a work breakdown structure, summarising a meeting into themes, or having an assistant reorganise notes you already made by hand.

---

## Requirements

| Requirement | Detail |
| --- | --- |
| Mind Elixir Desktop | Installed and **running**. The app hosts the actual MCP server on `127.0.0.1:6595`. |
| Node.js | **18 or newer** — only needed to run the bridge via `npx`, `npm i -g`, or a local install. |
| MCP client | Any client that speaks MCP over stdio, or one that can connect directly to a Streamable HTTP endpoint. |
| Port | `6595` must be free on loopback. Override with `--port` if it is not. |

---

## Quick start

Start Mind Elixir Desktop first, then verify the bridge can reach it:

```bash
npx -y @mind-elixir/mcp@latest
```

A running bridge prints nothing to `stdout` (that channel is reserved for JSON-RPC) and stays in the foreground. Diagnostics go to `stderr`. Quit it with `Ctrl+C`.

To install the CLI globally instead:

```bash
npm install -g @mind-elixir/mcp
mind-elixir-mcp
```

Then configure your MCP client — see the next section.

---

## Client configuration

### Claude Desktop

Edit `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mind-elixir": {
      "command": "npx",
      "args": ["-y", "@mind-elixir/mcp@latest"]
    }
  }
}
```

Restart Claude Desktop after saving.

### Claude Code

```bash
claude mcp add mind-elixir -- npx -y @mind-elixir/mcp@latest
```

### Cursor

Create or edit `~/.cursor/mcp.json` (or use **Settings → Features → MCP → + Add New MCP Server**):

```json
{
  "mcpServers": {
    "mind-elixir": {
      "command": "npx",
      "args": ["-y", "@mind-elixir/mcp@latest"]
    }
  }
}
```

### VS Code (GitHub Copilot agent mode)

Add to `.vscode/mcp.json` in your workspace, or to your user-level `mcp.json`:

```json
{
  "servers": {
    "mind-elixir": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@mind-elixir/mcp@latest"]
    }
  }
}
```

### Cline, Roo Code, Windsurf

These extensions share the `mcpServers` shape used by Cursor:

```json
{
  "mcpServers": {
    "mind-elixir": {
      "command": "npx",
      "args": ["-y", "@mind-elixir/mcp@latest"]
    }
  }
}
```

### Non-default port

If Mind Elixir Desktop is listening somewhere other than `6595`, pass the port through:

```json
{
  "mcpServers": {
    "mind-elixir": {
      "command": "npx",
      "args": ["-y", "@mind-elixir/mcp@latest", "--port", "7000"]
    }
  }
}
```

---

## Connecting without the bridge (HTTP)

If your client can talk **Streamable HTTP** directly, skip this package entirely and point it at the app:

```json
{
  "mcpServers": {
    "mind-elixir": {
      "type": "http",
      "url": "http://127.0.0.1:6595/mcp"
    }
  }
}
```

The app exposes:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/mcp` | `POST` / `GET` | MCP Streamable HTTP endpoint (the one you want). |
| `/ping` | `GET` | Liveness probe; returns `pong`. |

CORS is enabled for the Mind Elixir Cloud origin, so browser-hosted clients can call the local server too.

---

## Tools reference

All tools return a plain-text result. Successful mutations answer with `OK` (or, for `add_child`, the new node's ID); failures come back as a string beginning with `Error:`.

| Tool | Purpose | Returns |
| --- | --- | --- |
| [`new_mindmap`](#new_mindmap) | Create a blank map and switch the app to the editor | `OK` |
| [`get_all_nodes`](#get_all_nodes) | Read the whole current map | Node tree JSON |
| [`generate_mindmap`](#generate_mindmap) | Replace the current map from structured data | `OK` |
| [`edit_topic`](#edit_topic) | Rename a node | `OK` |
| [`add_child`](#add_child) | Add a child node | `Done. New Node's ID is <id>.` |
| [`add_node_summary`](#add_node_summary) | Summarise a range of siblings | `OK` |
| [`add_arrow`](#add_arrow) | Connect two nodes with a labelled arrow | `OK` |

Every tool has a **15-second** operation budget. If the app does not report back in time, the tool returns `Timeout waiting for mindmap operation to complete`.

### `new_mindmap`

Creates a new, empty mind map and navigates the app to its editor page.

*No parameters.*

### `get_all_nodes`

Returns the current map as a nested node tree — every topic, its ID, and its children.

*No parameters.* Shape of the response:

```json
{
  "topic": "Root Topic",
  "id": "1",
  "children": [
    { "topic": "Child Topic", "id": "b3f1c0e2-…", "children": [] }
  ]
}
```

Always call this before editing or adding to a map you did not create in this session — IDs are the only way to address nodes.

### `generate_mindmap`

Replaces the entire current map with the structure you supply.

| Parameter | Type | Description |
| --- | --- | --- |
| `mindmap_data` | string | A JSON string with a `nodeData` root object. |

```json
{
  "nodeData": {
    "topic": "Root Topic",
    "id": "1",
    "children": [
      { "topic": "Child Topic 1", "id": "1-1", "children": [] },
      { "topic": "Child Topic 2", "id": "1-2" }
    ]
  }
}
```

Requirements:

- Every node needs `topic` (string) and `id` (string).
- `children` is optional.
- Use hierarchical numbering (`1`, `1-1`, `1-2`, `2`, `2-1`, …) so later tools can address nodes predictably.

### `edit_topic`

Changes a node's text in place, preserving its position, children, summaries, and arrows.

| Parameter | Type | Description |
| --- | --- | --- |
| `node_id` | string | ID of the node to rename, e.g. `1`, `1-1`, or a UUID. |
| `topic` | string | The new topic text. |

Returns `Error: Node not found` if `node_id` does not exist — call `get_all_nodes` to refresh your view.

### `add_child`

Adds a child node under an existing parent. The app generates the ID, so the result carries it.

| Parameter | Type | Description |
| --- | --- | --- |
| `parent_id` | string | ID of the parent node. |
| `topic` | string | Topic text for the new child. |

Returns `Done. New Node's ID is <id>.` — keep that ID if you plan to edit the node later. Returns `Error: Parent node not found` when the parent is missing.

### `add_node_summary`

Attaches a summary node that consolidates a contiguous range of a parent's children.

| Parameter | Type | Description |
| --- | --- | --- |
| `text` | string | The summary text. |
| `parent` | string | ID of the parent whose children are being summarised. |
| `start` | integer | Zero-based index of the **first** child to include. |
| `end` | integer | Zero-based index of the **last** child to include (**inclusive**). |

Example — summarise the first three children of node `1`:

```json
{ "text": "These three all concern onboarding", "parent": "1", "start": 0, "end": 2 }
```

### `add_arrow`

Draws a labelled connection between two nodes, for relationships the tree cannot express.

| Parameter | Type | Description |
| --- | --- | --- |
| `label` | string | Text shown on or near the arrow, e.g. `leads to`, `depends on`. |
| `from` | string | ID of the source node. |
| `to` | string | ID of the target node. |
| `bidirectional` | boolean | `true` for ↔, `false` for →. |

---

## Recommended agent workflow

1. **Orient first.** Call `get_all_nodes` to learn the real IDs and structure before touching anything. Never assume an ID.
2. **Decide between build and patch.** For a brand-new map use `generate_mindmap` with hierarchical IDs. For incremental work on an existing map use `add_child` and `edit_topic`.
3. **Capture generated IDs.** `add_child` returns a UUID — record it if the node will be edited again.
4. **Do not rely on the app being on the editor page.** Any tool call brings the app to the front and opens the editor; if it was not already editing a map, a new blank map is created first. So always confirm the current state with `get_all_nodes` before a write.
5. **Keep calls sequential.** Mutations are applied in order, and there is no undo exposed over MCP.

---

## CLI reference

```text
USAGE:
  npx -y @mind-elixir/mcp [options]

OPTIONS:
  -u, --url <url>            Target Mind Elixir MCP URL (default: http://127.0.0.1:6595/mcp)
  -p, --port <port>          Change target port (default: 6595)
  -t, --transport <sse|http> Force transport mode ('sse' or 'http', default: auto)
  -v, --version              Show version
  -h, --help                 Show this help message

ENVIRONMENT VARIABLES:
  MIND_ELIXIR_MCP_URL        Target URL to connect to
```

The package installs two equivalent binaries: **`mind-elixir-mcp`** and **`mcp`**.

Transport selection in `auto` mode: if the target URL path ends with `/mcp`, Streamable HTTP is used; otherwise the bridge falls back to the legacy SSE transport. Force one with `--transport`.

---

## How it works

```text
+--------------------------+
| Claude Desktop / Cursor  |
+------------+-------------+
             | stdio (stdin / stdout), JSON-RPC
             v
+------------+-------------+
|    @mind-elixir/mcp      |   bridge process
+------------+-------------+
             | Streamable HTTP -> http://127.0.0.1:6595/mcp
             v
+------------+-------------+
|  Mind Elixir Desktop     |   Tauri app, owns the tools
+--------------------------+
```

1. The bridge translates stdio JSON-RPC messages into HTTP requests and streams responses back verbatim.
2. **Startup is tolerant.** If the app is still booting, messages are buffered and replayed in strict FIFO order once the connection is established. The bridge retries the connection three times, one second apart.
3. **Protocol version is negotiated.** The bridge starts at `2024-11-05` and adopts whatever version the `initialize` handshake settles on, forwarding it to the app.
4. **Failures are explicit.** If the app never becomes reachable, every buffered request receives a JSON-RPC error (`-32000`) reading `Mind Elixir Desktop is not running. Please open Mind Elixir Desktop and try again. (<url>)`, `stderr` gets a human-readable explanation, and the process exits with code `1`. Errors raised during an operation are returned to the caller as their original message rather than being swallowed.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Mind Elixir Desktop is not running` | Launch the desktop app, then reconnect the MCP server in your client. |
| Tool call returns `Timeout waiting for mindmap operation to complete` | The app did not respond within 15 s — usually a modal dialog or a busy window. Bring the app to the front and retry. |
| Connection refused on `6595` | The port is taken by another process, or the app is on a different port. Restart the app, or pass `--port <port>` / set `MIND_ELIXIR_MCP_URL`. |
| The client lists no tools | Confirm the bridge starts by running `npx -y @mind-elixir/mcp@latest` in a terminal, then restart the client so it re-reads its MCP config. |
| A blank map appeared unexpectedly | The app was not on an editor page when a tool ran, so it created one. Read the map with `get_all_nodes` before writing. |
| `Error: Node not found` / `Error: Parent node not found` | The ID is stale or comes from a different map. Re-read with `get_all_nodes`. |
| Nothing appears in the client's log | All bridge diagnostics go to `stderr`; `stdout` carries protocol traffic only. |

---

## Security and privacy

- The app's MCP server binds **`127.0.0.1` only** — it is never exposed to your network, and it has **no authentication**. Any local process on your machine can drive the app through it, so treat port `6595` like any other local control surface.
- The bridge is a local child process of your MCP client. It reads and writes nothing on disk; the only network traffic is the loopback HTTP call to the app.
- Everything happens on your machine. No mind map content, prompt, or telemetry is sent to a server by this package or by the desktop app's MCP endpoint.
- Grant the server the same care you would give any tool that edits your documents: it can rewrite the map you have open. Prefer clients configured to ask before running tools when you are working on something important.

---

## Development

```bash
cd packages/mcp
pnpm install
pnpm build     # tsup -> dist/index.js
pnpm dev       # tsup --watch
```

The build emits a single bundled ESM file with a `#!/usr/bin/env node` shebang; `prepublishOnly` rebuilds before every `npm publish`.

---

## License

MIT © [SSShooter](https://github.com/SSShooter)
