# ARCHITECTURE.md

## 1. 产品定位

本项目不是通用邮箱客户端。

它是一个面向大规模 Outlook 邮箱资源的 **实时邮件信号系统**。

当前 V1 只解决一个更窄、更值钱的问题：

> 哪些 Outlook Inbox 新邮件，已经足够值得我现在处理？

这意味着：

- 先证明 Cloudflare-native 路径可行
- 先打穿最小可靠信号链路
- 先做命中工作台，不做完整后台

---

## 2. 架构边界

### V1 要做的

- Outlook Inbox 新邮件接入
- mailbox state coordination
- 规则驱动的信号提取
- 命中事件生成
- 命中工作台
- mailbox health 摘要
- recovery 正确性

### V1 不做的

- workspace / 多工作区产品心智
- 完整邮箱池控制台
- 完整独立搜索中心
- SSE 实时推送
- 重规则管理 UI
- 系统/API 一级页面

这些不是永远不做，而是 **V1 明确后置**。

---

## 3. 架构前提

在正式实现前，必须先完成 **Cloudflare-native Phase 0**。

原因很简单：

这个系统最大的风险不是 CRUD，不是语言，不是“用不用 Go”。

最大的风险是：

- mailbox lifecycle state 能不能被稳定协调
- webhook / lifecycle / renew / recovery 乱序下 version gate 能不能成立
- queue backlog 会不会让系统看起来可用、实际上对运营无用
- token churn / reauth 是否可控
- body 存储是否会把 PostgreSQL 拖死

所以这份架构不是“直接进入实现”的架构。

它是：

> 先验证 Cloudflare 运行边界，再进入实现的架构。

---

## 4. 架构主线

### 最小可靠链路

```text
mailbox onboarding
-> ensure Inbox subscription
-> webhook ingress
-> mailbox coordinator
-> fetch message details
-> evaluate rules
-> create hit events
-> query hit feed
```

这是 V1 唯一必须先打穿的链路。

### 补偿链路

```text
missed notification / stale lifecycle / delayed mailbox
-> mark mailbox recovery needed
-> run delta query
-> fetch missed messages
-> re-run rules
-> restore missing hit events
```

recovery 不是后期优化。

它是 correctness 主链路的一部分。

---

## 5. 核心架构判断

### 5.1 mailbox 是一级状态机单元

这个系统的真实复杂度不是“更多 worker”，而是：

- subscription 生命周期
- webhook / lifecycle / renew / recovery 乱序
- token refresh / reauth
- cursor 推进与重建
- 幂等

因此 mailbox 必须是一级协调单元。

### 5.2 Durable Object 是唯一协调边界

每个 mailbox 对应一个 Durable Object。

它负责：

- mailbox lifecycle state
- `subscription_version`
- `recovery_generation`
- `cursor_generation`
- dedupe / version gate
- renew / recovery / reauth 决策

任何 mailbox lifecycle state 变更都只能通过 DO 推进。

### 5.3 Queue consumer 不拥有 mailbox lifecycle state

Queue consumer 只负责：

- 执行任务
- 写业务事实
- 返回结果

如果任务结果需要改变 mailbox 状态，必须回到 DO 协调。

### 5.4 PG 存事实，R2 存大对象

- **Postgres**：事实、索引、查询模型、历史记录
- **R2**：`body_html`、raw payload、超大 message body、调试素材
- **DO storage**：mailbox 当前协调状态、短期版本/epoch、去重窗口

---

## 6. 核心组件

### Worker ingress

负责：

- Graph webhook ingress
- validationToken
- clientState 校验
- mailbox routing
- query/read API

不负责：

- mailbox state 推进
- fetch / parse / recover 主逻辑

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
- `message_rule_matches`
- `hit_events`
- 命中原因与置信度

#### recover

- 跑 delta query
- 回补遗漏 message
- 处理 cursor reset path
- 通知 DO 恢复结果

### Query read model

负责：

- hit feed
- message detail
- mailbox health summary
- 最小筛选

---

## 7. ownership

| 数据/状态 | canonical owner |
|---|---|
| mailbox lifecycle state | Durable Object |
| `subscription_version` | Durable Object，PG 保留快照 |
| `recovery_generation` | Durable Object，PG 保留快照 |
| `cursor_generation` | DO 决定推进，PG 存 checkpoint |
| `messages` | Postgres |
| `message_rule_matches` | Postgres |
| `hit_events` | Postgres |
| raw webhook payload | R2 |
| `body_html` | R2 |
| preview / excerpt / parsed fields | Postgres |

---

## 8. versioned mailbox state

必须定义：

- `subscription_version`
- `recovery_generation`
- `cursor_generation`
- `mailbox_state_version`

