# Mac 与 Funnel 部署

应用运行在 Mac，电脑和手机使用同一个 HTTPS 地址。Funnel 只需要服务端 Mac 安装并登录 Tailscale，手机无需安装客户端，也无需购买域名。公网入口会公开登录页，训练数据仍需应用账号登录后访问。

## 安装与保留数据

固定安装目录建议为 `~/Applications/fitness-tracker`。先阅读 README.md 和安装与使用.md，再检查 `node --version`。要求 Node.js `>=24.14.0 <25`，应用无第三方 npm 依赖。

如果系统 Node.js 版本不兼容，可从 Node.js 官方下载适合芯片架构的 24.x 安装包，核对官方 SHA-256 后，将解压后的运行环境放在 `.runtime/node`。不必替换系统 Node.js。此时从应用目录使用以下命令，而不是直接使用系统 `node`：

```bash
./.runtime/node/bin/node --version
./.runtime/node/bin/node scripts/check.mjs
./.runtime/node/bin/node --test test/*.test.mjs
./.runtime/node/bin/node --env-file-if-exists=.env server.mjs
```

若已有安装，先停止服务并完整备份，再更新程序。保留整个 `data`（包含子目录）、`backups`、`.env` 和独立运行环境。不要把数据库、环境配置、配置备份或运行环境提交到 GitHub；`.env.example` 仅提供空白模板。

首次先在 Mac 打开 `http://localhost:4177` 创建管理员账号，自行设置密码，再开放公网入口。

## 登录 Mac 后启动

停止手动运行的应用进程，再执行：

```bash
./.runtime/node/bin/node scripts/install-launchd.mjs
```

该脚本记录当前 Node.js 的绝对路径，创建 `~/Library/LaunchAgents/local.sixarts.fitness.plist`，登录后运行并在异常退出后重启。已有 plist 时会拒绝覆盖，需先停用并备份。移动应用或 Node.js 后要重新配置路径。

Tailscale 也需启动：可在其设置中启用登录启动。另一种做法是在 `~/Library/LaunchAgents/local.sixarts.tailscale.plist` 放置以下文件；两种方式选一种即可。已有同名文件时先检查并备份，不要覆盖。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.sixarts.tailscale</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/open</string><string>-g</string><string>-a</string>
    <string>/Applications/Tailscale.app</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict></plist>
```

```bash
plutil -lint ~/Library/LaunchAgents/local.sixarts.tailscale.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.sixarts.tailscale.plist
```

这个辅助任务打开 Tailscale 后退出，退出码 0 是正常结果；它不代替 Tailscale 登录和系统扩展授权。Mac 重启后仍需登录用户，保持联网且不睡眠，最后应通过一次重新登录验证自启动。

## 启用公网 HTTPS

1. 从官方来源安装 Tailscale，在 macOS 允许系统扩展和 VPN 配置，并登录自己的账号。
2. 在终端运行：

   ```bash
   /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg http://127.0.0.1:4177
   ```

3. 如命令返回授权链接，在浏览器中完成 HTTPS 和 Funnel 授权。再次检查 `funnel status`，确认显示 `Funnel on`。
4. 备份 `.env`，将以下两项更新为实际配置，其余已有配置保留。示例域名是占位符，必须替换为命令返回的域名，末尾不加 `/`：

   ```dotenv
   HOST=127.0.0.1
   APP_ORIGIN=https://your-mac.your-tailnet.ts.net
   ```

5. 重启应用：

   ```bash
   launchctl kickstart -k gui/$(id -u)/local.sixarts.fitness
   ```

6. 电脑和手机都使用这个 HTTPS 入口登录。启用 HTTPS 后登录 Cookie 带有 Secure 属性，不要继续依赖本机 HTTP 入口登录。Funnel 的 `--bg` 配置会在 Tailscale 重启后恢复。

应用目前使用 6 位数字密码，并有登录限流。Funnel 将登录入口公开到互联网，不能将它视为私人网络访问；没有新增更强的认证机制。不要直接在路由器开放 4177 端口。

## 分层验收与排查

必须区分下列检查，不能只凭 Mac 上一次请求成功就宣称公网可用：

1. **应用本机：** `curl -fsS http://127.0.0.1:4177/api/health` 应返回 `{"ok":true}`。
2. **HTTPS：** 对实际 HTTPS 地址的 `/api/health` 发请求，验证证书及响应；`/api/auth` 应显示 `needsSetup:false`，远程请求应显示 `canSetup:false`。不要通过关闭证书校验来验收。
3. **公网 DNS：** 使用公共 DNS 查询域名。Mac 启用 MagicDNS 时可能解析为 `100.x` 的 Tailscale 内网地址，这只证明内网可达。公网 DNS 如果没有地址记录，手机移动网络仍无法访问。官方说明首次发布可能需要最多约 10 分钟；持续没有记录时，应排查 Tailscale 域名发布，不应反复修改应用数据。
4. **系统代理：** 若终端直连正常、电脑浏览器失败，检查系统代理是否把该域名交给无法解析它的代理。确有此问题时，先备份代理绕过列表，只添加该应用的完整域名，保留所有原规则，不必关闭整个代理。
5. **真实外网：** 手机关闭 Wi-Fi，使用 4G/5G，且不连接 Tailscale，打开页面、登录并读取已有记录。该步骤成功后才能确认手机公网访问完成。

### 2026-09-13 部署验证记录

已验证 Apple Silicon Mac 上独立 Node.js v24.21.0 运行、项目资源自检和 17 项测试通过；应用 LaunchAgent 正常运行。Funnel 与 HTTPS 配置成功，处理代理绕过后 Safari 能显示登录页。

但当次公网 DNS 在等待及重新发布后仍无地址记录，手机公网验收未通过。该问题尚未解决，不能将此记录当成公网部署成功证明。此文档不包含实际设备域名、局域网地址、账号或个人配置。

## 官方参考

- [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel)
- [Funnel 命令](https://tailscale.com/docs/reference/tailscale-cli/funnel)
- [Node.js 官方下载](https://nodejs.org/en/download)
