<!-- /autoplan restore point: /Users/bin/.gstack/projects/manual-review/autoplan-restore-20260406-223128.md -->
# IMPLEMENTATION_PLAN.md

> Superseded for the Cloudflare-native direction by `docs/CLOUDFLARE_IMPLEMENTATION_PLAN.md`.
>
> 这份文档保留为 **历史 Go 多 worker 实现计划**。如果当前执行方向是已批准的 Cloudflare-native 重构，请以新文档为准，不要继续按本文件开工。

## 1. 目标

构建 Outlook Mail Radar 的 V1。

V1 要完成这条最短闭环：

```text
Inbox message
-> webhook
-> fetch
-> store
-> parse
-> hit event
-> homepage
```

这是系统的核心。其余都要为它服务。

## 2. 实施策略

不要先做大平台。

不要先做“未来可能用得上”的抽象。

先把真正有价值的链路跑通：

- 实时接收 Inbox 邮件
- 标准化入库
- 跑规则
- 首页看到命中结果

本计划已根据 autoplan review snapshot 收窄，明确采用以下 V1 决策：

- 增加 **Phase 0: 可行性验证**
- V1 采用 **单租户 / 单工作空间** 假设，不实现 workspace 心智
- **不把 SSE 放进 V1**
- **不做完整独立搜索页**
- **不做完整邮箱池页面**
- **不做重规则管理 UI**
- V1 只围绕“最小可靠信号链路 + 命中工作台”建设

## 3. 里程碑

### Milestone 0
Graph / token / subscription / recovery 可行性验证

### Milestone 1
最小 schema、repo 层、项目骨架

### Milestone 2
Inbox subscription、webhook ingress 和 message ingestion

### Milestone 3
规则引擎与 hit feed 生成

### Milestone 4
最小命中工作台、message detail、异常摘要

### Milestone 5
Delta recovery、幂等、加固

## 4. Phase 0: Feasibility / Survivability Validation

### 目标

在重工程投入前，证明这条路在真实平台约束下活得下来。

### 必须验证的问题

1. Graph subscription 创建、续订、失效和重建在真实邮箱样本下是否稳定
2. token churn / reauth 的真实运营成本是多少
3. webhook -> hit event 的端到端延迟能否稳定逼近 10 秒
4. webhook 与 delta recovery 双链路并发时能否保持幂等
5. message body / HTML 存储对 PostgreSQL 的体量和查询压力是否可接受

### 任务

#### 4.0.1 小规模真实样本验证

- 用真实 Outlook 邮箱样本建立 100 / 500 / 1000 级别实验
- 记录 subscription 成功率、续订成功率、通知延迟、message fetch 失败率

#### 4.0.2 token / reauth 压力验证

- 观察 refresh token 失败模式
- 记录连续失败、reauth_required、人工干预成本

#### 4.0.3 双链路幂等验证

- 人为制造 webhook 漏失
- 触发 delta recovery
- 验证 `messages` / `message_rule_matches` / `hit_events` 不重复

#### 4.0.4 存储与查询压力验证

- 用真实邮件样本测正文体量
- 观察 body_text/body_html 对 PostgreSQL 的索引和查询压力

### Exit Criteria

- 已拿到真实平台基线数据
- 已确认主风险不是致命阻塞
- 已明确哪些约束需要反映到 schema 和 worker 设计里

## 5. Phase 1: Foundation

### 目标

建立最小可用的持久化模型和项目骨架，但只服务单租户 V1。

### 交付物

- PostgreSQL migration v1
- repo 接口和实现
- Go 项目结构
- 配置加载
- 默认规则 seed

### 任务

#### 5.1 创建项目结构

- `cmd/api`
- `cmd/worker-ingest`
- `cmd/worker-rules`
- `cmd/worker-subscription`
- `cmd/worker-recovery`
- `internal/auth`
- `internal/subscriptions`
- `internal/ingest`
- `internal/rules`
- `internal/query`
- `internal/repo`
- `internal/api`
- `internal/models`
- `internal/queue`
- `internal/graph`

#### 5.2 添加 migration runner

- 选 migration 工具
- 接入 `0001_init_mail_radar.sql`
- 在进入实现前先移除或禁用 workspace 驱动的运行时心智
- 验证数据库可初始化

#### 5.3 实现 repo 层

- mailbox repo
- credential repo
- subscription repo
- cursor repo
- message repo
- rule repo
- hit repo
- error repo

#### 5.4 默认 seed

