# CLOUDFLARE_TASK_BREAKDOWN.md

## 1. 目标

把已批准的 Cloudflare-native 方案拆成可执行任务。

这份文档只服务一件事：

> 让团队知道先做什么，后做什么，哪些能并行，哪些绝对不能乱并。

---

## 2. Compatibility Decision

- Compatibility required: **no**
- Breaking changes accepted: **yes**
- Transitional layers planned: **none**
- Old Go 多 worker 路径 scheduled for deletion: **yes**

### Refactor Check

- Thin wrappers added: **none**
- Aliases preserved: **none**
- Legacy branches preserved: **none**

### Plan Check

- Breaking changes accepted: **yes**
- Transitional layers planned: **none**
- Old paths scheduled for deletion: **yes**
- Direct convergence target: **Cloudflare-native**

---

## 3. 执行顺序总览

```text
M0 Phase 0 准备
-> M1 mailbox state machine / ownership 定稿
-> M2 ingress + coordinator 骨架
-> M3 fetch / parse / hit 主链路
-> M4 read model / hit workbench 最小查询
-> M5 renew / recovery / hardening
-> M6 cohort rollout
```

---

## 4. Milestones

## M0. Phase 0 准备

### 目标

把“能不能做”先验证清楚，不直接写全量实现。

### 任务

1. 确认 Cloudflare 资源：
   - Workers
   - Durable Objects
   - Queues
   - R2
   - Hyperdrive
   - Cron
   - Workflows
2. 确认可用 PostgreSQL
3. 准备 Graph app / webhook / subscription 所需配置
4. 明确 Phase 0 样本来源与 cohort
5. 确定指标采集方式

### 产出物

- 可执行的 Phase 0 环境
- 样本 mailbox 清单
- 指标与日志入口

### 完成标准

- 能开始做 100 mailbox 档位实验

---

## M1. mailbox state machine / ownership 定稿

### 目标

锁死最关键的架构边界。

### 任务

1. 定稿 mailbox state machine
2. 定稿 version 字段：
   - `subscription_version`
   - `recovery_generation`
   - `cursor_generation`
   - `mailbox_state_version`
3. 定稿 component responsibility matrix
4. 定稿 lifecycle state taxonomy：
   - `healthy`
   - `delayed`
   - `recovery_needed`
   - `recovering`
   - `reauth_required`
   - `disabled`
5. 定稿 token refresh ownership：
   - **DO 发起**
   - **auth helper 执行**

### 依赖

- 无

### 不能跳过的原因

这一步不清楚，后面所有实现都会变成“多个组件共同写一点状态”。

### 完成标准

- 任何人都能回答：
  - 哪些状态只允许 DO 改
  - 哪些数据只进 PG
  - 哪些大对象只进 R2

---

## M2. ingress + coordinator 骨架

### 目标

先把 webhook 入口和 mailbox 单协调边界搭起来。

### 任务

1. 建 Worker ingress 骨架
2. 实现 validationToken path
3. 实现 clientState 校验
4. 实现 mailbox 路由
5. 建 mailbox coordinator DO 骨架
6. 实现最小 state transition
7. 实现最小 version gate
8. 实现最小 dedupe gate

### 依赖

- M1

### 完成标准

- webhook 可以进入指定 mailbox DO
- stale / malformed / duplicate 请求有明确处理结果

---

## M3. fetch / parse / hit 主链路

### 目标

打通最短闭环。

### 任务

1. 定义 queue contracts：
   - `mail.fetch`
   - `mail.parse`
   - `mail.recover`
   - `subscription.renew`
2. 实现 fetch consumer
3. 实现 message 标准化
4. 实现 PG / R2 split：
   - preview / excerpt / parsed fields -> PG
   - `body_html` / raw payload -> R2
5. 实现 parse consumer
6. 实现最小规则：
   - verification code
   - reward / cashback / redeem
7. 实现 `message_rule_matches`
8. 实现 `hit_events`
9. 实现 hit dedupe

### 依赖

- M2

### 完成标准

- 新邮件进入后可产生命中
- duplicate / replay 不产生重复 hit

---

## M4. read model / hit workbench 最小查询

### 目标

让运营同学能开始用。

### 任务

