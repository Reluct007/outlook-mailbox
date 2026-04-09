# Outlook Mailbox - 分布式验证码聚合面板

基于 Cloudflare Workers 构建的生产级验证码（OTP）提取与聚合系统。
本项目专门针对**大规模自动化账号矩阵**或**跨邮箱快速接码**场景设计，彻底免除在复杂 Webmail 界面中人肉翻找验证码的繁琐流程。

> **🎯 核心目标：一秒接收，纯洁提取，即拿即走。**

---

## 🌟 核心特性

*   **⚡️ 极速触达 (Webhook 驱动)**: 抛弃低效的定时轮询 (POP3/IMAP)。依靠微软 Graph API 底层订阅事件，新邮件到达微软服务器的纳秒级即可推送到本系统。
*   **🧼 智能脱水与解析**: 强大的云端解析队列，可无视各种复杂的 HTML 邮件模板，自动剔除杂质并利用高强度正则提取 4~8 位纯数字验证码。
*   **🛡️ 分布式韧性设计**:
    *   **Durable Objects 面向对象协调器**: 每个管理的邮箱被分配一个独立的微缩大脑，杜绝并发订阅引发的冲突，自动处理微软租约到期并无缝续订。
    *   **四大高并发队列 (Queues)**: 完全解耦“收件”、“抓取”、“解析”、“续约”阶段，抗得住极端条件下的高并发洪水。
*   **🤖 友好的自动化接口**: 所有提取到的验证码和历史信号，全部通过结构化的 REST API 或直接连入 PostgreSQL 提供给你的 Python/Node.js 自动化爬虫使用。

---

## 🛠️ 技术栈与依赖架构

整个运转周期被严格限制在免运维的云原生组合中：

1.  **Cloudflare Workers** (主运行环境)
2.  **Cloudflare Durable Objects** (管理单个邮箱生命周期的单例状态机)
3.  **Cloudflare Queues** (异步解耦队列，抹平并发峰值)
4.  **Cloudflare R2** (海量原始长文本邮件大对象存档库)
5.  **PostgreSQL / Neon.tech** (核心关系型数据池，储存 Token 密码本和提纯后的验证码集合)
6.  **Azure Entra ID** (微软 OAuth 授权代理商)

---

## 🚀 从零部署指南 (Deployment Guide)

### 第一阶段：准备基础设施

