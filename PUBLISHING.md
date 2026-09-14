# MCP 商店提交手册

面向 `packages/mcp`（`@mind-elixir/mcp`）的发布与收录操作流程。**本文件不随 npm 包发布**，仅作为仓库内运维文档。

---

## 0. 现状盘点

截至 2026-09-14：

| 项目 | 状态 |
| --- | --- |
| npm 已发布版本 | `0.1.0`（09-10）、`0.1.1`（09-10）、`0.1.2`（09-10）、`0.1.4`（09-14） |
| npm `latest` tag | 指向 `0.1.4` |
| `mcpName` 字段 | **已发布的 0.1.2 与 0.1.4 实测都没有**，因此无法通过官方 Registry 的所有权校验 |
| `server.json` | 本次新增于 `packages/mcp/server.json` |
| 仓库可见性 | `github.com/SSShooter/mind-elixir-desktop` 返回 **404（私有）** |
| Registry 名称 | `io.github.SSShooter/mind-elixir-mcp` |

> 结论：**必须发一个新版本（`0.1.5`）**。npm 不允许修改已发布版本的 `package.json`，而官方 Registry 校验的是 npm 上那个版本的 `mcpName` 字段。

---

## 1. 官方 MCP Registry

地址：<https://registry.modelcontextprotocol.io>　规范：`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`

官方 Registry 只托管**元数据**，不托管产物；产物仍然在 npm。它是生态的元数据源头，Glama、PulseMCP、mcp.so、LobeHub 等聚合站大多从这里或从 GitHub 仓库拉取。

### 1.1 为什么必须写 `io.github.SSShooter`（大写 S）

这不是风格问题，写错会直接发布失败。

GitHub 登录授权时，Registry 会把你的 GitHub 登录名原样拼成权限前缀：

```go
// registry/internal/api/handlers/v0/auth/github_at.go
ResourcePattern: fmt.Sprintf("io.github.%s/*", username)   // username = GitHub 返回的 Login，即 "SSShooter"
```

鉴权时用的是**区分大小写**的前缀匹配：

```go
// registry/internal/auth/jwt.go
func isResourceMatch(resource, pattern string) bool {
    if strings.HasSuffix(pattern, "*") {
        return strings.HasPrefix(resource, strings.TrimSuffix(pattern, "*"))
    }
    ...
}
```

所以 `server.json` 的 `name` 与 `package.json` 的 `mcpName` 都必须是 `io.github.SSShooter/mind-elixir-mcp`，**不能小写**。写成小写会得到 `You do not have permission to publish this server`。

### 1.2 发布步骤

```bash
# 1) 构建并确认产物
cd packages/mcp
pnpm install
pnpm build

# 2) 发布到 npm（必须先于 Registry，Registry 会去 npm 校验这个版本存在且带 mcpName）
npm publish --access public
npm view @mind-elixir/mcp dist-tags      # 确认 latest 指向 0.1.5

# 3) 安装发布工具
brew install mcp-publisher               # 或从 GitHub Releases 下载二进制

# 4) 先本地校验，再登录发布
cd packages/mcp
mcp-publisher validate
mcp-publisher login github               # 走 GitHub device flow
mcp-publisher publish

# 5) 验证
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.SSShooter/mind-elixir-mcp"
```

期望输出：

```text
✓ Successfully published
✓ Server io.github.SSShooter/mind-elixir-mcp version 0.1.5
```

### 1.3 常见报错对照

| 报错 | 处理 |
| --- | --- |
| `Registry validation failed for package` | npm 上那个版本没有 `mcpName`，或值与 `server.json` 的 `name` 不一致。 |
| `You do not have permission to publish this server` | 命名空间不匹配。检查大小写是否为 `io.github.SSShooter`。 |
| `Invalid or expired Registry JWT token` | token 过期，重新执行 `mcp-publisher login github`。 |

---

## 2. 聚合站

| 平台 | 收录方式 | 本项目需要做什么 |
| --- | --- | --- |
| **PulseMCP** | 从官方 Registry 自动摄取 | 无。Registry 发布完成后等同步即可。 |
| **Glama** | 从 GitHub 仓库 + 官方 Registry 每日同步 | 代码推到 `main` 后等自动同步；建议再走一次 Claim 认领。 |
| **mcp.so** | 站内自主提交 | 到 <https://mcp.so/submit> 填表提交。 |
| **LobeHub** | 官方 CLI 发布 | 见 <https://lobehub.com/publish-mcp>，按其 `skill.md` 走 CLI。 |
| **Smithery** | ① 公网 HTTPS 的 Streamable HTTP 端点　② 本地 stdio 用 `.mcpb` 包分发 | **两条路当前都不顺**，见下。 |

### Glama

Glama 每天从 GitHub 仓库同步，`main` 上推了新内容就会更新。认领（Claim）后可解锁分析、缩略图与健康检查。认领需证明控制权，三选一：

- **GitHub identity**：登录与命名空间匹配的 GitHub 账号（对 `io.github.SSShooter/*` 最省事）。
- **HTTP challenge**：在服务同源放 `/.well-known/glama.json`。
- **DNS challenge**：加一条 TXT 记录。

注意：与官方 Registry 关联的条目，默认会被 Registry 的 name / description / URL 覆盖；若要保留 Glama 上的自定义内容，认领后在 **Manage connector** 里打开 “Use Glama listing details as the source of truth”。

### Smithery 为什么暂时不适合

Smithery 的发布路径只有两条：

