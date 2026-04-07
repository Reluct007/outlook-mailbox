# ARCHITECTURE.md

## 1. 产品定位

本项目不是通用邮箱客户端，也不是泛化邮件命中流后台。

当前 V1 的产品定义是：

> 一个跨多个 Outlook mailbox 聚合的 OTP 面板

它只服务一个首页主任务：

> 打开  
> 看到最新 code  
> 复制  
> 离开

所以架构目标也不是“把所有邮件信号都做成后台”。

而是先稳定支撑：

- 真实 Outlook 链路
- 正确的验证码识别
- 跨 mailbox 聚合后的 latest-code-first read model
- 清晰区分 waiting 与 unhealthy 的首页状态

---

## 2. 架构边界

### V1 要做的

- Outlook 邮件流新消息接入（至少覆盖 Inbox / Junk）
- mailbox lifecycle coordination
- 规则驱动的信号提取
- facts、hit events 与 current signal projection 的持久化
- OTP 首页专用 read API
- mailbox health 摘要
- recovery 正确性

### V1 不做的

- 完整邮箱客户端
- 全量命中流作为首页主入口
- workspace / 多工作区产品心智
- 完整邮箱池控制台
- 完整独立搜索中心
- SSE 实时推送
- 重规则管理 UI
- 系统/API 一级页面

这些不是永远不做，而是 V1 明确后置。

---

## 3. 核心架构判断

### 3.1 mailbox 是一级状态机单元

系统复杂度的核心不在 CRUD，而在：

- subscription 生命周期
- webhook / lifecycle / renew / recovery 乱序
- token refresh / reauth
- cursor 推进与重建
- 幂等

因此 mailbox 必须继续作为一级协调单元。

### 3.2 Durable Object 是唯一生命周期协调边界

每个 mailbox 对应一个 Durable Object。

它负责：

- mailbox lifecycle state
- `subscription_version`
- `recovery_generation`
- `cursor_generation`
- dedupe / version gate
- renew / recovery / reauth 决策

任何 mailbox lifecycle state 变更都只能通过 DO 推进。

### 3.3 Postgres 存事实与 projection，R2 存大对象

- **Postgres**：事实、索引、历史记录、当前 signal projection、OTP 首页查询模型
- **Postgres** 里的 `mailbox_credentials` 由应用层加密后再持久化
- **R2**：`body_html`、raw payload、超大 message body、调试素材
- **DO storage**：mailbox 当前协调状态、短期版本/epoch、去重窗口

### 3.4 首页不能直接临时扫 facts 聚合

OTP 首页的核心 read model 应该来自持久化 projection。

不能把“最新验证码”建立在每次临时扫 facts / hits 的查询上。

原因很直接：

- 首页是主入口，不能把聚合逻辑散落到前端
- waiting / unhealthy / latest-code-first 需要稳定、明确的语义
- projection 更容易保证排序、覆盖规则与恢复语义一致

---

## 4. 主链路

### 最小可靠链路

```text
mailbox onboarding
-> ensure mailbox-wide subscription
-> webhook ingress
-> mailbox coordinator
-> fetch message details
-> evaluate rules
-> persist facts + hits + current signals
-> query OTP panel read API
```

这是 V1 唯一必须先打穿的链路。

### 补偿链路

```text
missed notification / stale lifecycle / delayed mailbox
-> mark mailbox recovery needed
-> run mailbox recovery scan
-> fetch missed messages
-> re-run rules
-> repair facts + hits + current signals
```

recovery 不是后期优化。

它是 correctness 主链路的一部分。

---

## 5. 核心组件

### Worker ingress

负责：

- OAuth connect intent 创建
- Outlook OAuth callback
- reauthorize 入口
- Graph webhook ingress
- validationToken
- operator Basic Auth 边界
- clientState 校验
- mailbox routing
- OTP 首页读接口
- 其他查询 API

不负责：

- mailbox state 推进
- fetch / parse / recover 主逻辑

### Public vs protected route boundary

这一节是当前 Worker route inventory 的 **canonical source of truth**。

README 只引用这里，不再单独维护第二份 endpoint 清单。