- 默认规则：
  - verification_code_default
  - reward_keywords_default

### Exit Criteria

- 数据库可迁移
- repo 基本测试通过
- 默认规则存在
- 单租户假设已经落实到代码边界里

## 6. Phase 2: Mailbox Auth + Subscription + Ingestion

### 目标

让 mailbox 可接入，并打通最小可靠链路：

```text
mailbox register
-> ensure subscription
-> webhook ingress
-> fetch message
-> upsert message
```

### 交付物

- mailbox 注册流程
- token refresh
- Inbox subscription 创建
- renewal worker
- lifecycle event 处理
- webhook endpoint
- notification 入队
- fetch worker
- message upsert

### 任务

#### 6.1 auth 模块

- 保存 credential
- 刷 token
- token 失败统计
- reauth 状态写回

#### 6.2 mailbox 注册

- 建 mailbox record
- 保存 encrypted credential
- 拉 Graph user id
- 解析 Inbox folder id

#### 6.3 subscription 创建

- 为每个 mailbox 创建 Inbox subscription
- 写入 `mailbox_subscriptions`
- 计算 `renew_after`
- 明确定义续订抖动和批次切片规则

#### 6.4 renewal worker

- 查询待续订 subscription
- 分批续订
- 更新 `expires_at`
- 记录失败

#### 6.5 lifecycle handler

- 处理：
  - missed
  - subscriptionRemoved
  - reauthorizationRequired
- 标记 mailbox recovery

#### 6.6 webhook handler

- 支持 validationToken
- 校验 clientState
- 转换成内部事件
- 快速入队

#### 6.7 notification consumer

- 通过 `subscription_id` 找 `mailbox_id`
- 处理旧 subscription / 乱序 lifecycle 的情况
- 更新 `last_notification_at`
- 推送 `mail.fetch`

#### 6.8 message fetcher

- 获取 access token
- 调 Graph message endpoint
- 标准化字段
- upsert `messages`
- 更新 mailbox freshness

#### 6.9 幂等边界

- 明确 message 唯一性定义
- 明确 hit 唯一性定义
- 确保重复 webhook / fetch 不造成重复写入

#### 6.10 错误处理

- auth failure
- fetch failure
- `mailbox_errors` 记录

### Exit Criteria

- mailbox 可注册
- subscription 存在
- renewal 正常工作
- lifecycle event 可进入内部处理链路
- 新邮件能写入 `messages`
- 重复 notification 不重复写
- `subscription -> mailbox` 映射在旋转和乱序情况下仍正确

## 7. Phase 3: Rule Engine + Hit Event

### 目标

把 message 变成可靠的信号事件。

### 交付物

- rule engine
- parse worker
- `message_rule_matches`
- `hit_events`
- confidence 分级

### 任务

#### 7.1 rule loading

- 加载启用规则
- 按 priority 排序

#### 7.2 规则匹配

- sender match
- subject match
- body match
- verification code extraction
- keyword extraction

#### 7.3 confidence

- high
- medium
- low

先用简单启发式。
重点优先：
- 验证码规则
- 高价值关键词规则
- 命中原因可解释

#### 7.4 记录 rule matches

- 写 `message_rule_matches`
- 保存结构化 `match_reason`

#### 7.5 生成 hit events

- 每个 matched rule/value 生成一条
- 做业务去重
- 更新 `mailbox_accounts.last_hit_at`

#### 7.6 message parse state

- success -> parsed
- failure -> failed

#### 7.7 双链路并发幂等

- 明确 webhook 与 delta recovery 同时处理同一 message 的语义
- 确保 `messages` / `message_rule_matches` / `hit_events` 不重复
- 确保 cursor 不倒退

### Exit Criteria

- 命中 message 能产生 hit event
- 重复 parse 不重复生成 hit
- rule 命中原因可追溯

## 8. Phase 4: Minimal Hit Workbench

### 目标

让产品先变成可工作的“命中工作台”，不是完整后台。

### 交付物

- hit feed endpoint
- message detail endpoint
- 异常摘要接口
- 首页最小筛选能力

### 任务

#### 8.1 hit feed query

支持过滤：

- 时间范围
- hit type
- sender
- recipient
- processed
- confidence

#### 8.2 message detail

- message fields
- HTML/text body
- associated hits

#### 8.3 最小筛选与详情交互

- 首页支持最少必要筛选
- 详情在不离开主界面的前提下打开
- 明确“已处理”状态模型
- 明确新命中到达行为
- 明确空状态 / 错误状态 / 重连状态