1. 实现 hit feed API
2. 实现 message detail API
3. 实现 mailbox health summary API
4. 实现 processed 状态
5. 实现最小筛选：
   - 时间范围
   - 发件人
   - 收件人
   - hit type
   - confidence
   - processed
6. 实现 detail 的 preview-first + R2 fallback

### 依赖

- M3

### 完成标准

- 运营同学可以只看命中流完成最小工作流
- R2 缺失时 detail 不会崩

---

## M5. renew / recovery / hardening

### 目标

让系统在失败时仍可信。

### 任务

1. 实现 renew path
2. 实现 recovery path
3. 实现 cursor reset path
4. 实现 `reauth_required` 流程
5. 实现 delayed / recovery_needed / recovering 可见性
6. 实现 backlog age 指标
7. 实现 hot mailbox 背压策略
8. 实现日志 / metrics / audit

### 依赖

- M3
- M4

### 完成标准

- 故障不再 silent failure
- operator 能看见系统正在失败什么

---

## M6. cohort rollout

### 目标

按真实样本逐步放量。

### 任务

1. 10 mailbox canary
2. 100 mailbox cohort
3. 500 mailbox cohort
4. 1000 mailbox cohort
5. 汇总 Phase 0 结果
6. 输出：
   - `PHASE0_RESULTS.md`
   - `PHASE0_RISKS.md`
   - `PHASE0_DECISION.md`

### 依赖

- M5

### 完成标准

- 能做 Go / Narrow Further / No-Go 决策

---

## 5. 模块级任务清单

## A. coordinator

### 必做

- state machine
- version gate
- dedupe gate
- lifecycle transition
- recovery decision
- renew decision
- token refresh initiation

### 验收

- coordinator 不依赖外部组件来定义 mailbox lifecycle state

## B. ingress

### 必做

- validationToken
- clientState
- malformed payload reject
- mailbox route
- audit hooks

### 验收

- ingress 只做入口，不偷写状态

## C. storage

### 必做

- messages schema
- hit_events schema
- mailbox state snapshot schema
- R2 object key strategy
- preview-first detail model

### 验收

- PG / R2 ownership 明确且一致

## D. read model

### 必做

- hit feed
- message detail
- mailbox health summary
- processed state

### 验收

- 命中流能成为默认入口

## E. recovery

### 必做

- recovery trigger
- delta sync
- cursor reset
- overlap dedupe

### 验收

- missed notification 可恢复

---

## 6. 并行策略

## 可以并行的 lane

### Lane A

- M1 mailbox state machine / ownership

### Lane B

- storage schema 设计
- R2 key / detail fallback 设计

### Lane C

- read model / hit feed query 设计

## 依赖关系

- **M1 是全局前置**
- M2 依赖 M1
- M3 依赖 M2
- M4 依赖 M3
- M5 依赖 M3 + M4
- M6 依赖 M5

## 冲突提示

- coordinator 相关任务不要多人并行乱改
- version gate / lifecycle state / recovery decision 必须由同一条主线收敛

---

## 7. 测试拆解

## Unit

1. state transition
2. version gate
3. dedupe
4. cursor advance / reset
5. parser edge cases

## Integration

1. duplicate webhook
2. out-of-order lifecycle
3. queue replay
4. delta recovery overlap
5. token refresh fail -> `reauth_required`
6. R2 fallback

## E2E

1. onboarding -> hit visible
2. delayed / degraded / recovery-needed visible
3. detail preview-first + R2 fallback

---

## 8. 明确不做的拆解

以下不拆到当前执行列表：

- 完整搜索页
- 完整邮箱池页面
- 重规则管理 UI
- SSE
- workspace
- D1 替代 PG
- 长期双栈

---

## 9. 推荐开工顺序

如果现在就开始做，推荐严格按这个顺序：

1. **先做 M1**
2. **再做 M2**
3. **再做 M3**
4. **然后做 M4**
5. **最后做 M5 / M6**

一句话版：

> 先锁边界，再打主链路，再补读模型，最后做恢复和放量。

---

## 10. 最终执行原则

任何任务开始前都先问：

1. 这个任务会不会引入第二个 mailbox 协调中心？
2. 这个任务会不会让 queue consumer 越权写状态？
3. 这个任务会不会让 operator 看不到失败？

只要其中一个答案是“会”，就不要开始。
