# Codex 守护 / Codex guard

在 magpie 窗口里加一个「Codex 守护」页面：体检 Codex 桌面端的账号态文件，随时快照与恢复被登出清空的项目与会话归属，并显示 codex 账号的 5 小时 / 7 天额度与当前路由。
A page in magpie's window that checks Codex's account-state file, snapshots it and puts it back after a sign-out, and shows the codex account's 5-hour and 7-day windows and the routing in effect.

## 它解决什么 / What it addresses

Codex 桌面端把「项目 / 会话归属 / 侧边栏分组」存在 `%USERPROFILE%\.codex\.codex-global-state.json` 里，而且**按登录态分版本**：
Codex desktop keeps its projects, each session's project and the sidebar's grouping in `%USERPROFILE%\.codex\.codex-global-state.json`, and writes **a different shape for each sign-in state**:

| 登录态 / state | 顶层键 / top-level keys | 项目 / projects | 会话归属 / assignments |
|---|---|---|---|
| 正常登录 / signed in | 约 43 | 14 | 500+ |
| 登出（匿名）/ signed out | 约 25 | 0 | 0 |

登出瞬间，Codex 把这个文件连同 `.bak` 一起改写成匿名版，于是侧边栏按项目分组全空，看起来像「项目全没了」。会话数据（`sessions/**.jsonl`、`state_5.sqlite`）从来没有被删，只是账号态映射被换掉了；重新登录又会写回来。
On sign-out Codex rewrites that file, `.bak` included, as the anonymous copy, so the sidebar's project grouping goes empty and it looks like every project vanished. The sessions themselves (`sessions/**.jsonl`, `state_5.sqlite`) are never deleted; only the account-state mapping is replaced, and signing back in writes it again.

这个页面把这件事变成可操作的三步：判断当前是哪种状态、在正常时留快照、需要时把快照写回去（也可以每 20 秒自动看一次、发现匿名态就自己恢复）。
This page turns that into three steps: tell which state the file is in, keep a snapshot while it is healthy, and write the snapshot back when needed — optionally by itself, every 20 seconds.

## 页面里有什么 / What the page shows

- **登录态**：状态徽章（正常 / 匿名 / 不完整 / 找不到），顶层键、项目、会话归属、工作区根的数量、文件大小与修改时间。
- **快照与恢复**：列出 `state-backups\` 下的快照（含各自键数与项目数），「恢复所选」「立即恢复」「新建快照」，以及自动恢复开关和最近的动作日志。
- **codex 额度**：读 magpie 自己的额度接口，显示每个 codex 账号 5 小时 / 7 天窗口的已用与剩余、重置时间、重置券数量；已用 ≥ 99% 的窗口标红。
- **路由现状**：只读展示 `providers.json` 里含 `codex/` 的组：routing、affinity、成员，以及 reserve 中间件的 `ceiling`。

## 安全边界 / Safety

- 恢复前先把**当前**文件（以及 `.bak`、`state_5.sqlite`）复制到 `state-backups\pre-restore-<时间>\`，再覆盖；只保留最近 10 份。
- 拒绝写回「看起来是登出态」的快照（没有 `local-projects` 且顶层键 < 35），避免越恢复越空。
- 快照名只接受 `A-Z a-z 0-9 . _ -`，解析后必须落在 `state-backups\` 内。
- 服务只绑 `127.0.0.1`，校验 `Host`；`/api/*` 还要求页面自己的随机 token（每次启动重新生成）。
- `permissions: []`：页面不读 magpie 的任何 `magpie.read` 资源。宿主部分自己读 `.codex` 下的文件、magpie 的 `providers.json` / `plugins.json`，并调用 magpie 的 `/v1/magpie/quotas`。
- 恢复前**完全退出 Codex**：它还开着的时候，退出动作可能再写一次匿名态，把刚恢复的覆盖掉。

## 装 / Install

```sh
magpie plugin add @magpie-community/page-codex-guard
# 或从本地目录
magpie plugin add ./packages/codex-guard
```

装好后在侧边栏 **插件 / Plugins** 里打开 **Codex 守护**。

## 选项 / Options

| 选项 | 默认 | 说明 |
|---|---|---|
| `port` | `4391` | 宿主服务端口（只绑 127.0.0.1） |
| `autoRestore` | `false` | 首次启动时的自动恢复默认值；之后以页面开关为准 |
| `gateway` | `http://127.0.0.1:3425` | magpie 网关地址，用于读额度 |
| `codexHome` | 空 | 留空用 `%CODEX_HOME%`，再退到 `%USERPROFILE%\.codex` |

## 结构 / Layout

```
package.json     magpie.page + page.service{port:4391} + permissions: []
index.mjs        宿主部分：export default { id, server }
lib/codex.mjs    账号态判定、快照、恢复、pre-restore 轮换
lib/quota.mjs    magpie 额度接口的只读客户端
lib/routing.mjs  providers.json / plugins.json 的只读视图
lib/server.mjs   node:http 服务：token + Host + Origin 校验，托管 ui/
page/            引导页：bridge.js 拿服务地址后跳过去
ui/              真正的界面（html / css / app.js）
test/            node --test：判定、快照、token、Host、页面无网络
```

## 开发 / Develop

```sh
node --test test/*.test.mjs
```

## 许可 / License

MIT
