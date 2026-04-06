# CLOUDFLARE_IMPLEMENTATION_PLAN.md

## 1. 目标

基于已批准的 Cloudflare-native 方案，构建 Outlook Mail Radar 的新实现计划。

这个版本的目标不是“把 Go 部署到 Cloudflare”，而是：

> 把系统从一组需要自管的 Go API / worker 进程，重构成一个以 Cloudflare 托管能力为主、以 Postgres 为事实库的 mailbox state machine network。

V1 仍然只围绕这条主链路：

```text
mailbox onboarding
-> ensure subscription
-> webhook ingress
-> mailbox coordinator
-> fetch
-> parse
-> hit event
-> hit workbench
-> recovery
```

## 2. Compatibility Decision

- Compatibility required: **no**
- Breaking changes accepted: **yes**
- Transitional layers planned: **none**
- Old Go 多 worker 路径 scheduled for deletion: **yes**
- Direct convergence target: **Workers + Queues + Durable Objects + Hyperdrive/Postgres + R2**

### Refactor Check

- Thin wrappers added: **none**
- Aliases preserved: **none**
- Legacy branches preserved: **none**

### Plan Check

- Breaking changes accepted: **yes**
- Transitional layers planned: **none**
- Old paths scheduled for deletion: **yes**
- Direct caller updates planned: **yes**

## 3. 核心原则

### 3.1 mailbox 是一级状态机单元

系统的真正复杂度不是“更多 worker”，而是：

- subscription 生命周期
- webhook / lifecycle / recovery / renew 乱序
- token refresh / reauth
- cursor 推进和重建
- 幂等

因此 mailbox 必须是一级协调单元。

### 3.2 DO 是 mailbox lifecycle state 的唯一协调边界

任何 mailbox lifecycle state 变更都只能通过 Durable Object 推进。

这些状态不允许被 Queue consumer、Cron、Workflow 或普通 Worker 直接写入：

- `healthy`
- `delayed`
- `recovery_needed`
- `recovering`
- `reauth_required`
- `disabled`

### 3.3 PG 存事实，R2 存大对象，DO 存短期协调状态

- **Postgres**：事实、索引、查询模型、历史记录
- **R2**：`body_html`、raw payload、超大 message body、调试素材
- **DO storage**：mailbox 当前协调状态、短期版本/epoch、去重窗口

### 3.4 Queue consumer 不拥有 mailbox state

Queue consumer 只负责：

- 执行任务
- 写业务事实
- 返回结果

如果任务结果需要推进 mailbox 状态，必须回到 DO 协调。

### 3.5 不做兼容层

不保留：

- Go worker 到 Cloudflare 组件的薄映射层
- 双写双读
- 旧接口兼容壳
- 过渡 adapter

目标是直接收敛到新结构。

## 4. 目标架构

```text
Outlook / Graph
    │
    ▼
Cloudflare Worker
  - webhook ingress
  - query API
  - auth / routing
    │
    ▼
Durable Object: Mailbox Coordinator
  - lifecycle state
  - version gate
  - dedupe gate
  - recovery / renew decision
    │
    ├── enqueue jobs
    ▼
Cloudflare Queues
  - mail.fetch
  - mail.parse
  - mail.recover
  - subscription.renew
    │
    ▼
Consumers
  - fetch / parse / recover helpers
    │
    ├── Postgres via Hyperdrive
    └── R2

Periodic / orchestration:
  - Cron: discover candidates / low-frequency scans
  - Workflows: long-running orchestration candidate
```

## 5. 模块拆分

### 5.1 `worker-ingress`

职责：

- Graph webhook ingress
- validationToken 处理
- clientState 校验
- mailbox routing
- query/read API

不负责：

- mailbox state 推进
- fetch / parse / recover 主逻辑

### 5.2 `mailbox-coordinator`（Durable Object）

职责：

- mailbox lifecycle state
- `subscription_version`
- `recovery_generation`
- `cursor_generation`
- dedupe window
- renew / recovery / reauth 决策
- token refresh 发起

### 5.3 `queue-contracts`