#### 8.4 异常摘要

- 只展示影响主工作流的问题：
  - reauth required
  - delayed
  - error
  - recovery needed

### Exit Criteria

- 首页可展示 recent hit feed
- 首页支持真实工作流处理
- 详情和处理动作不破坏主列表上下文
- 异常摘要可发现阻塞主工作流的问题

## 9. Phase 5: Delta Recovery + Hardening

### 目标

让系统在失败情况下仍可信。

### 交付物

- recovery worker
- delta cursor 持久化
- stale mailbox 检测
- 运维指标

### 任务

#### 9.1 recovery worker

- 读取 mailbox cursor
- 执行 delta query
- 补拉遗漏 messages
- 推 parse 任务
- 更新 delta link

#### 9.2 cursor reset path

- 处理失效 delta link
- 做有边界的重新同步
- 安全重建 delta cursor

#### 9.3 stale mailbox detection

- 长时间无 notification
- 长时间无 sync
- 标记 `needs_recovery`

#### 9.4 运维指标

- notifications received
- messages fetched
- parse success/failure
- hit events created
- recovery jobs completed
- end-to-end latency

#### 9.5 dead-letter

- notification failures
- fetch failures
- parse failures

### Exit Criteria

- missed notification 可恢复
- stale mailbox 可发现
- 系统在部分失败后仍能继续工作
- 双链路幂等和恢复正确性已通过验证

## 10. 推荐实现顺序

### 第一步

- Phase 0 可行性验证

### 第二步

- schema
- repo
- 默认规则 seed

### 第三步

- auth
- subscription ensure + renew
- webhook ingress
- fetch + store

### 第四步

- rules
- hit generation

### 第五步

- hit feed API
- message detail
- 异常摘要
- 最小筛选

### 第六步

- recovery
- 指标和加固

## 11. 测试策略

### Unit tests

覆盖：

- rule evaluation
- confidence
- hit dedupe
- mailbox state transition
- subscription renewal scheduling

### Integration tests

覆盖：

- migration boot
- repo CRUD
- message upsert idempotency
- hit event idempotency
- webhook 与 delta 双链路并发幂等

### E2E test

必须打通：

```text
fake webhook
-> notification queued
-> message fetched
-> message stored
-> rules evaluated
-> hit event created
-> hit feed query returns event
```

### Recovery test

必须打通：

```text
message missed by webhook
-> mailbox marked for recovery
-> delta sync runs
-> message appears
-> hit event created
```

### Phase 0 validation tests

必须记录真实基线：

- subscription 创建 / 续订速率
- token refresh 失败率
- webhook 到 hit 的端到端延迟
- 正文存储体量和查询退化
- 双链路并发幂等结果

## 12. 约束

### Constraint 1

不要在 webhook handler 里拉 message。

### Constraint 2

不要让 UI 直接查 Graph。

### Constraint 3

不要让 workers 同步互调，统一走队列边界。

### Constraint 4

第一版优先 recall，不要为了“看起来干净”牺牲命中率。

### Constraint 5

在 hit feed 跑稳前，不要做邮箱浏览型 UX。

### Constraint 6

在 Phase 0 完成前，不要推进完整平台化 UI。

### Constraint 7

V1 不引入 workspace、多工作区心智和重规则管理界面。

## 13. 主要风险

### 风险 1

OAuth token churn

### 风险 2

subscription renewal burst

### 风险 3

规则噪音过高

### 风险 4

message body 带来的数据库膨胀

### 风险 5

recovery 链路复杂度高

### 风险 6

Graph 配额、节流和 subscription 续订雪崩

### 风险 7

webhook / lifecycle / delta 乱序导致状态机错误

### 风险 8

message body / HTML 带来的 PostgreSQL 存储与查询压力

## 14. V1 Done 标准

V1 完成必须同时满足：

1. 新 Outlook Inbox 邮件能在 10 秒内进入首页命中流
2. keyword 和 verification code 两类规则都可用
3. 重复 notification 不产生重复 message 和重复 hit event
4. webhook 与 delta recovery 并发时仍保持幂等
5. 首页支持命中处理主工作流，不依赖跳转完整邮箱浏览
6. 异常摘要能暴露阻塞主工作流的问题
7. 已拿到真实 Phase 0 基线数据，并确认主风险可接受
8. 实际工作流中足以替代大部分手工检查邮箱
9. missed notifications 可通过 delta sync 恢复

