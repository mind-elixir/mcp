# MCP 商店提交手册

本仓库（`@mind-elixir/mcp`）的发布与收录操作流程。**本文件不随 npm 包发布**（`package.json` 的 `files` 未包含它），仅作为仓库内运维文档。

---

## 0. 现状盘点

截至 2026-09-14：

| 项目 | 状态 |
| --- | --- |
| 代码仓库 | `github.com/mind-elixir/mcp`（**公开**，默认分支 `main`） |
| npm 已发布版本 | `0.1.0`（09-10）、`0.1.1`（09-10）、`0.1.2`（09-10）、`0.1.4`（09-14） |
| npm `latest` tag | 指向 `0.1.4` |
| `mcpName` 字段 | **已发布的 0.1.2 与 0.1.4 实测都没有**，因此无法通过官方 Registry 的所有权校验 |
| `server.json` | 仓库根目录 |
| Registry 名称 | `io.github.mind-elixir/mcp` |
| 图标 | `app-icon.png`（1024×1024），已在 `server.json` 声明 |

> 结论：**必须发一个新版本（`0.1.5`）**。npm 不允许修改已发布版本的 `package.json`，而官方 Registry 校验的是 npm 上那个版本的 `mcpName` 字段。

### 0.1 独立成仓后补齐的三件事

从 `mind-elixir-desktop` monorepo 的 `packages/mcp` 拆出来时，有三处依赖 monorepo 根配置、拆出来后必须自带：

| 补的东西 | 为什么 |
| --- | --- |
| `pnpm-workspace.yaml` 里的 `allowBuilds: { esbuild: true }` | 原先继承根目录的 `allowBuilds`。缺失时 pnpm 会拒绝执行 esbuild 的安装脚本，报 `ERR_PNPM_IGNORED_BUILDS`，进而让 `pnpm build` 因依赖状态检查失败而整体中断。 |
| `devDependencies` 里的 `@types/node` | 原先由根 `node_modules` 提升提供。缺失时 `tsup` 的 `dts: true` 会报 `TS2580: Cannot find name 'process'`，**ESM 打包能过、DTS 阶段失败**，`pnpm build` 退出码 1。 |
| `pnpm-lock.yaml` | 独立仓需要自己的锁文件。`packageManager` 固定为 `pnpm@11.25.0`，因为 `allowBuilds` 是 pnpm 11 的配置键。 |

验证方式：全新克隆后 `pnpm install && pnpm build` 必须退出码 0，且 `node dist/index.js --version` 输出 `v0.1.5`。

---

## 1. 命名空间：`io.github.mind-elixir/mcp`

官方 Registry 的命名空间直接取自 **GitHub 账号**（个人或组织），**与仓库名无关**。

### 1.1 命名规则

GitHub 认证方式下，`server.json` 的 `name` 必须形如 `io.github.<账号名>/<server 名>`，且要与 `package.json` 的 `mcpName` **逐字符一致**：

```text
io.github.mind-elixir/mcp
```

GitHub 返回的组织 `login` 就是小写 `mind-elixir`，所以这里没有大小写歧义（对比：个人账号 `SSShooter` 带大写 S，用个人身份发布才需要写 `io.github.SSShooter/...`，且**不能写成小写**）。

### 1.2 硬性前提：必须是组织 Owner

Registry 只把组织命名空间发给该组织的 **Owner**（membership role = `admin`），普通 member 会被拒：

```go
// registry/internal/api/handlers/v0/auth/github_at.go
// Get the organizations the user administers. Org namespaces are only granted
// to org Owners (membership role "admin"), not to ordinary members.
...
if m.State == githubMembershipStateActive && m.Role == githubOrgRoleAdmin {
    adminOrgs = append(adminOrgs, m.Organization)
}

// 之后把每个受管组织拼成权限前缀
ResourcePattern: fmt.Sprintf("io.github.%s/*", org.Login)
```

鉴权用的是**区分大小写**的前缀匹配：

```go
// registry/internal/auth/jwt.go
func isResourceMatch(resource, pattern string) bool {
    if strings.HasSuffix(pattern, "*") {
        return strings.HasPrefix(resource, strings.TrimSuffix(pattern, "*"))
    }
    ...
}
```

发布前先确认自己的角色：

```bash
gh api orgs/mind-elixir/memberships/SSShooter --jq '{role,state}'
# 期望：{"role":"admin","state":"active"}    ← admin 即 Owner
```

### 1.3 device flow 会自动申请 `read:org`，但组织侧可能还要批准

`mcp-publisher login github` 的 device flow 请求的 scope 是写死的：

```go
// registry/cmd/publisher/auth/github-at.go
"scope": "read:org read:user",
```

