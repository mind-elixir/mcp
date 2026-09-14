# Mind Elixir MCP Server

[![npm version](https://img.shields.io/npm/v/@mind-elixir/mcp.svg)](https://www.npmjs.com/package/@mind-elixir/mcp)
[![license](https://img.shields.io/npm/l/@mind-elixir/mcp.svg)](https://github.com/SSShooter/mind-elixir-desktop/blob/master/LICENSE)

**让 AI 助手直接在 [Mind Elixir Desktop](https://app.mind-elixir.com) 里创建和编辑真正的思维导图。**

本包是一个 **stdio ↔ HTTP 桥接进程**，把只支持 stdio 的 MCP 客户端（Claude Desktop、Claude Code、Cursor、VS Code、Cline、Roo Code、Windsurf）接到 Mind Elixir Desktop 内置的 MCP 服务上。

> **使用前必须安装并启动 Mind Elixir Desktop。** 这不是一个可以独立运行的云端服务，而是桌面应用的本地控制器：桥接进程把工具调用转发到 `http://127.0.0.1:6595/mcp`，再把结果原样回传。

- Registry 名称：`io.github.SSShooter/mind-elixir-mcp`
- npm 包：[`@mind-elixir/mcp`](https://www.npmjs.com/package/@mind-elixir/mcp)
- 配置教程：<https://app.mind-elixir.com/blog/use-mcp>

---

## 目录

- [能做什么](#能做什么)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [客户端配置](#客户端配置)
- [不走桥接进程（直连 HTTP）](#不走桥接进程直连-http)
- [工具参考](#工具参考)
- [推荐的调用顺序](#推荐的调用顺序)
- [命令行参数](#命令行参数)
- [工作原理](#工作原理)
- [故障排查](#故障排查)
- [安全与隐私](#安全与隐私)
- [本地开发](#本地开发)
- [许可证](#许可证)

---

## 能做什么

7 个工具，让助手读写当前在应用里打开的思维导图：

- 新建一张空导图，或用模型设计的结构整体替换当前导图。
- 读取当前导图的全部主题、节点 ID 与父子层级。
- 重命名节点、添加子节点，并拿到刚创建节点的 ID。
- 给一段连续的子节点挂上**概要（summary）**节点，把若干想法收拢成一条。
- 在任意两个节点之间画**带标签的关联箭头**，表达树结构装不下的关系。

典型场景：把一段对话或一篇文章整理成结构图、把项目拆成工作分解结构（WBS）、把会议内容归纳成主题、让助手重新组织你手写的笔记。

---

## 环境要求

| 项目 | 说明 |
| --- | --- |
| Mind Elixir Desktop | 已安装且**正在运行**。真正的 MCP 服务由应用在 `127.0.0.1:6595` 上提供。 |
| Node.js | **18 及以上**，仅在通过 `npx`、全局安装或本地安装运行桥接进程时需要。 |
| MCP 客户端 | 任何支持 stdio 的客户端，或能直接连接 Streamable HTTP 端点的客户端。 |
| 端口 | 本机回环地址上的 `6595` 需空闲；被占用时用 `--port` 覆盖。 |

---

## 快速开始

先启动 Mind Elixir Desktop，再验证桥接进程能否连上：

```bash
npx -y @mind-elixir/mcp@latest
```

运行中的桥接进程**不会**在 `stdout` 输出任何内容（该通道专供 JSON-RPC），诊断信息一律走 `stderr`。按 `Ctrl+C` 退出。

也可以全局安装：

```bash
npm install -g @mind-elixir/mcp
mind-elixir-mcp
```

接着按下节配置你的 MCP 客户端。

---

## 客户端配置

### Claude Desktop

编辑 `claude_desktop_config.json`：

- **macOS**：`~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**：`%APPDATA%\Claude\claude_desktop_config.json`

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

保存后重启 Claude Desktop。

### Claude Code

```bash
claude mcp add mind-elixir -- npx -y @mind-elixir/mcp@latest
```

### Cursor

编辑 `~/.cursor/mcp.json`（或在 **Settings → Features → MCP → + Add New MCP Server** 中配置）：

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

### VS Code（GitHub Copilot agent 模式）

写入工作区的 `.vscode/mcp.json`，或用户级 `mcp.json`：

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

### Cline、Roo Code、Windsurf

这几个扩展共用与 Cursor 相同的 `mcpServers` 结构：

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

### 非默认端口

如果应用监听的不是 `6595`，把端口透传进去：

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

## 不走桥接进程（直连 HTTP）

如果你的客户端原生支持 **Streamable HTTP**，可以完全跳过本包，直接指向应用：

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

应用暴露的端点：

| 端点 | 方法 | 用途 |
| --- | --- | --- |
| `/mcp` | `POST` / `GET` | MCP Streamable HTTP 端点（通常就用这个）。 |
| `/ping` | `GET` | 存活探测，返回 `pong`。 |

CORS 已为 Mind Elixir Cloud 的来源放开，因此托管在浏览器里的客户端也可以调用这个本地服务。

---

## 工具参考

所有工具返回纯文本。成功的写操作返回 `OK`（`add_child` 例外，会返回新节点 ID）；失败时返回以 `Error:` 开头的字符串。

| 工具 | 用途 | 返回值 |
| --- | --- | --- |
| [`new_mindmap`](#new_mindmap) | 新建空白导图并切到编辑页 | `OK` |
| [`get_all_nodes`](#get_all_nodes) | 读取当前导图全量结构 | 节点树 JSON |
| [`generate_mindmap`](#generate_mindmap) | 用结构化数据整体替换导图 | `OK` |
| [`edit_topic`](#edit_topic) | 重命名节点 | `OK` |
| [`add_child`](#add_child) | 添加子节点 | `Done. New Node's ID is <id>.` |
| [`add_node_summary`](#add_node_summary) | 为一组兄弟节点生成概要 | `OK` |
| [`add_arrow`](#add_arrow) | 用带标签的箭头连接两个节点 | `OK` |

每个工具的单次操作预算是 **15 秒**。超时后返回 `Timeout waiting for mindmap operation to complete`。

### `new_mindmap`

新建一张空白思维导图，并把应用切到它的编辑页。

*无参数。*

### `get_all_nodes`

以嵌套节点树的形式返回当前导图 —— 每个主题、它的 ID 和子节点。

*无参数。* 返回结构：

```json
{
  "topic": "Root Topic",
  "id": "1",
  "children": [
    { "topic": "Child Topic", "id": "b3f1c0e2-…", "children": [] }
  ]
}
```

凡是要修改一张不是本次会话里新建的导图，**先调用它**——ID 是唯一定位节点的方式。

### `generate_mindmap`

用你提供的结构整体替换当前导图。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `mindmap_data` | string | 含 `nodeData` 根对象的 JSON 字符串。 |

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

要求：

- 每个节点都必须有 `topic`（字符串）和 `id`（字符串）。
- `children` 可省略。
- 建议使用层级编号（`1`、`1-1`、`1-2`、`2`、`2-1`……），方便后续工具稳定寻址。

### `edit_topic`

就地修改节点文字，保留其位置、子节点、概要与箭头。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `node_id` | string | 要改的节点 ID，例如 `1`、`1-1` 或 UUID。 |
| `topic` | string | 新的主题文字。 |

`node_id` 不存在时返回 `Error: Node not found`，此时用 `get_all_nodes` 刷新视图。

### `add_child`

在已有父节点下添加子节点。ID 由应用生成，因此结果里会带回来。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `parent_id` | string | 父节点 ID。 |
| `topic` | string | 新子节点的主题文字。 |

返回 `Done. New Node's ID is <id>.` —— 如果之后还要编辑这个节点，请记下这个 ID。父节点不存在时返回 `Error: Parent node not found`。

### `add_node_summary`

给某个父节点下**连续一段**子节点挂概要节点。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `text` | string | 概要内容。 |
| `parent` | string | 被子节点所属的父节点 ID。 |
| `start` | integer | 起始子节点的**零基**下标。 |
| `end` | integer | 结束子节点的**零基**下标（**含**该节点）。 |

示例 —— 汇总节点 `1` 的前三个子节点：

```json
{ "text": "These three all concern onboarding", "parent": "1", "start": 0, "end": 2 }
```

### `add_arrow`

在两个节点之间画一条带标签的连线，用于表达树结构装不下的关系。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `label` | string | 显示在箭头上的文字，例如 `leads to`、`depends on`。 |
| `from` | string | 起点节点 ID。 |
| `to` | string | 终点节点 ID。 |
| `bidirectional` | boolean | `true` 为双向 ↔，`false` 为单向 →。 |

---

## 推荐的调用顺序

1. **先勘察。** 动手前先调 `get_all_nodes` 摸清真实 ID 和结构，不要臆测 ID。
2. **区分「重建」和「增量」。** 全新导图用 `generate_mindmap` 配层级 ID；在已有导图上做增量修改用 `add_child` 和 `edit_topic`。
3. **接住生成的 ID。** `add_child` 返回 UUID，后续还要改就记下来。
4. **别假设应用停在编辑页。** 任何工具调用都会把应用窗口前置并打开编辑器；如果当时并不在编辑某张图，会先新建一张空白图。因此写操作前先用 `get_all_nodes` 确认当前状态。
5. **串行调用。** 变更按顺序生效，且 MCP 侧没有暴露撤销能力。

---

## 命令行参数

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

本包安装两个等价的命令：**`mind-elixir-mcp`** 与 **`mcp`**。

`auto` 模式下的传输选择规则：目标 URL 的路径以 `/mcp` 结尾则使用 Streamable HTTP，否则回退到旧的 SSE 传输。也可以用 `--transport` 强制指定。

---

## 工作原理

```text
+--------------------------+
| Claude Desktop / Cursor  |
+------------+-------------+
             | stdio（stdin / stdout），JSON-RPC
             v
+------------+-------------+
|    @mind-elixir/mcp      |   桥接进程
+------------+-------------+
             | Streamable HTTP -> http://127.0.0.1:6595/mcp
             v
+------------+-------------+
|  Mind Elixir Desktop     |   Tauri 应用，工具的实际宿主
+--------------------------+
```

1. 桥接进程把 stdio 上的 JSON-RPC 消息翻译成 HTTP 请求，并把响应原样回传。
2. **启动阶段有容错。** 如果应用还在启动，消息会被缓存，连接建立后按严格的 FIFO 顺序补发。连接最多重试 3 次，间隔 1 秒。
3. **协议版本会协商。** 桥接进程初始使用 `2024-11-05`，随后采用 `initialize` 握手确定的版本，并同步给应用。
4. **失败是显式的。** 如果始终连不上应用，每个被缓存的请求都会收到一个 JSON-RPC 错误（`-32000`），内容为 `Mind Elixir Desktop is not running. Please open Mind Elixir Desktop and try again. (<url>)`；`stderr` 会打印人类可读的原因，进程以退出码 `1` 结束。操作过程中抛出的错误也会把原始信息回传给调用方，不会被吞掉。

---

## 故障排查

| 现象 | 原因与处理 |
| --- | --- |
| `Mind Elixir Desktop is not running` | 启动桌面应用，然后在客户端里重连这个 MCP 服务。 |
| 工具返回 `Timeout waiting for mindmap operation to complete` | 应用 15 秒内没有回应，通常是弹了模态框或窗口正忙。把应用切到前台后重试。 |
| `6595` 连接被拒 | 端口被别的进程占用，或应用监听在别的端口。重启应用，或改用 `--port <port>` / 设置 `MIND_ELIXIR_MCP_URL`。 |
| 客户端里看不到任何工具 | 先在终端跑 `npx -y @mind-elixir/mcp@latest` 确认桥接进程能启动，再重启客户端让它重新读取 MCP 配置。 |
| 意外多出一张空白图 | 调用工具时应用不在编辑页，于是自动新建了一张。写操作前先用 `get_all_nodes` 读一遍。 |
| `Error: Node not found` / `Error: Parent node not found` | ID 已失效或来自另一张图。用 `get_all_nodes` 重新读取。 |
| 客户端日志里什么都没有 | 桥接进程的诊断信息全部走 `stderr`，`stdout` 只承载协议流量。 |

---

## 安全与隐私

- 应用的 MCP 服务只绑定 **`127.0.0.1`**，不会暴露到局域网，并且**没有鉴权**。本机上的任何进程都能通过它操作应用，请把 `6595` 当作一个本地控制面来对待。
- 桥接进程是你 MCP 客户端的本地子进程，不读写任何磁盘文件，唯一的网络流量就是到应用的回环 HTTP 调用。
- 一切都在本机完成。本包与桌面端的 MCP 端点都不会把导图内容、提示词或遥测发往服务器。
- 请像对待任何能改你文档的工具一样对待它：它可以重写你当前打开的那张图。处理重要内容时，建议使用「执行工具前先询问」的客户端配置。

---

## 本地开发

```bash
cd packages/mcp
pnpm install
pnpm build     # tsup -> dist/index.js
pnpm dev       # tsup --watch
```

构建产物是单个打包后的 ESM 文件，带 `#!/usr/bin/env node` shebang；`prepublishOnly` 会在每次 `npm publish` 前重新构建。

---

## 许可证

MIT © [SSShooter](https://github.com/SSShooter)