## 15. V1 之后再考虑

- SSE 实时推送
- 完整搜索页
- 完整邮箱池页面
- 强规则管理 UI
- 系统/API 一级页面
- script-focused verification code endpoints
- mailbox allocation / leasing
- project-specific rules
- workspace / team 维度
- provider expansion

不要提前。

## 16. 最后的执行原则

永远围绕这个问题推进：

> 系统是否稳定地把 Outlook 新邮件转成可见、可操作的信号事件？

如果答案是否，就不要继续堆功能。
先修主链路。

## AUTOPLAN REVIEW SNAPSHOT

> Status: DONE_WITH_CONCERNS
>
> 说明：
> - 本节是基于当前文档运行后的 **autoplan review snapshot**
> - 当前快照来自 **codex-only** 的 CEO / Design / Eng 自动评审
> - 还没有完成完整的 autoplan 最终关口，因此这里是“评审结论快照”，不是最终批准版本
> - 你已选择按评审建议收窄计划，前文主计划已完成第一轮同步修改；本节保留为评审记录

### Plan Summary

当前计划的方向是对的，产品边界也比一开始更清楚了。

但三路评审给出的共同警告也很明确：

1. 这份计划仍然有往“过重平台 / 内部 ops 后台”滑的风险
2. 最大的不确定性不是代码，而是 **Graph / token / subscription / recovery** 在真实规模下是否可长期稳定
3. V1 需要进一步收窄，把资源集中在“可信信号主链路”，而不是提前铺完整平台能力

### Decisions Made

- Auto-decided findings: 14
- Taste decisions surfaced: 4
- User challenges surfaced: 3

## User Challenges

以下是评审中提出的 **用户挑战**。默认仍以你原来的方向为准，除非你明确决定接受这些改变。

### Challenge 1: 是否应该先加一个 Phase 0 可行性验证

**你当前方向：**
直接按 `Foundation -> Auth/Subscription -> Ingestion -> Rules -> Query -> Recovery` 的顺序推进。

**评审建议：**
在正式 Phase 1 之前增加一个 **Phase 0: 生存性验证 / 可行性验证**。

**为什么：**
- 10000 邮箱
- 10 秒 SLA
- Graph subscription / renewal / token churn

这些不是普通技术细节，而是产品生死线。如果这些先不验证，后面所有工程建设都可能是在高质量地走错方向。

**我们可能缺失的上下文：**
如果你已经在别处做过类似规模验证，这个挑战的重要性会下降。

**如果评审错了，代价是：**
会多做一轮前置验证，牺牲一点推进速度。

---

### Challenge 2: 是否应该把 V1 再收窄，而不是继续保持“Mail Radar”完整形态

**你当前方向：**
V1 是 Outlook Mail Radar，包含命中流、搜索、邮箱状态、规则、系统/API 等能力。

**评审建议：**
把 V1 再收窄成更尖的 wedge，例如：
- Verification Code Radar
- Reward Sender Alert
- Latest Actionable Signal API

**为什么：**
当前问题虽然已经比最初收敛很多，但实现计划仍然开始往平台化扩。  
评审认为，真正值钱的是“可操作的信号”，不是“看起来完整的邮件雷达”。

**我们可能缺失的上下文：**
如果你确实每天都同时依赖验证码和 reward/cashback/redeem 类信号，而且这些信号共享同一套基础设施，那保留 Mail Radar 也有理由。

**如果评审错了，代价是：**
可能把产品切得过窄，反而损失你的真实工作流收益。

---

### Challenge 3: 是否应该把 workspace 从 V1 移除

**你当前方向：**
从 schema 和 repo 起步就保留 `workspace` 维度，为未来产品化留边界。

**评审建议：**
V1 先做单租户 / 单工作空间模型，移除 workspace 心智和大部分相关复杂度。

**为什么：**
workspace 现在带来的复杂度是立刻的：
- 唯一键复杂化
- 查询复杂化
- 权限边界暗示提前引入

但 V1 并不会立即得到明显收益。

**我们可能缺失的上下文：**
如果你已经确定这套系统很快会进入多人或多工作区使用，那保留 workspace 是合理的。

**如果评审错了，代价是：**
后面再引入 workspace 会有一次重构成本。

## Taste Decisions

以下是评审中属于“合理人可能会分歧”的部分。

### Choice 1: SSE 要不要放进 V1

**推荐：先不做 SSE，先用轮询命中流。**