所以走 device flow 不用手动配 scope。两个要注意的点：

- 如果组织开启了 **OAuth App access restrictions**，需要组织 Owner 先批准 `mcp-publisher` 这个 OAuth 应用，否则 GitHub 不会返回该组织 membership，结果是「只拿到个人命名空间」，发布时报权限错误。
- 改用 PAT 登录（CI 场景）：Classic PAT 需要 `read:org`，Fine-grained PAT 需要 **Organization permissions → Members → Read-only**。缺了会**静默降级**为只能用个人命名空间。

### 1.4 CI 免凭据方案：GitHub Actions OIDC

`mcp-publisher login github-oidc` 走 `id-token: write`，服务端从 OIDC token 的 `repository_owner` 推导命名空间：

```go
// registry/internal/api/handlers/v0/auth/github_oidc.go
// Grant publish permissions for the repository owner's namespace
// We grant io.github.<owner>/* rather than io.github./repo/*
ResourcePattern: fmt.Sprintf("io.github.%s/*", claims.RepositoryOwner)
```

仓库属于 `mind-elixir` 组织，因此 `repository_owner` = `mind-elixir`，**自动拿到 `io.github.mind-elixir/*`**，不需要任何长期凭据。后续要做自动发布时这是最干净的一条路。

---

## 2. 官方 MCP Registry 发布

地址：<https://registry.modelcontextprotocol.io>　规范：`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`

官方 Registry 只托管**元数据**，不托管产物；产物仍在 npm。它是生态的元数据源头，Glama、PulseMCP、mcp.so、LobeHub 等聚合站大多从这里或从 GitHub 仓库拉取。

### 2.1 一次性准备

```bash
brew install mcp-publisher                 # 或从 GitHub Releases 下载二进制
mcp-publisher --help
```

### 2.2 发布

```bash
# 1) 构建并确认产物
pnpm install
pnpm build

# 2) 发布到 npm —— 必须先于 Registry：
#    Registry 会去 npm 校验「这个版本存在」且「该版本的 mcpName 等于 server.json 的 name」
npm publish --access public
npm view @mind-elixir/mcp dist-tags         # 确认 latest 指向 0.1.5

# 3) 登录（device flow，浏览器里确认；注意批准组织访问）
mcp-publisher login github

# 4) 先本地校验，再发布
mcp-publisher validate
mcp-publisher publish

# 5) 验证
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.mind-elixir/mcp"
```

> `publish` 从 `login` 保存的 token 里读取 registry 地址，**不接受 `--registry` 参数**——传了会被当成 `server.json` 的路径解析。

期望输出：

```text
✓ Successfully published
✓ Server io.github.mind-elixir/mcp version 0.1.5
```

### 2.3 常见报错对照

| 报错 | 处理 |
| --- | --- |
| `Registry validation failed for package` | npm 上那个版本没有 `mcpName`，或值与 `server.json` 的 `name` 不一致。 |
| `You do not have permission to publish this server` | 命名空间不匹配。确认 `io.github.mind-elixir/mcp` 拼写；若登录账号不是组织 Owner，或 device flow 时没批准组织访问，也会落到这里。 |
| `Invalid or expired Registry JWT token` | token 过期，重新执行 `mcp-publisher login github`。 |
| 只能发个人命名空间、组织被忽略 | 组织开了 OAuth App access restrictions 未批准，或 PAT 缺 `read:org` / Members 读取权限。 |

---

## 3. 聚合站

| 平台 | 收录方式 | 本项目需要做什么 |
| --- | --- | --- |
| **PulseMCP** | 从官方 Registry 自动摄取 | 无。Registry 发布完成后等同步即可。 |
| **Glama** | 从 GitHub 仓库 + 官方 Registry 每日同步 | 代码推到 `main` 后等自动同步；建议再走一次 Claim 认领。 |
| **mcp.so** | 站内自主提交 | 到 <https://mcp.so/submit> 填表提交。 |
| **LobeHub** | 官方 CLI 发布 | 见 <https://lobehub.com/publish-mcp>，按其 `skill.md` 走 CLI。 |
| **Smithery** | ① 公网 HTTPS 的 Streamable HTTP 端点　② 本地 stdio 用 `.mcpb` 包分发 | **两条路当前都不顺**，见下。 |

### Glama

Glama 每天从 GitHub 仓库同步，`main` 上推了新内容就会更新。认领（Claim）后可解锁分析、缩略图与健康检查。认领需证明控制权，三选一：

- **GitHub identity**：登录与命名空间匹配的 GitHub 账号（对 `io.github.mind-elixir/*` 即组织 Owner 账号）。
- **HTTP challenge**：在服务同源放 `/.well-known/glama.json`。
- **DNS challenge**：加一条 TXT 记录。