1. **URL 托管**：需要一个**公网 HTTPS** 且实现 Streamable HTTP 的端点。本服务固定绑定 `127.0.0.1:6595`，且必须由用户本机的桌面应用提供服务，**无法托管到云上**。
2. **本地 stdio（`.mcpb` bundle）**：客户端下载后在本机运行的 MCP Bundle。这条路理论上可行——`tsup` 配置了 `noExternal: [/.*/]`，`dist/index.js` 已经是单文件打包产物，适合塞进 `server.type: "node"` 的 MCPB。

> 若后续要做 Smithery，正确的做法是构建 `.mcpb`（`manifest.json` + `dist/index.js`），而不是 `smithery.yaml` 或 Dockerfile——容器化会把 `127.0.0.1` 隔离掉，反而连不上宿主机的桌面应用。

---

## 3. 待决策的前置阻塞项

### 3.1 仓库是私有的

`server.json` 里写了 `repository` 指向 `https://github.com/SSShooter/mind-elixir-desktop`，但该仓库目前返回 404（私有）。影响：

- 官方 Registry **不校验**仓库可见性，发布不受阻。
- 但 Glama 的「Repository / GitHub Stars」、LobeHub 的 `homepage` 链接、以及用户的源码审阅入口**全部会失效**——而透明可审阅恰恰是 MCP 商店收录时看重的点。

选项：① 把仓库设为公开；② 保持私有，接受聚合站上的仓库链接离线（前提是 Registry 的 `repository` 字段可以保留，它本身是可选字段）。

### 3.2 图标还没上

`server.json` 的 `icons` 是可选字段，本次**未声明**，因为应用图标 `app-icon.png`（1024×1024 PNG）躺在私有仓库里，`raw.githubusercontent.com` 取不到（实测 404），而 schema 要求 `icons[].src` 必须是 HTTPS URL。

要加上图标，先把 PNG 放到一个公开 HTTPS 地址（例如 `app.mind-elixir.com` 的静态资源），再补：

```json
"icons": [{ "src": "https://app.mind-elixir.com/icon-512.png", "mimeType": "image/png", "sizes": ["512x512"] }]
```

---

## 4. 发新版本时的 checklist

版本号需要在 **4 个地方**同步修改，漏一处就会导致校验失败或版本信息取自相矛盾：

```bash
# 1) 包元数据
packages/mcp/package.json          → "version": "0.1.6"

# 2) CLI 版本号（硬编码，容易漏）
packages/mcp/src/index.ts          → const VERSION = '0.1.6'

# 3) Registry 清单，两处都要改
packages/mcp/server.json           → "version": "0.1.6"
packages/mcp/server.json           → "packages"[0].version: "0.1.6"

# 4) 校验
cd packages/mcp && pnpm build && mcp-publisher validate && npm publish --access public && mcp-publisher publish
```

另外记得补 `CHANGELOG.md`。

### 关于 `_meta` 的写法

schema 里 `_meta` 被描述成嵌套结构（`io` → `modelcontextprotocol` → `registry/publisher-provided`），但**实际发布到 Registry 的条目用的是扁平点号键**——本次抓取了官方 API 上 8 页已发布数据核对过，真实形态是：

```json
"_meta": {
  "io.modelcontextprotocol.registry/publisher-provided": { "categories": [], "keywords": [], "longDescription": "..." }
}
```

Registry 只会保留这个键下的内容，其余键会被静默丢弃。`categories`、`keywords`、`longDescription`、`contact` 这些并非 schema 定义字段，但已是头部发布者的通行写法，聚合站大多会读。

---

## 5. 提交前自检脚本

官方 schema 的权威校验（会走网络下载 schema 与 ajv）：

```bash
cd /tmp && curl -sO https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
cd /Users/darksouls/projects/mind-elixir-desktop/packages/mcp
npx --yes ajv-cli@5 validate -s /tmp/mcp-server.schema.json -d server.json --spec=draft7 --strict=false
# 期望：server.json valid
```

> `unknown format "uri" ignored` 的告警是 ajv-cli 未加载 formats 插件所致，可以忽略。

字段一致性自检（无需联网）：

```bash
cd packages/mcp && python3 - <<'PY'
import json, re, sys

pkg = json.load(open('package.json'))
srv = json.load(open('server.json'))
ok = True

def check(cond, msg):
    global ok
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    ok = ok and cond

print('package.json')
check(bool(pkg.get('mcpName')), 'mcpName 存在')
check('repository' in pkg and 'homepage' in pkg, 'repository / homepage 存在')

print('server.json')
check(re.fullmatch(r'[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+', srv['name']) is not None, 'name 符合 schema 正则')
check(srv['name'] == pkg['mcpName'], 'server.json name == package.json mcpName（含大小写）')
check(len(srv['description']) <= 100, f"description 长度 {len(srv['description'])} <= 100")
check(srv['version'] == pkg['version'], f"顶层 version 与 package.json 一致（{pkg['version']}）")
check(srv['packages'][0]['version'] == pkg['version'], 'packages[0].version 与 package.json 一致')
check(srv['packages'][0]['registryType'] == 'npm', 'registryType = npm')
check(srv['packages'][0]['registryBaseUrl'] == 'https://registry.npmjs.org', 'registryBaseUrl 为官方 npm')
check(srv['packages'][0]['transport']['type'] == 'stdio', 'transport = stdio')
meta = json.dumps(srv['_meta'])
check(len(meta) <= 4096, f"_meta 体积 {len(meta)} <= 4096")

print()
print('全部通过' if ok else '存在未通过项')
sys.exit(0 if ok else 1)
PY
```