原因：
SSE 不是零成本增强，它会带来：
- 连接管理
- 重连
- last-event-id
- fanout
- UI 状态一致性

如果主链路还没完全稳定，SSE 会把排障复杂度提前拉高。

**另一种可行方案：**
保留 SSE 在 V1。

**代价：**
用户体验更好，但会更早引入实时连接语义和 UI 状态复杂度。

---

### Choice 2: 搜索页是否作为独立一级页面保留

**推荐：搜索先作为首页增强，不要一开始做成完整一级页面。**

原因：
当前主工作流更像“命中队列处理”，不是“全文检索工作台”。

**另一种可行方案：**
保留独立搜索页。

**代价：**
结构更完整，但容易让 V1 的精力分散到二级工作流。

---

### Choice 3: 邮箱池页面是否保留一级导航

**推荐：降级成“异常页”或“健康摘要入口”。**

原因：
邮箱池完整页面会天然把产品往 ops console 拉。

**另一种可行方案：**
保留完整邮箱池页面。

**代价：**
更利于运维，但更容易引出批量操作、租约、分配等平台化功能。

---

### Choice 4: 规则页先做“可解释”还是“可编辑”

**推荐：V1 先做规则可解释，不做重规则管理 UI。**

原因：
当前真正重要的是让你知道：
- 为什么命中
- 命中了什么
- 置信度为什么这样

而不是先把规则配置台做重。

**另一种可行方案：**
直接做规则管理界面。

**代价：**
灵活，但会引入更多状态、校验、冲突和调试成本。

## Cross-Phase Themes

以下主题在不同评审维度中重复出现，属于高置信信号。

### Theme 1: 不要过早平台化

CEO、Design、Eng 都指出了相同风险：

- CEO：你可能在很认真地建设一个尚未证明可行的“平台”
- Design：信息架构更像系统模块，而不是围绕主工作流的工具
- Eng：workspace、完整搜索、SSE、完整状态页都在提前引入平台复杂度

**结论：**
V1 要更尖、更窄。

---

### Theme 2: 真实主链路比外围能力更重要

三路评审都认为当前最该优先证明的是：

```text
subscription
-> webhook
-> fetch
-> message upsert
-> rule match
-> hit event
```

而不是：
- 完整导航
- 完整搜索
- 更重的 UI
- 更完整的系统页

---

### Theme 3: 真正的难点是一致性和运营，不是 CRUD

重复出现的高风险点：

- token churn
- subscription renewal
- webhook 与 delta 双链路幂等
- cursor 正确性
- mailbox health 状态机

**结论：**
这个系统本质上是“不可靠外部事件源驱动的状态同步系统”，不是普通后台。

## Deferred / Recommended to Re-scope

以下项目建议延后，或在收窄 V1 时降级：

- workspace 多工作区心智
- SSE 实时推送
- 完整搜索页
- 完整邮箱池页面
- 强规则管理 UI
- 系统/API 一级页面

## Immediate Recommendations

### 1. 建议新增 Phase 0

在当前 Phase 1 前插入：

**Phase 0: Feasibility / Survivability Validation**

验证：
- Graph subscription 创建/续订速率
- token churn / reauth 代价
- webhook -> hit 的端到端延迟
- webhook 与 delta 双链路幂等
- message body 存储对 PostgreSQL 的真实压力

### 2. 建议先打通最小可靠链路

```text
mailbox register
-> ensure subscription
-> webhook ingress
-> fetch message
-> upsert message
-> evaluate rules
-> query hit feed
```

### 3. recovery 不要视为“最后加固”

recovery 是 correctness 主链路的一部分，不是后期增强。

### 4. UI 先围绕“命中工作台”，不是“系统模块总览”

首页应更像队列，不只是流。

最少需要明确：
- 默认排序
- 新命中到达行为
- 已处理状态模型
- 详情打开方式
- 空状态 / 错误状态 / 重连状态

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | 平台和运营风险被低估，建议增加 Phase 0 可行性验证 |
| Codex Review | `codex exec` | Independent 2nd opinion | 3 | issues_open | CEO / Design / Eng 三路 outside voice 已运行，均指出 V1 过重风险 |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | issues_open | Graph 生命周期、双链路幂等、正文存储和 workspace 维度需要收窄 |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | 首页是数据流，不是工作流，交互状态和可访问性仍不足 |

**VERDICT:** REVIEWED WITH CONCERNS — 当前方向成立，但建议先收窄 V1 并增加 Phase 0 验证，再进入正式实现。