注意：与官方 Registry 关联的条目，默认会被 Registry 的 name / description / URL 覆盖；若要保留 Glama 上的自定义内容，认领后在 **Manage connector** 里打开 “Use Glama listing details as the source of truth”。

### Smithery 为什么暂时不适合

Smithery 的发布路径只有两条：

1. **URL 托管**：需要一个**公网 HTTPS** 且实现 Streamable HTTP 的端点。本服务固定绑定 `127.0.0.1:6595`，且必须由用户本机的桌面应用提供服务，**无法托管到云上**。
2. **本地 stdio（`.mcpb` bundle）**：客户端下载后在本机运行的 MCP Bundle。这条路理论上可行——`tsup` 配置了 `noExternal: [/.*/]`，`dist/index.js` 已经是单文件打包产物，适合塞进 `server.type: "node"` 的 MCPB。

> 若后续要做 Smithery，正确的做法是构建 `.mcpb`（`manifest.json` + `dist/index.js`），而不是 `smithery.yaml` 或 Dockerfile——容器化会把 `127.0.0.1` 隔离掉，反而连不上宿主机的桌面应用。

---

## 4. 图标

`server.json` 的 `icons[].src` 必须是公网 HTTPS 地址，因此图标放在本仓库并走 `raw.githubusercontent.com`：

```json
"icons": [
  {
    "src": "https://raw.githubusercontent.com/mind-elixir/mcp/main/app-icon.png",
    "mimeType": "image/png",
    "sizes": ["1024x1024"]
  }
]
```

替换图标时保持文件名与路径不变即可，无需改 `server.json`。

---

## 5. 发版 checklist

版本号需要在 **4 个地方**同步修改，漏一处就会导致校验失败或版本信息自相矛盾：

```bash
# 1) 包元数据
package.json                 → "version": "0.1.6"

# 2) CLI 版本号（硬编码，容易漏）
src/index.ts                 → const VERSION = '0.1.6'

# 3) Registry 清单，两处都要改
server.json                  → "version": "0.1.6"
server.json                  → "packages"[0].version: "0.1.6"

# 4) 构建 + 校验 + 发布
pnpm build && mcp-publisher validate && npm publish --access public && mcp-publisher publish
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

## 6. 提交前自检

官方 schema 的权威校验（会走网络下载 schema 与 ajv）：

```bash
cd /tmp && curl -sO https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
cd -                                    # 回到本仓库根目录
npx --yes ajv-cli@5 validate -s /tmp/server.schema.json -d server.json --spec=draft7 --strict=false
# 期望：server.json valid
```

> `unknown format "uri" ignored` 的告警是 ajv-cli 未加载 formats 插件所致，可以忽略。

字段一致性自检（无需联网）：

```bash
python3 - <<'PY'
import json, re, sys

pkg = json.load(open('package.json'))
srv = json.load(open('server.json'))
ok = True

def check(cond, msg):
    global ok
    print(('  OK  ' if cond else '  FAIL') + ' ' + msg)
    ok = ok and cond

print('package.json')
check(bool(pkg.get('mcpName')), 'mcpName 存在')
check(pkg.get('mcpName') == srv['name'], 'mcpName == server.json name')
check('mind-elixir/mcp' in pkg.get('repository', {}).get('url', ''), 'repository 指向 mind-elixir/mcp')

print('server.json')
check(re.fullmatch(r'[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+', srv['name']) is not None, 'name 符合 schema 正则')
check(len(srv['description']) <= 100, 'description 长度 %d <= 100' % len(srv['description']))
check(srv['version'] == pkg['version'], '顶层 version 与 package.json 一致（%s）' % pkg['version'])
check(srv['packages'][0]['version'] == pkg['version'], 'packages[0].version 与 package.json 一致')
check(srv['packages'][0]['identifier'] == pkg['name'], 'identifier 与 package.json name 一致')
check(srv['packages'][0]['registryType'] == 'npm', 'registryType = npm')
check(srv['packages'][0]['registryBaseUrl'] == 'https://registry.npmjs.org', 'registryBaseUrl 为官方 npm')
check(srv['packages'][0]['transport']['type'] == 'stdio', 'transport = stdio')
check('subfolder' not in srv.get('repository', {}), 'repository 不含 subfolder（已独立成仓）')
meta = json.dumps(srv['_meta'])
check(len(meta) <= 4096, '_meta 体积 %d <= 4096' % len(meta))

print()
print('全部通过' if ok else '存在未通过项')
sys.exit(0 if ok else 1)
PY
```