规则：

1. 旧 subscription 事件不能覆盖新 subscription
2. 旧 recovery job 不能覆盖新 generation
3. cursor 不能倒退
4. lifecycle 迟到事件必须能被拒绝
5. queue replay 不得重复生成 hit

---

## 9. mailbox lifecycle state taxonomy

最小状态集：

- `healthy`
- `delayed`
- `recovery_needed`
- `recovering`
- `reauth_required`
- `disabled`

### 状态流转

```text
healthy
  -> delayed
  -> recovery_needed
  -> reauth_required

recovery_needed
  -> recovering
  -> reauth_required

recovering
  -> healthy
  -> delayed
  -> reauth_required

reauth_required
  -> healthy

disabled
  -> healthy   (only via operator action)
```

---

## 10. 主时序

### 实时链路

```text
1. Outlook Inbox 收到邮件
2. Graph 推 webhook
3. Worker ingress 校验并路由 mailbox DO
4. DO 做 dedupe / version gate / state decision
5. DO 发出 fetch job
6. fetch consumer 拉 message 详情
7. parse consumer 跑规则
8. 生成 hit_events
9. query API 提供命中工作台读取
```

### recovery 链路

```text
1. stale lifecycle / drift / missed notification 触发 recovery_needed
2. DO 发出 recover job
3. recover consumer 读取 delta cursor
4. delta query 拉增量
5. 回补遗漏 messages
6. 重跑规则
7. 更新 cursor
8. DO 决定恢复完成
```

### 一致性要求

这里最重要的不是“能不能跑通”，而是：

- webhook 与 delta 同时处理同一 message 时不重复
- `messages` / `message_rule_matches` / `hit_events` 幂等
- cursor 不倒退
- stale lifecycle 不污染当前 mailbox 状态

---

## 11. 查询模型

### 命中工作台

首页只读 `hit_events`。

这是第一性路径。

### 最小查询面

V1 先支持：

- hit feed
- message detail
- sender / recipient / keyword 的最小筛选
- 异常摘要

### detail 读取原则

- preview-first
- 按需读 R2
- R2 缺失时 graceful fallback

### 后置能力

以下能力后置：

- 完整独立搜索页
- 更广泛的历史检索
- 更复杂的全文能力
- OpenSearch / Elasticsearch

V1 直接用 PostgreSQL。

---

## 12. 安全边界

### webhook

- validationToken 单独处理
- clientState 校验
- malformed payload 审计
- replay / stale event 防护

### 凭据

- refresh token 加密存储
- 凭据与 mailbox 主表分离
- token refresh 由 DO 发起，auth helper 执行

### 正文与 payload

- raw payload 和 `body_html` 默认不进 PG 热路径
- R2 retention / 访问策略必须定义

### 内部 API

- 命中流、detail、mailbox health 都要最小权限边界
- mailbox state 手动操作要有 audit log

---

## 13. 性能目标

目标保持不变：

- 支持 10000 个 Outlook 邮箱
- 新邮件 10 秒内进入命中工作台

但必须经过 Phase 0 实测确认，不是默认成立。

### 必须观测的基线

- queue backlog age
- per-mailbox event rate
- hit feed query p50/p95
- detail with R2 fallback p50/p95
- recovery completion latency
- hot mailbox burst behavior

---

## 14. 调度边界

### Cron

只做：

- 周期扫描
- 发现候选 mailbox
- backlog / health 巡检

### Workflows

只做：

- 长链路恢复编排候选
- 需要可恢复步骤的 renew / reauth / recovery orchestration

### 明确禁止

- Cron 直接改 mailbox lifecycle state
- Workflows 直接改 mailbox lifecycle state
- 多个调度源并发推进同一个 mailbox 状态

---

## 15. V1 架构决策摘要

### 决策 1

先做 **Cloudflare-native Phase 0**，再进入正式实现。

### 决策 2

使用 Graph webhook 作为实时入口。

### 决策 3

使用 Inbox delta query 作为补偿链路。

### 决策 4

recovery 属于 correctness 主链路，不是后期增强。

### 决策 5

DO 是 mailbox lifecycle state 的唯一协调边界。

### 决策 6

Queue consumer 不直接改 mailbox lifecycle state。

### 决策 7

SSE、完整搜索页、完整邮箱池页、workspace 后置。

---

## 16. 最后的边界定义

这个系统现在不是在做：

- Outlook 替代品
- 多租户邮件平台
- 完整后台运维系统
- Cloudflare 化的 Go 多 worker 翻版

它现在只在做：

> Outlook Inbox 新邮件接入  
> -> mailbox state coordination  
> -> 规则命中  
> -> 可处理信号事件

这就是收窄后的 V1 架构边界。