Worker 是公网暴露的，但路由边界不是“全部公开”。

#### 公开路由

这几个路由保持公网可达，因为它们承接 OAuth 和 Microsoft Graph 回调：

- `GET /oauth/outlook/start`
- `GET /oauth/outlook/callback`
- `POST /api/webhooks/outlook`

#### 受保护的 operator 路由

这些路由都要求 HTTP Basic Auth：

- `GET /`
- `GET /connect/outlook`
- `GET /connect/result`
- `GET /api/mailboxes/connect-intents`
- `POST /api/mailboxes/connect-intents`
- `GET /api/otp-panel`
- `GET /api/hits`
- `GET /api/messages/:id`
- `GET /api/mailboxes/:id`
- `POST /api/mailboxes/:id/reauthorize`
- `POST /api/mailboxes/:id/recovery`

运行时约束：

- `PHASE0_OPERATOR_PASSWORD` 必填
- `PHASE0_OPERATOR_USERNAME` 可选，默认 `operator`

这条边界的意义很直接：

- 公开的是接入闭环
- 受保护的是 OTP、message detail、mailbox diagnostics 和人工动作

也就是说，这是公网 Worker，不是公网 operator 面板。

### Request validation policy

Worker ingress 现在固定遵循：

```text
parse request
-> runtime validate
-> authorize if needed
-> call core path
-> map response
```

关键语义：

- 非法 JSON 返回 `400`
- 结构不合法的 body 返回 `400`
- path/query 在入口层做最小边界校验
- 不把坏输入放进更深层再炸成 `500`

### Durable Object: mailbox coordinator

负责：

- mailbox lifecycle state
- subscription / lifecycle / renew / recovery 协调
- dedupe gate
- version gate
- token refresh 发起

### Queues

主题：

- `mail.fetch`
- `mail.parse`
- `mail.recover`
- `subscription.renew`

原则：

- 只传最小必要字段
- 不传完整 HTML 正文
- payload 必须带 mailbox id + version/generation
- 所有 consumer 必须按 at-least-once 语义设计幂等

### Consumers

#### fetch

- 拉 Graph message
- 标准化字段
- 写 `messages`
- 把大正文写 R2
- 推 parse job

#### parse

- 规则匹配
- 生成 `message_rule_matches`
- 生成 `hit_events`
- 维护 `mailbox_current_signals`
- 所有相关写入同事务提交

#### recover

- 跑 delta query
- 回补遗漏 message
- 重新执行 parse
- 修复 current signal projection
- 通知 DO 恢复结果

### Webhook ingress hardening

Graph webhook 仍然是公网入口，但处理顺序已经收敛成：

```text
validationToken shortcut
-> parse JSON
-> validate payload shape
-> reject empty batches
-> resolve subscription
-> verify clientState
-> persist accepted batch only
-> route to mailbox DO
```

几个关键约束：

- `payload.value` 不能为空数组
- 全部事件都被拒绝时，不写 blob
- raw payload 只对“至少有一条 accepted 事件”的批次落库
- mailbox 路由仍然由 subscription ownership 决定

### OAuth connect flow

个人 Outlook/Hotmail 账号接入走一条独立的 delegated OAuth 闭环：

```text
POST /api/mailboxes/connect-intents
-> GET /oauth/outlook/start
-> Microsoft login / consent
-> GET /oauth/outlook/callback
-> Graph /me
-> upsert mailbox + credential
-> DO onboard
-> async subscription.renew
```

对已进入 `reauth_required` 的 mailbox，走同一条链路，只是由：

```text
POST /api/mailboxes/:id/reauthorize
```

发起。

`pending_auth` 只存在于账号层 `auth_status`，不进入 DO 生命周期。
DO 继续只表达 mailbox 运行态，不表达“OAuth 进行中”。

这里还有一个关键安全约束：

- connect intent 只能由 operator 创建
- connect mode 默认是通用授权发起，不预绑定邮箱身份
- callback 只能消费已落库的 `state_nonce`
- `redirectAfter` 只允许站内相对路径

所以公开的是 Microsoft OAuth 回调闭环，不是一个开放跳板。

---

## 6. Read Model

