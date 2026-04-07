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

- Outlook Inbox 新邮件接入
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
-> ensure Inbox subscription
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
-> run delta query
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

- Graph webhook ingress
- validationToken
- clientState 校验
- mailbox routing
- OTP 首页读接口
- 其他查询 API

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
- projection 只有 parse 路径能写
- facts、hits、projection 必须同事务提交

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

---

## 10. 架构成功标准

架构成立的判断标准不是“接口更多”或“表更全”。

而是：

1. parse 路径可以稳定地产生 facts、hits 与 current signal projection
2. OTP 首页不依赖临时扫描 facts 也能返回 latest-code-first 结果
3. recovery 能修复遗漏数据，但不能错误回滚当前 signal
4. mailbox lifecycle ownership、facts ownership、blob ownership 始终清晰
5. 首页主流程始终服务 `看到最新 code -> 复制`
