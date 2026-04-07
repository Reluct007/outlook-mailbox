# PRODUCT.md

## 产品定义

这个项目不是通用邮箱客户端。

它是一个跨多个 Outlook mailbox 聚合的 **OTP 面板**。

当前 V1 只解决一个非常具体、非常真实的问题：

> 我不用点进邮件，直接看到 code，点一下复制。

系统存在的目的，是把“登录站点时等待验证码”这件事压缩成一个最短动作链。

不是帮用户管理邮箱世界。

是帮用户最快拿到最新验证码。

---

## 当前目标用户

最核心用户是：

> 一个需要跨多个 Outlook mailbox 快速拿验证码的人

当前项目首先服务自用场景。

这类用户不是来做运营分析，也不是来巡检邮件池。

他们来这里只为了：

- 立即看到最新验证码
- 在不点开邮件正文的前提下判断这个 code 是否可信
- 一键复制
- 在没有验证码时知道自己是在等待，还是系统链路已经异常
- 在需要排障或人工恢复时，进入一个受保护的 operator 面板，而不是把这些能力暴露给公网

---

## 当前 V1 目标

### 业务目标

- 接入 Outlook 邮件流（覆盖 Inbox / Junk）
- 实时或近实时接收新邮件
- 从邮件中识别验证码
- 把跨 mailbox 的最新验证码聚合成首页主卡
- 让用户不必点进邮件也能完成复制
- 让等待态与链路异常态清晰可见

### 技术目标

- 以 Cloudflare-native 运行模型承载主链路
- Durable Object 继续作为 mailbox lifecycle 的唯一协调边界
- 用 Postgres 承载事实与查询模型
- 用 R2 承载大正文与原始 blob
- 在 webhook / lifecycle / recovery / renew 乱序下保持正确性
- 在公网暴露前提下，把 OAuth/webhook 公共入口与 operator 数据面明确分层

---

## 当前最重要的信号

### 一级信号

- `verification_code`

### 次级信号

- `reward`
- `cashback`
- `redeem`

次级信号可以保留，但不能与 OTP 首页主任务并列。

---

## V1 默认工作流

V1 的默认工作流不是“看命中流”。

而是：

```text
新邮件进入 Outlook mailbox（含 Inbox / Junk）
-> 系统识别验证码
-> OTP 面板主卡展示最新 code
-> 用户复制
-> 离开
```

如果当前没有验证码，系统必须明确区分：

- `waiting_for_code`
- `delivery_path_unhealthy`

如果用户要看 mailbox diagnostics、message detail 或手工触发恢复，这已经不是匿名访问一个页面。

这是 operator 动作，必须先认证。

---

## V1 核心页面 / 能力

### 1. OTP 首页

这是 V1 的主入口。

首页第一屏必须优先展示：

- 最新 code
- 复制动作
- 来源邮箱
- 收到时间
- 信号类型
- 必要时“跨 X 个 mailbox 的最新验证码”

但这个首页不是公开展示页。

它现在是一个 **受 Basic Auth 保护的 operator 页面**。因为首页本身已经包含：

- OTP 值
- mailbox 元信息
- mailbox 健康状态

### 2. 状态区

负责解释为什么当前没有可复制的 code。

至少覆盖：

- `waiting_for_code`
- `delivery_path_unhealthy`

### 3. 历史与次级信号

放在更低优先级的位置：

- 最近几条历史验证码
- 非 OTP 当前信号

### 4. 诊断与详情

只在需要时进入：

- message detail
- mailbox diagnostics

这部分现在明确属于 **operator surface**，和 OAuth 公共接入页不是同一个产品边界。

---

## 公网暴露模型

这个产品运行在公网 Worker 上，但不是“所有页面都公开”。

### 对公网开放的能力

- 完成 OAuth 跳转与回调
- 接收 Microsoft Graph webhook

这些公开能力服务的是 Outlook OAuth 与 Graph webhook 回调闭环。

