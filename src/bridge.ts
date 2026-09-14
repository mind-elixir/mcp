import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

export interface BridgeOptions {
  url: string
  transport?: 'sse' | 'http' | 'auto'
  maxRetries?: number
  retryIntervalMs?: number
}

function extractProtocolVersion(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null
  const msg = message as Record<string, unknown>
  const params = msg.params as Record<string, unknown> | undefined
  if (params && typeof params === 'object') {
    const meta = params._meta as Record<string, unknown> | undefined
    if (meta && typeof meta === 'object') {
      const v = meta['io.modelcontextprotocol/protocolVersion'] || meta.protocolVersion
      if (typeof v === 'string') return v
    }
    if (typeof params.protocolVersion === 'string') {
      return params.protocolVersion
    }
  }
  return null
}

interface VersionedTransport {
  setProtocolVersion: (version: string) => void
}

function hasSetProtocolVersion(transport: unknown): transport is VersionedTransport {
  return (
    typeof transport === 'object' &&
    transport !== null &&
    'setProtocolVersion' in transport &&
    typeof (transport as { setProtocolVersion?: unknown }).setProtocolVersion === 'function'
  )
}

function createTransport(targetUrl: URL, transportMode?: 'sse' | 'http' | 'auto'): Transport {
  const useStreamableHttp =
    transportMode === 'http' ||
    (transportMode !== 'sse' && targetUrl.pathname.endsWith('/mcp'))

  if (useStreamableHttp) {
    const transport = new StreamableHTTPClientTransport(targetUrl)
    transport.setProtocolVersion('2024-11-05')
    return transport
  }
  return new SSEClientTransport(targetUrl)
}

export async function startMcpBridge(options: BridgeOptions): Promise<void> {
  const targetUrl = new URL(options.url)
  const maxRetries = options.maxRetries ?? 3
  const retryIntervalMs = options.retryIntervalMs ?? 1000

  // 1. Initialize stdio transport for the AI client (Claude Desktop, Cursor, etc.)
  const stdioTransport = new StdioServerTransport()

  // Track the negotiated or requested protocol version
  let currentProtocolVersion = '2024-11-05'

  // Message queue to buffer client messages while connecting to desktop app
  const pendingMessages: JSONRPCMessage[] = []
  let isTargetConnected = false
  let activeTargetTransport: Transport | null = null

  // Ensure all messages sent to target HTTP/SSE are strictly sequential (FIFO)
  // to prevent race conditions where tools/list arrives before notifications/initialized
  let sendChain = Promise.resolve()

  const queueSend = (message: JSONRPCMessage) => {
    sendChain = sendChain
      .then(async () => {
        if (!activeTargetTransport) return

        // Update protocol version on target transport if specified in message
        const reqVersion = extractProtocolVersion(message)
        if (reqVersion) {
          currentProtocolVersion = reqVersion
        }
        if (hasSetProtocolVersion(activeTargetTransport)) {
          activeTargetTransport.setProtocolVersion(currentProtocolVersion)
        }

        await activeTargetTransport.send(message)
      })
      .catch(async (err) => {
        console.error('[mind-elixir-mcp] Failed to forward message to Mind Elixir Desktop:', err)
        // If message is a request with an id, reply with a JSON-RPC error so the client doesn't hang
        if (typeof message === 'object' && message !== null && 'id' in message && message.id !== undefined) {
          try {
            let errorPayload = {
              code: -32000,
              message: err instanceof Error ? err.message : String(err),
            }
            if (err instanceof Error && err.message.includes('Error POSTing to endpoint:')) {
              const rawJson = err.message.replace(/^.*Error POSTing to endpoint:\s*/, '')
              try {
                const parsed = JSON.parse(rawJson)
                if (parsed.error) {
                  errorPayload = parsed.error
                }
              } catch {
                // ignore JSON parse error and fallback to default errorPayload
              }
            }
            await stdioTransport.send({
              jsonrpc: '2.0',
              id: message.id,
              error: errorPayload,
            })
          } catch {
            // ignore failure to send error response to stdioTransport
          }
        }
      })
    return sendChain
  }

  stdioTransport.onmessage = async (message: JSONRPCMessage) => {
    if (!isTargetConnected || !activeTargetTransport) {
      pendingMessages.push(message)
    } else {
      queueSend(message)
    }
  }

  await stdioTransport.start()

  // Handle client process termination
  const cleanup = async () => {
    try {
      if (activeTargetTransport) {
        await activeTargetTransport.close()
      }
    } catch {
      // ignore close errors during cleanup
    }
    try {
      await stdioTransport.close()
    } catch {
      // ignore close errors during cleanup
    }
    process.exit(0)
  }

  stdioTransport.onclose = () => {
    cleanup()
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  // 2. Connect to Mind Elixir Desktop with retry
  let connected = false
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const candidate = createTransport(targetUrl, options.transport)
    try {
      await candidate.start()
      activeTargetTransport = candidate
      connected = true
      break
    } catch (err) {
      lastError = err
      try {
        await candidate.close()
      } catch {
        // ignore close error during retry
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryIntervalMs))
      }
    }
  }

  if (!connected || !activeTargetTransport) {
    const errorMsg =
      `Could not connect to Mind Elixir Desktop at ${targetUrl.toString()}.\n` +
      `Please ensure Mind Elixir Desktop is currently open and running.\n` +
      `Details: ${lastError instanceof Error ? lastError.message : String(lastError)}`

    console.error(`[mind-elixir-mcp] ERROR: ${errorMsg}`)

    // Answer any buffered request (e.g. initialize) with a JSON-RPC error
    for (const msg of pendingMessages) {
      if (typeof msg === 'object' && msg !== null && 'id' in msg && msg.id !== undefined) {
        try {
          await stdioTransport.send({
            jsonrpc: '2.0',
            id: msg.id,
            error: {
              code: -32000,
              message: `Mind Elixir Desktop is not running. Please open Mind Elixir Desktop and try again. (${targetUrl.toString()})`,
            },
          })
        } catch {
          // ignore error sending fallback response
        }
      }
    }

    // Give a brief moment for the stdio message to flush before exiting
    setTimeout(() => {
      process.exit(1)
    }, 100)
    return
  }

  // 3. Bind events for connected transport
  activeTargetTransport.onmessage = async (message: JSONRPCMessage) => {
    // If initialize result is received, update currentProtocolVersion
    if (typeof message === 'object' && message !== null && 'result' in message) {
      const res = (message as Record<string, unknown>).result as Record<string, unknown> | undefined
      if (res && typeof res === 'object' && typeof res.protocolVersion === 'string') {
        currentProtocolVersion = res.protocolVersion
        if (hasSetProtocolVersion(activeTargetTransport)) {
          activeTargetTransport.setProtocolVersion(currentProtocolVersion)
        }
      }
    }
    try {
      await stdioTransport.send(message)
    } catch (err) {
      console.error('[mind-elixir-mcp] Failed to forward message to client:', err)
    }
  }

  activeTargetTransport.onerror = (err: Error) => {
    console.error('[mind-elixir-mcp] Target connection error:', err.message || err)
  }

  activeTargetTransport.onclose = () => {
    console.error('[mind-elixir-mcp] Connection to Mind Elixir Desktop closed.')
    process.exit(0)
  }

  isTargetConnected = true

  // 4. Flush buffered messages strictly in FIFO order
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift()!
    await queueSend(msg)
  }
}