1. **Cloudflare 账户**: 需开通 Workers 付费版（才能使用 Durable Objects 和 Queues）。
2. **PostgreSQL 数据库**: 推荐使用 [Neon.tech](https://neon.tech/)，无需复杂配置，直接拿一个支持 SSL 的连接串。
3. **微软开发者账号**: 登录 [Azure 门户](https://portal.azure.com/)。

### 第二阶段：在微软 Azure 注册授权应用

系统需要代表你的身份去提取邮件，所以必须在微软注册：

1. 登录 [Microsoft Entra ID (Azure AD) 控制台](https://entra.microsoft.com/)。
2. 导航至 **Applications (应用程序)** -> **App registrations (应用注册)** -> 点击 **New registration (新注册)**。
3. **名称**: 随意，如 `Mailbox Automation OTP`。
4. **受支持的帐户类型**: ⚠️ **必须选择第三项**：*“任何组织目录中的帐户和个人 Microsoft 帐户 (例如 Skype、Xbox)”*（只有选这个，它才能接管普通的 @outlook.com 个人号）。
5. **重定向 URI**:
   - 类型选择 **Web**
   - 填入: `https://<你的CF域名>/oauth/outlook/callback`
6. 注册完成后，在 **概述 (Overview)** 页面复制 **应用程序(客户端) ID** (这是后续的 Client ID)。
7. 在左侧菜单点击 **证书和密码 (Certificates & secrets)** -> 创建一个新的客户端密码 (推荐 24 个月) -> 创建后**马上复制它的值(Value)**，一旦刷新此值将永远隐藏！(这是 Client Secret)。

> *注意：本项目默认请求 `offline_access`, `openid`, `profile`, `email`, 和 `Mail.Read` 权限，无需在后台额外手动配置许可，登录授权时会自动索要。*

### 第三阶段：代码克隆与数据库初始化

```bash
# 1. 克隆底层代码
git clone <your-repo>
cd outlook-mailbox
npm install

# 2. 向空数据库注入建表结构 (Migrations)
# ⚠️ 系统运行时不会自动建表，第一次部署必须跑这条初始化命令
PHASE0_STORAGE_MODE=postgres \
PHASE0_POSTGRES_URL="postgres://用户名:密码@你的数据库域名/库名?sslmode=require" \
npm run migrate
```

### 第四阶段：注入 Cloudflare 私密环境变量

为了安全，核心密件和密码本都不应写在配置文件里，请使用 `wrangler secret put` 写入云端系统。依次执行以下命令并粘贴你刚才准备好的对应值：

```bash
# 1. 微软应用 Client ID
npx wrangler secret put OUTLOOK_OAUTH_CLIENT_ID

# 2. 微软应用 Client Secret 
npx wrangler secret put OUTLOOK_OAUTH_CLIENT_SECRET

# 3. 授权回调返回地址 (在 Azure 配置的那个完整 URL)
npx wrangler secret put OUTLOOK_OAUTH_REDIRECT_URI

# 4. Webhook 通知接收地址 (必须包含 /api/ 路径层)
# 格式：https://<你的CF域名>/api/webhooks/outlook
npx wrangler secret put OUTLOOK_WEBHOOK_NOTIFICATION_URL

# 5. Token 库级别加密密匙 (极为重要，防止泄库丢失微软权限)
# 执行 `openssl rand -base64 32` 生成一个随机 32位 字符串填入即可
npx wrangler secret put OUTLOOK_CREDENTIAL_ENCRYPTION_KEY

# 6. 为你的面板大门上一把锁 (设置你每次看验证码的主人密码)
npx wrangler secret put PHASE0_OPERATOR_PASSWORD
```

### 第五阶段：发布到全球边缘节点

```bash
npm run deploy
```

发布完成后，即可访问 `https://<你的域名>/api/otp-panel`（默认账号为 \`world\`，密码为你刚才设定的锁）。
点击 **`OAuth Launcher`** 即可去微软一键登录需要接管的目标邮箱了。

---

## 🤖 自动化与 API 聚合能力 (API & SQL Guide)

这不仅是一个可视化面板，它是一套能赋能你其它业务系统的中间件。如果你的爬虫或业务框架需要精准拦截并读取邮件验证码，请查阅以下对接方案：

### 方案 A：直连底层数据库查询（🔥 最高效，推荐并发自动化使用）

由于所有提纯的验证码全部汇聚在后备 PostgreSQL 的 `message_rule_matches` 表中。在存在**并发多重触发**的情况下，你的 Python 脚本可直接联表查询溯源：

```sql
-- 一行代码直取某来源邮箱发送到 a@outlook.com 的最新一条纯净数字验证码
SELECT 
    match.matched_text AS verification_code, 
    msg.from_address, 
    msg.received_at
FROM message_rule_matches match
JOIN messages msg ON match.message_id = msg.id
WHERE match.mailbox_id = 'a@outlook.com'
  AND match.rule_kind = 'verification_code'
  AND msg.from_address LIKE '%sender_c@custom_domain.com%'
ORDER BY msg.received_at DESC
LIMIT 1;
```

### 方案 B：使用附带的 RESTful 接口

系统原生带有多级 JSON API 供其他轻量级服务抓取：

**1. 获取大盘全景缩影（包含最新一条绝对纯净的 Code）：**
```bash
curl -u "world:你的密码" "https://<域名>/api/otp-panel"
```
*返回值中的 `primarySignal.matchedText` 即为你想要的当前焦点验证码。*

**2. 获取最近历史信号集：**
```bash
curl -u "world:你的密码" "https://<域名>/api/hits?hitType=verification_code&limit=20"
```

**3. 对特定邮箱进行自动化“存活健康探针”：**
在进行重大自动化放量收信前，可利用此探针检查接码邮箱的底层 API Token 是否因为风控被挂起了。
```bash
curl -u "world:你的密码" "https://<域名>/api/mailboxes/目标邮箱@outlook.com"
```
*只要返回 JSON 内 `mailbox.authStatus == "active"`，则该账号处于最高响应健康度，可放心发码。*

---

## 🏥 常见故障排除 (Troubleshooting)

| 异常表现 | 排查方向 / 解决建议 |
| :--- | :--- |
| **`credential_encryption_key_missing`** | 日志抛出此信息代表你在第四阶段遗漏了密匙 `OUTLOOK_CREDENTIAL_ENCRYPTION_KEY` 的写入，导致加密入库自毁保护。 |
| **进入面板提示授权失败红叉** | 极大概率是你在 Azure 设置的 Redirect URI 与写入云端 Secret 的配置有一个字母或末尾斜线 `/` 的误差。请打回重建确保完美对齐。 |
| **长期待机后出现 `reauth_required ⚠`** | 系统失去了跟微软 Graph API 的同步权限控制。原因有二：<br>1. 系统刚刚开启新的高维加密（如 AES），原本的旧 Token 失效被保护丢弃。<br>2. 此邮箱小号因为风控/高频等异常原因被微软强行锁死，或已被你人为改了密码。<br>**💡 彻底解决办法**：在右上角 `OAuth Launcher` 弹窗内对该爆红账号**重新进行一次全流程重新登录**签署授权即可！生成的新密匙会全自动无缝接管接下来的续费周期！ |
| **长期处于 `waiting` 然后转向 `Unhealthy`** | 系统底层尝试向微软 Graph 建立长监听失败。请核对 `OUTLOOK_WEBHOOK_NOTIFICATION_URL` 的完整拼写，确认你在 URL 最后加了 `/api/webhooks/outlook`。 |

## License

MIT License.