定义统一 job payload：

- `mail.fetch`
- `mail.parse`
- `mail.recover`
- `subscription.renew`

规则：

- payload 只传最小必要字段
- 不传大正文
- 必须带 mailbox id + version/generation 信息

### 5.4 `consumers/fetch`

职责：

- 拉 Graph message
- 标准化字段
- 写 `messages`
- 需要时写 R2
- 推送 parse job

### 5.5 `consumers/parse`

职责：

- 规则匹配
- `message_rule_matches`
- `hit_events`
- 命中原因与置信度

### 5.6 `consumers/recover`

职责：

- 跑 delta query
- 回补遗漏 message
- 处理 cursor reset path
- 通知 DO 恢复结果

### 5.7 `query-read-model`

职责：

- hit feed
- mailbox health summary
- message detail
- 最小筛选

## 6. 数据 ownership

| 数据 | canonical owner | 说明 |
|---|---|---|
| mailbox lifecycle state | DO | 当前 mailbox 的运行态 |
| `subscription_version` | DO | PG 可保留快照 |
| `recovery_generation` | DO | PG 可保留快照 |
| `cursor_generation` | DO + PG | DO 决定是否推进，PG 存 checkpoint |
| `messages` | PG | 业务事实 |
| `message_rule_matches` | PG | 业务事实 |
| `hit_events` | PG | 业务事实 / 查询主表 |
| raw webhook payload | R2 | 大对象 |
| `body_html` | R2 | 大对象 |
| preview / excerpt / parsed fields | PG | 查询字段 |

## 7. versioned mailbox state

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

## 8. Phase 0: Cloudflare-native 可行性验证

正式实现前，必须先做 Cloudflare-native Phase 0。

### 8.1 要验证的问题

1. DO 能否稳定作为 mailbox 单协调边界
2. webhook / lifecycle / renew / recovery 乱序下 version gate 是否成立
3. Queue backlog age 对运营体验的影响是否可接受
4. PG / R2 split 是否能明显降低存储压力
5. token refresh / reauth / recovery 的 operator workflow 是否清晰

### 8.2 最小实验范围

```text
mailbox onboarding
-> ensure subscription
-> webhook ingress
-> mailbox DO decision
-> fetch
-> parse
-> hit
-> read hit feed
```

### 8.3 必做故障注入

- duplicate webhook
- malformed payload
- out-of-order lifecycle
- stale subscription event
- queue backlog delay
- token refresh failure
- invalid delta cursor
- R2 object missing

### 8.4 Exit Criteria

- mailbox state transition table 已验证
- backlog age 可观测且可体现在 mailbox health 中
- duplicate / replay / overlap 不产生重复 hit
- reauth / recovery 状态对 operator 可见
- 可以做 `Go / Narrow Further / No-Go` 判断

## 9. Phase 1: Foundation

### 目标

搭起 Cloudflare-native 最小骨架。

### 交付物

- Worker 项目骨架
- DO skeleton
- Queue contracts
- Hyperdrive + Postgres 接入
- R2 bucket 接入
- 基础 schema

### 任务

1. 建立 Worker / DO / Queue / R2 / Hyperdrive 项目结构
2. 定义 mailbox state machine 和 version 字段
3. 落库最小 schema
4. 定义 queue payload schema
5. 建立基础日志和 metrics namespace

## 10. Phase 2: Ingress + Mailbox Coordinator

### 目标

让 webhook 能稳定进入 mailbox coordination 边界。

### 交付物

- webhook ingress
- validationToken path
- clientState 校验
- mailbox coordinator 路由
- mailbox lifecycle state taxonomy

### 任务

1. 实现 webhook Worker
2. 实现 mailbox DO 获取与路由
3. 定义 lifecycle state：
   - `healthy`
   - `delayed`
   - `recovery_needed`
   - `recovering`
   - `reauth_required`
   - `disabled`
4. 实现 version gate
5. 实现 dedupe gate

## 11. Phase 3: Fetch + Parse + Hit

### 目标

打通 fetch / parse / hit 主链路。

### 交付物

