# CLOUDFLARE_EXECUTION_CHECKLIST.md

## 1. 用途

这不是设计文档。

这是执行清单。

目标只有一个：

> 把 Cloudflare-native 方案拆成可以逐项勾掉的任务。

---

## 2. 执行规则

- [ ] 不引入兼容层
- [ ] 不保留旧 Go 多 worker 作为长期并行主路径
- [ ] mailbox lifecycle state 只经 DO 推进
- [ ] queue consumer 不越权写 mailbox lifecycle state
- [ ] PG / R2 ownership 不混
- [ ] operator visibility 不能后补

---

## 3. M0 Phase 0 准备

### 环境

- [ ] 开通 Workers
- [ ] 开通 Durable Objects
- [ ] 开通 Queues
- [ ] 开通 R2
- [ ] 开通 Hyperdrive
- [ ] 开通 Cron
- [ ] 评估是否需要 Workflows
- [ ] 准备 PostgreSQL

### Graph / Outlook

- [ ] 准备 Graph app 配置
- [ ] 准备 webhook callback 配置
- [ ] 准备 subscription 所需权限
- [ ] 准备样本 mailbox cohort

### 观测

- [ ] 确定日志入口
- [ ] 确定指标入口
- [ ] 确定 backlog age 采集方式
- [ ] 确定 R2 miss 采集方式

---

## 4. M1 mailbox state machine / ownership 定稿

### 状态机

- [ ] 定稿 `healthy`
- [ ] 定稿 `delayed`
- [ ] 定稿 `recovery_needed`
- [ ] 定稿 `recovering`
- [ ] 定稿 `reauth_required`
- [ ] 定稿 `disabled`

### 版本语义

- [ ] 定稿 `subscription_version`
- [ ] 定稿 `recovery_generation`
- [ ] 定稿 `cursor_generation`
- [ ] 定稿 `mailbox_state_version`

### ownership

- [ ] 列清哪些状态只允许 DO 改
- [ ] 列清哪些事实只写 PG
- [ ] 列清哪些大对象只写 R2
- [ ] 定稿 token refresh ownership
- [ ] 定稿 Cron / Workflows 调度边界

### 完成标准

- [ ] 任何人都能回答“这个字段/状态到底谁是 owner”

---

## 5. M2 ingress + coordinator 骨架

### ingress

- [ ] 建 webhook ingress skeleton
- [ ] 实现 validationToken path
- [ ] 实现 clientState 校验
- [ ] 实现 malformed payload reject
- [ ] 实现 mailbox route

### coordinator

- [ ] 建 mailbox coordinator DO skeleton
- [ ] 实现最小 lifecycle state
- [ ] 实现最小 version gate
- [ ] 实现最小 dedupe gate
- [ ] 实现 mailbox state snapshot 写回策略

### 验收

- [ ] webhook 请求能稳定进入对应 mailbox DO
- [ ] stale / malformed / duplicate 都有明确结果

---

## 6. M3 fetch / parse / hit 主链路

### queue contracts

- [ ] 定义 `mail.fetch`
- [ ] 定义 `mail.parse`
- [ ] 定义 `mail.recover`
- [ ] 定义 `subscription.renew`

### fetch

- [ ] 拉 Graph message
- [ ] 标准化 message 字段
- [ ] 写 `messages`
- [ ] 写 R2 raw payload
- [ ] 写 R2 `body_html`

### parse / hit

- [ ] 实现 verification code 规则
- [ ] 实现 reward/cashback/redeem 规则
- [ ] 写 `message_rule_matches`
- [ ] 写 `hit_events`
- [ ] 实现 hit dedupe
- [ ] 实现 confidence / reason 字段

### 验收

- [ ] 新邮件可以变成 hit
- [ ] duplicate / replay 不产生重复 hit

---

## 7. M4 read model / hit workbench

### API

- [ ] hit feed API
- [ ] message detail API
- [ ] mailbox health summary API
- [ ] processed 状态 API

### detail

- [ ] preview-first detail
- [ ] R2 按需读取
- [ ] R2 miss fallback

### 最小筛选

- [ ] 时间范围
- [ ] 发件人
- [ ] 收件人
- [ ] hit type
- [ ] confidence
- [ ] processed

### 验收

- [ ] 运营同学可以只看命中流处理工作
- [ ] detail 不因 R2 缺失而崩

---

## 8. M5 renew / recovery / hardening

### renew

- [ ] 实现 renew trigger
- [ ] 实现 renew execute
- [ ] 实现 renew failure handling

### recovery

- [ ] 实现 `recovery_needed` 触发
- [ ] 实现 delta recovery
- [ ] 实现 cursor reset path
- [ ] 实现 overlap dedupe

### auth / reauth

- [ ] 实现 DO 发起 refresh
- [ ] 实现 auth helper 执行 refresh
- [ ] 实现 `reauth_required`

### observability

- [ ] backlog age 指标
- [ ] mailbox state transition 日志
- [ ] top failing mailbox 视图
- [ ] recovery success/failure 指标
- [ ] reauth rate 指标

### 背压

- [ ] hot mailbox 背压策略
- [ ] delayed mailbox 可见性

### 验收

- [ ] 故障不再 silent failure
- [ ] operator 看得见失败原因

---

## 9. M6 cohort rollout

### rollout

- [ ] 10 mailbox canary
- [ ] 100 mailbox cohort
- [ ] 500 mailbox cohort
- [ ] 1000 mailbox cohort

### 输出

- [ ] 填写 `PHASE0_RESULTS.md`
- [ ] 填写 `PHASE0_RISKS.md`
- [ ] 填写 `PHASE0_DECISION.md`

### 决策

- [ ] Go
- [ ] Narrow Further
- [ ] No-Go

---

## 10. 必测项

### Unit

- [ ] state transition
- [ ] version gate
- [ ] dedupe
- [ ] cursor advance / reset
- [ ] parser edge cases

### Integration

- [ ] duplicate webhook
- [ ] out-of-order lifecycle
- [ ] queue replay
- [ ] delta recovery overlap
- [ ] token refresh fail -> `reauth_required`
- [ ] R2 fallback

### E2E

- [ ] onboarding -> hit visible
- [ ] delayed / degraded / recovery-needed visible
- [ ] detail preview-first + R2 fallback

---

## 11. 明确不做

- [ ] 不做完整搜索页
- [ ] 不做完整邮箱池页面
- [ ] 不做重规则管理 UI
- [ ] 不做 SSE
- [ ] 不做 workspace
- [ ] 不做 D1 替代 PG
- [ ] 不做长期双栈

---

## 12. 开工顺序

- [ ] 先完成 M1
- [ ] 再做 M2
- [ ] 再做 M3
- [ ] 然后做 M4
- [ ] 最后做 M5 / M6

一句话版：

> 先锁边界，再打主链路，再补读模型，最后做恢复和放量。
