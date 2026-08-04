# 部署到 Vercel（修复 chyunfan.cn 的 404）

## ⚠️ 最关键的一点（务必先做）
**`server.js` 不能放在仓库根目录！** 只要 Vercel 在根目录看到 `server.js`，构建日志就会出现
`✓ Build complete — Using server.js as the root entrypoint.`，整个项目会变成「Node 自定义服务器」模式：
`api/` 函数被忽略，且 server.js 会把状态写本地文件，而 Vercel 函数文件系统**只读** → 抽签直接 500
（`FUNCTION_INVOCATION_FAILED`）。

**解决办法**：把 `server.js` 从仓库根目录**删除**（本地保留即可，不影响本地 `node server.js` 运行）。
删掉后 Vercel 才会走「静态页面 + `api/` Serverless Functions」模式。

## 问题原因
`chyunfan.cn` 是 **Vercel（Serverless）** 托管。此前因为仓库根目录有 `server.js`，Vercel 把它当成
自定义服务器入口（构建日志可见 "Using server.js as the root entrypoint"），导致：
- `api/` Serverless Functions 未被当作函数部署；
- server.js 把抽签状态写本地 `draw_state.json`，而 Vercel 文件系统只读 → 抽签 500、状态无法跨实例共享；
- 页面 `fetch("/api/...")` 打根路径，而实际部署在 `/matchgrouping` 子路径下 → 404。

## 修复方式
1. **删除仓库根目录的 `server.js`**（关键）；
2. 让 Vercel 自动把仓库根目录的 `api/` 映射成 `/api/xxx` 路由；
3. 状态用 **Supabase（Postgres）** 持久化（走官方 REST 接口，无需额外依赖；也兼容 Upstash Redis 备用）；
4. 前端已改为**按页面路径自动推导 API 前缀**（页面在 `/matchgrouping` 就调 `/matchgrouping/api/...`，
   在根 `/` 就调 `/api/...`），不再写死根路径。

## 目录结构（部署到 Vercel 时）
```
.
├── index.html            # 前端（已加固 + API 前缀自动推导）
├── package.json          # 注意：不要包含 "main": "server.js"
├── api/                  # ← Vercel Serverless Functions（部署必需）
│   ├── _lib/
│   │   ├── draw.mjs      # 抽签/赛程纯逻辑（与 server.js 一致）
│   │   ├── store.mjs     # 状态存储：优先 Supabase（Postgres），其次 Upstash Redis，均未配置降级 /tmp
│   │   └── util.mjs      # 读取请求体
│   ├── state.mjs         # GET  /api/state
│   ├── draw.mjs          # POST /api/draw
│   ├── setup.mjs         # POST /api/setup
│   └── reset.mjs         # POST /api/reset
└── README_VERCEL.md

# 本地 / Node 平台版（Railway/Render/CloudBase）才需要 server.js，Vercel 部署请删除它
```

## 部署步骤

### 1. 删除 server.js 并推送（关键，别漏）
- 在 GitHub 仓库里**删除根目录的 `server.js`**（Vercel 看到它就会走自定义服务器模式，`api/` 函数失效、抽签会 500）。
- 确认仓库根目录包含：`index.html`、`api/`（整个目录）、`package.json`，且 `package.json` **没有** `"main": "server.js"` 字段。
- 提交并推送。Vercel 会自动检测到 `api/` 并构建函数；构建日志里**不应再出现** "Using server.js as the root entrypoint"。

### 2. 配置 Supabase（持久化抽签状态）
你已有 Supabase 项目，只需两步：建一张表 + 填入环境变量。

**(a) 在 Supabase 里建表**
打开 Supabase 控制台 → 你的项目 → **SQL Editor** → 新建查询，粘贴下面这段执行：
```sql
create table if not exists draw_state (
  id         integer primary key default 1,
  teams      jsonb   not null default '[]'::jsonb,
  drawn      jsonb   not null default '{}'::jsonb,
  all_drawn  boolean not null default false,
  schedule   jsonb,
  updated_at timestamptz not null default now()
);
insert into draw_state (id) values (1) on conflict (id) do nothing;
```

**(b) 在 Vercel 里填两个环境变量**
Vercel 项目 → **Settings → Environment Variables**，添加：
| Name | Value（去 Supabase 控制台拿） |
|---|---|
| `SUPABASE_URL` | 项目 URL，形如 `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API → service_role key**（注意是 service_role，不是 anon，只有服务端函数能用，不会被前端看到） |

> 去哪拿：`SUPABASE_URL` 在 Supabase 项目首页；`service_role key` 在 **Project Settings → API** 里（长按 reveal 显示）。
> 这两个变量会在部署后自动注入函数，程序读写 `draw_state` 表时自动使用。

（**可选备用**：若你更想用 Upstash Redis，填 `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` 即可，代码会自动优先用 Supabase、其次 Redis。）

### 3. 部署
```bash
vercel --prod              # 或推送后由 Git 自动部署
```
部署完成后，`chyunfan.cn/api/state` 应返回 JSON（不再 404）。

### 4. 组织者密钥（重要：当前线上密钥不是 11）
默认密钥为 `11`。**实测你线上 `ORG_KEY` 环境变量被设成了别的值**（用 `11` 和 `admin` 都返回 403）。
处理二选一：
- 想用密钥 `11`：去 Vercel **Settings → Environment Variables** 把 `ORG_KEY` 的值改成 `11`（或直接删除该变量，代码会回落到默认 `11`）；
- 想用别的密钥：把 `ORG_KEY` 设成你想要的密码，并通知 5 位队长。

改完**必须 Redeploy 一次**才生效（Deployments → 最新部署 → ⋯ → Redeploy）。

## 本地联调（可选）
```bash
npm install
vercel dev                 # 会本地启动函数 + 静态页，访问 http://localhost:3000
```
未连接 Supabase / Redis 时，状态会降级写入本机 `/tmp/draw_state.json`（仅本机单次运行有效，便于先跑通）。
生产环境务必完成第 2 步的 Supabase 配置，否则多实例下抽签状态可能丢失。

## 验证清单
- [ ] `你的域名/api/state` 返回 JSON（含 teams/drawn）
- [ ] 5 位队长各选队伍抽签，号码 1–5 不重复
- [ ] 同一队伍重复抽签被拒（409）
- [ ] 5 队抽满后自动出现 5 天循环赛程
- [ ] 组织者用密钥 `11` 可「保存队名」「重置全部抽签」