### OTP 首页专用 read API

首页必须走专用 read API。

原因不是“多一个接口更优雅”。

而是要把首页语义收窄成一个明确模型：

- 当前是否有最新 OTP
- 当前是否处于 waiting
- 当前是否存在 delivery path unhealthy
- 最新 OTP 来自哪个 mailbox
- 最近几条 OTP 历史是什么
- 当前有哪些非 OTP signal 作为次级信息

前端不应通过拼接通用 `/api/hits` 或 message detail 自己推导首页。

### Projection 结构

当前锁定的方向是单表多 signal projection：

- 表名建议：`mailbox_current_signals`
- 唯一键：`mailbox_id + signal_type`

这张表承担的是“每个 mailbox 当前最新 signal”的持久化结果。

OTP 首页再在此基础上做跨 mailbox 聚合，并保持 OTP 优先。

### 覆盖规则

projection 更新必须遵守这些语义：

- 新 signal 可以覆盖旧 signal
- 迟到的旧事件不能覆盖更新 signal
- duplicate replay 不应改变 current signal
- recovery 可以修复缺失，但不能回滚到更旧的当前状态

---

## 7. Ownership

| 数据/状态 | canonical owner |
|---|---|
| mailbox lifecycle state | Durable Object |
| `subscription_version` | Durable Object，PG 保留快照 |
| `recovery_generation` | Durable Object，PG 保留快照 |
| `cursor_generation` | DO 决定推进，PG 存 checkpoint |
| mailbox OAuth connect intent | Postgres |
| mailbox `auth_status` | Postgres |
| operator auth boundary | Worker ingress |
| `messages` | Postgres |
| `message_rule_matches` | Postgres |
| `hit_events` | Postgres |
| `mailbox_current_signals` | Postgres，且只能由 parse/reparse 路径写入 |
| raw webhook payload | R2 |
| `body_html` | R2 |
| preview / excerpt / parsed fields | Postgres |

### 关键约束

- DO 不是首页 read model owner
- Postgres 不是 mailbox lifecycle owner
- Worker ingress 是公网边界与 operator auth owner
- projection 只有 parse 路径能写
- facts、hits、projection 必须同事务提交
- 公开 OAuth/webhook 路由不能顺带暴露 operator 数据面
- `redirectAfter` 不能离开站内路径空间

---

## 8. Versioned Mailbox State

必须定义并坚持这些版本语义：

- `subscription_version`
- `recovery_generation`
- `cursor_generation`
- `mailbox_state_version`

规则：

1. 旧 subscription 事件不能覆盖新 subscription
2. 旧 recovery job 不能覆盖新 generation
3. cursor 不能倒退
4. lifecycle 迟到事件必须能被拒绝
5. 迟到 parse / recover 结果不能把 projection 回退到旧 signal

---

## 9. 首页状态来源

OTP 首页的状态不是纯前端文案层判断。

它依赖后端 read model 的明确语义输出。

至少要能稳定区分：

- `ready`
- `waiting_for_code`
- `delivery_path_unhealthy`
- `empty`

其中：

- `ready` 由最新 OTP projection 驱动
- `waiting_for_code` 代表当前无新 OTP，但链路健康
- `delivery_path_unhealthy` 代表 mailbox 生命周期或投递链路存在异常
- `empty` 代表系统尚无可展示历史

补一个前提：

- OTP 首页是 operator 页面，不是匿名公开页面
- 所以这些状态语义建立在已通过 Basic Auth 的前提下

---

## 10. 架构成功标准

架构成立的判断标准不是“接口更多”或“表更全”。

而是：

1. parse 路径可以稳定地产生 facts、hits 与 current signal projection
2. OTP 首页不依赖临时扫描 facts 也能返回 latest-code-first 结果
3. recovery 能修复遗漏数据，但不能错误回滚当前 signal
4. mailbox lifecycle ownership、facts ownership、blob ownership 始终清晰
5. 首页主流程始终服务 `看到最新 code -> 复制`
6. 公网边界清晰，OAuth/webhook 公开，operator 面受保护
7. 坏输入在入口层被稳定收敛为 `400`
