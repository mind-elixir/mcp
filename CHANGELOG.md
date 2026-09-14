# Changelog

All notable changes to `@mind-elixir/mcp`.

Versions before `0.1.5` were released from the `mind-elixir-desktop` monorepo before this package moved to its own repository; they are not documented here.

## 0.1.5

- Add `mcpName` to `package.json` and a `server.json` manifest so the server can be published to the official MCP Registry.
- Declare the tool list, categories, keywords and `longDescription` as publisher-provided metadata.
- Point `repository` and `bugs` at the standalone `mind-elixir/mcp` repository.
- Add an MIT `LICENSE` and a `.gitignore`; stop tracking `node_modules` and build output.