### 不对公网开放的能力

- 查看 OTP 首页
- 查看 hits
- 查看 message detail
- 查看 mailbox diagnostics
- 手工触发 reauthorize / recovery

这些能力服务的是 operator，不是外部访客。

所以当前产品边界很明确：

> 公开的是接入闭环  
> 受保护的是读取面和操作面

现在补上的一个关键收口是：

- `GET /connect/outlook`
- `GET|POST /api/mailboxes/connect-intents`
- `GET /connect/result`

都已经进入 operator 保护边界。

---

## 当前安全收敛

### 1. OTP 面板不再匿名访问

首页和敏感读接口现在都要求 operator Basic Auth。

这解决的是最直接的问题：

- 别人不能直接看到验证码
- 别人不能直接看到邮件详情
- 别人不能直接看到 mailbox 健康与订阅状态
- 别人不能直接触发人工恢复或重授权

### 2. `redirectAfter` 只允许站内路径

connect intent 和 reauthorize 的回跳目标现在只能是站内相对路径。

这符合产品真实需求，因为当前产品根本不需要跨站跳转。

也就是说，OAuth 完成页不再是一个潜在外链跳板。

### 3. webhook 先验再存

公网 webhook 入口现在会先：

- 校验 JSON
- 校验数组结构
- 拒绝空批次
- 校验 subscription ownership
- 校验 `clientState`

只有至少一条事件真的可接受时，才会落 raw payload。

这是为了防止公网入口被廉价刷写，不是为了代码看起来更整洁。

### 4. 坏输入明确返回 `400`

当前产品对外边界已经收敛成：

- 非法 JSON -> `400`
- 非法 body shape -> `400`
- 非法 `redirectAfter` -> `400`

这样用户和 operator 能分清是输入错了，还是系统真的坏了。

---

## V1 非目标

- 完整邮箱客户端
- 发信
- 文件夹浏览作为主交互
- 全量命中流作为首页主入口
- 通用邮件后台
- 完整邮箱池控制台
- 重规则管理 UI
- 系统/API 一级页面
- 计费
- 多租户 SaaS 细节
- Gmail / 自建域支持
- 自动邮箱分配和租约系统

---

## 核心原则

### 1. OTP 首页优先

首页必须先回答“最新 code 在哪里”，而不是“最近有哪些命中”。

### 2. Copy-first

首页唯一主动作是复制验证码。

### 3. Trust before copy

用户必须在复制前就能看到足够的信任元信息。

### 4. Waiting 和 Unhealthy 必须分开

“还没收到”与“链路坏了”不是一回事。

### 5. 聚焦 OTP，不聚焦文件夹

第一版跟踪 Outlook 邮件流里的新消息，至少覆盖 Inbox / Junk。

### 6. operator visibility 仍然重要，但不是首页主角

mailbox 异常状态必须可见。

但它服务的是 OTP 主流程，不应该反客为主。

更准确地说，operator visibility 很重要，但它应该待在**受保护的 operator surface**里，不应该匿名暴露到公网。

---

## 成功标准

V1 完成的判断标准不是功能数，而是：

1. 用户进入首页后，不需要点开邮件正文就能拿到最新 code
2. 用户可以在 5 秒内完成“判断可信 -> 复制 -> 离开”
3. 大幅减少打开指纹浏览器和逐个翻邮箱的次数
4. 没有验证码时，用户能清楚知道是等待中还是链路异常
5. 首页不会被误认成命中流后台或通用 dashboard
6. 公网访客无法直接看到 OTP、message detail 或 mailbox diagnostics

---

## 当前只追求的产品形态

当前阶段只追求：

> Outlook 邮件流新邮件（含 Inbox / Junk）  
-> 验证码识别  
-> 最新 code 聚合  
-> 一键复制

这是 OTP 工具，不是邮件后台。

也是一个**公网接入、私有操作面**的 OTP 工具，不是匿名公共仪表盘。
