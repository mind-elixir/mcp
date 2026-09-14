import { startMcpBridge } from './bridge.js'

const VERSION = '0.1.5'
const DEFAULT_URL = 'http://127.0.0.1:6595/mcp'

function showHelp() {
  console.error(`
@mind-elixir/mcp v${VERSION}
Model Context Protocol (MCP) stdio-to-HTTP/SSE bridge for Mind Elixir Desktop.

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

EXAMPLES:
  # Default connection (Streamable HTTP at http://127.0.0.1:6595/mcp)
  npx -y @mind-elixir/mcp

  # Custom port
  npx -y @mind-elixir/mcp --port 6595

  # Connect to SSE endpoint (legacy)
  npx -y @mind-elixir/mcp --url http://127.0.0.1:6595/sse
`)
}

async function main() {
  const args = process.argv.slice(2)
  let url = process.env.MIND_ELIXIR_MCP_URL || DEFAULT_URL
  let transport: 'sse' | 'http' | 'auto' = 'auto'
  let port: string | null = null

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-h' || arg === '--help') {
      showHelp()
      process.exit(0)
    } else if (arg === '-v' || arg === '--version') {
      console.error(`@mind-elixir/mcp v${VERSION}`)
      process.exit(0)
    } else if (arg === '-u' || arg === '--url') {
      url = args[++i]
    } else if (arg === '-p' || arg === '--port') {
      port = args[++i]
    } else if (arg === '-t' || arg === '--transport') {
      const val = args[++i]?.toLowerCase()
      if (val === 'sse' || val === 'http') {
        transport = val
      }
    }
  }

  if (port) {
    try {
      const parsed = new URL(url)
      parsed.port = port
      url = parsed.toString()
    } catch {
      url = `http://127.0.0.1:${port}/mcp`
    }
  }

  try {
    await startMcpBridge({
      url,
      transport,
    })
  } catch (err) {
    console.error('[mind-elixir-mcp] Fatal error:', err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[mind-elixir-mcp] Uncaught error:', err)
  process.exit(1)
})