- `mail.fetch`
- `mail.parse`
- `messages`
- `message_rule_matches`
- `hit_events`

### 任务

1. fetch consumer 调 Graph 拉 message
2. 正文分流：
   - preview / excerpt -> PG
   - html / raw body -> R2
3. parse consumer 跑验证码和关键词规则
4. hit dedupe
5. 命中原因、置信度、可解释字段

## 12. Phase 4: Query Read Model

### 目标

让命中流成为默认工作入口。

### 交付物

- hit feed API
- mailbox health summary API
- message detail API
- processed 状态

### 任务

1. hit feed 查询
2. message detail：
   - preview-first
   - 按需读取 R2
   - R2 缺失时 graceful fallback
3. mailbox health summary
4. 最小筛选能力

## 13. Phase 5: Renew + Recovery + Hardening

### 目标

让系统在失败下仍然可信。

### 交付物

- renew path
- recovery path
- cursor reset path
- backlog age visibility
- reauth workflow

### 任务

1. token refresh：**DO 发起，auth helper 执行**
2. renew path：
   - Cron 发现候选
   - DO 决策
   - Queue / Workflow 执行
3. recovery path：
   - lifecycle missed / drift / stale feed -> `recovery_needed`
   - recover consumer 跑 delta
   - DO 决定恢复完成
4. hot mailbox 背压策略
5. degraded / delayed / reauth / recovery 状态全部对 operator 可见

## 14. Cron / Workflows 分工

### Cron

只做：

- 周期扫描
- 发现候选 mailbox
- backlog/health 巡检

### Workflows

只做：

- 长链路恢复编排候选
- 需要可恢复步骤的 renew / reauth / recovery orchestration

### 明确禁止

- Cron 直接改 mailbox lifecycle state
- Workflows 直接改 mailbox lifecycle state
- 多个调度源并发推进同一个 mailbox 状态

## 15. 测试策略

### Unit

1. mailbox state transition table
2. subscription version gate
3. hit dedupe idempotency
4. cursor advance / reset
5. parser 行为：
   - empty body
   - html-only
   - quoted text

### Integration

1. duplicate webhook
2. out-of-order lifecycle
3. queue replay on same message
4. delta recovery overlaps webhook
5. token refresh fail -> `reauth_required`
6. R2 missing body fallback

### E2E

1. onboarding -> hit visible
2. delayed / degraded / recovery-needed 对 operator 可见
3. detail preview-first + R2 fallback

### Performance / Operability baselines

必须记录：

- queue backlog age
- per-mailbox event rate
- hit feed query p50/p95
- detail with R2 fallback p50/p95
- recovery completion latency
- hot mailbox burst behavior

## 16. Rollout

### Stage 0

Phase 0 实验系统

### Stage 1

小 cohort canary：

- 10 mailboxes
- 100 mailboxes

### Stage 2

扩大 cohort：

- 500 mailboxes
- 1000 mailboxes

### Stage 3

Cloudflare-native 成为主路径，删除旧 Go 多 worker 方案

## 17. NOT in scope

- 保留 Go 多 worker 作为长期并行主路径
- 兼容 adapter / bridge / 双写
- 完整搜索页
- 完整邮箱池页面
- 重规则管理 UI
- SSE / push fanout
- workspace / 多租户
- D1 替代 Postgres
- Workflows-first 的全系统平台编排

## 18. Done 标准

必须同时满足：

1. 命中流成为内部运营默认工作入口
2. webhook / lifecycle / renew / recovery 乱序下仍保持正确性
3. duplicate / replay / overlap 不产生重复 hit
4. `reauth_required / delayed / recovery_needed / recovering` 可见
5. PG / R2 split 稳定
6. queue backlog 对 operator 可见
7. 除 Postgres 外没有长期自管服务依赖

## 19. 最后执行原则

任何实现选择都回到这 3 个问题：

1. 这会不会破坏 mailbox 单协调边界？
2. 这会不会把生命周期状态写回多个组件？
3. 这会不会让 operator 看不到系统正在失败？

只要其中一个答案是“会”，就不要做。
