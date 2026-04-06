# PHASE0_VALIDATION_PLAN.md

## 1. 目标

Cloudflare-native Phase 0 不产出产品功能。

它只回答一个问题：

> 这条 Cloudflare-native 技术路径，在真实 Outlook / Microsoft Graph / Cloudflare 运行边界下，能不能活着进入 V1 实现？

如果答案是否，就不要继续堆主功能。

---

## 2. 必须验证的 5 个问题

### 1. DO 能否稳定成为 mailbox 单协调边界

要验证：

- mailbox lifecycle state 是否只经 DO 推进
- queue consumer 是否可以完全退回“写事实，不写状态”
- 单 mailbox 的乱序事件是否能被正确吸收

### 2. webhook / lifecycle / renew / recovery 乱序下，version gate 是否成立

要验证：

- `subscription_version`
- `recovery_generation`
- `cursor_generation`
- stale lifecycle 拒绝逻辑

### 3. queue backlog age 是否会破坏运营价值

要验证：

- backlog 延迟是否会让 hit feed 失去实时价值
- delayed / recovery_needed 是否能对 operator 可见

### 4. token churn / reauth 成本是否可控

要验证：

- refresh token 失败率
- `reauth_required` 出现频率
- 人工干预成本

### 5. PG / R2 split 是否可接受

要验证：

- `body_html` 外移到 R2 后是否降低 PG 压力
- detail 查询是否还能稳定可用
- preview-first + R2 fallback 是否成立

---

## 3. 这一步不做什么

- 不做完整 UI
- 不做完整搜索页
- 不做完整邮箱池页面
- 不做规则管理界面
- 不做 SSE
- 不做 workspace
- 不做长期双栈运行

Phase 0 只做“证明 Cloudflare-native 路线成立”的最小实验系统。

---

## 4. 样本规模

按 3 档做，不要一上来碰 10000。

### 档位 A
100 个 mailbox

目的：

- 打通链路
- 找 version gate 和状态机问题

### 档位 B
500 个 mailbox

目的：

- 找 token / queue / renew / recovery 抖动点

### 档位 C
1000 个 mailbox

目的：

- 观察非线性问题
- 看 hot mailbox / backlog / R2 detail path 是否开始恶化

---

## 5. 验证范围

## 5.1 Mailbox onboarding

验证内容：

- mailbox record 创建
- credential 保存
- Graph user id 获取
- Inbox folder id 获取
- subscription 创建
- DO 初始化

记录指标：

- onboarding 成功率
- 平均耗时
- 失败类型分布

## 5.2 mailbox coordinator

验证内容：

- DO 路由正确性
- lifecycle state 推进
- version gate
- dedupe gate
- stale event 拒绝

记录指标：

- stale event reject rate
- duplicate collapse rate
- mailbox state transition count

## 5.3 Subscription lifecycle

验证内容：

- 首次创建
- 正常续订
- 续订失败
- 过期重建
- lifecycle event 处理

记录指标：

- create success rate
- renew success rate
- rebuild success rate
- lifecycle receive rate
- subscription drift / burst 情况

## 5.4 Token refresh / reauth

验证内容：

- token refresh
- refresh token 失败
- `reauth_required` 标记
- DO 发起 refresh 的一致性

记录指标：

- refresh success rate
- refresh fail rate
- reauth rate per 100 mailboxes / day
- manual recovery cost

## 5.5 Webhook ingress

验证内容：

- validationToken
- clientState 校验
- mailbox routing
- notification 重复
- notification 乱序

记录指标：

- receive rate
- malformed rate
- duplicate rate
- route latency

## 5.6 Message fetch

验证内容：

- fetch success
- retry
- 401 / 404 / 429 / 5xx
- 超大 message
- 空正文 / HTML-only / text-only

记录指标：

- fetch success rate
- average fetch latency
- retry distribution
- throttling incidence

## 5.7 Rule evaluation

Phase 0 只验证最小规则：

- verification code
- reward / cashback / redeem keyword

验证内容：

- 命中率
- 误报率
- 重复命中
- 多命中值
- quoted text / forwarded text 干扰

记录指标：

- recall proxy
- precision proxy
- duplicate hit rate

## 5.8 Recovery

验证内容：

- webhook 漏失
- lifecycle missed
- recovery 触发
- cursor 正常推进
- cursor 失效重建
- recovery overlap

记录指标：

- recovery success rate
- recovery latency
- duplicate generation rate
- cursor reset frequency

## 5.9 PG / R2 split

验证内容：

- PG 只存 preview / excerpt / parsed fields
- `body_html` / raw payload 进 R2
- detail 查询按需读取 R2
- R2 缺失时 fallback

记录指标：

- avg PG row size
- table growth per 10k messages
- hit feed query latency
- detail query latency
- detail with R2 miss latency

---

## 6. 最小实验系统范围

Phase 0 需要的最小系统只有这些：

### 写路径

```text
mailbox onboarding
-> ensure subscription
-> webhook ingress
-> mailbox DO decision
-> fetch message
-> evaluate rules
-> create hit event
```

### 补偿路径

```text
mark recovery_needed
-> delta query
-> fetch missed message
-> evaluate rules
-> dedupe hit event
-> complete recovery
```

### 读路径

只保留：

- 最近 hit feed 查询
- 单 message detail 查询
- mailbox health 摘要查询

---

## 7. 必须记录的指标

## 7.1 链路指标

- webhook receive latency
- route-to-DO latency
- enqueue latency
- fetch latency
- parse latency
- hit creation latency
- end-to-end latency

## 7.2 正确性指标

- duplicate message rate
- duplicate hit rate
- stale event reject count
- cursor rollback incidents
- missed notification recovery success rate

## 7.3 平台健康指标

- subscription create success rate
- subscription renew success rate
- token refresh success rate
- reauth rate
- Graph 429 incidence
- queue backlog age
- hot mailbox event rate

## 7.4 数据指标

- messages table size
- indexes size
- avg row size
- hit feed query P50/P95/P99
- detail query P50/P95/P99
- detail query with R2 miss P50/P95/P99

---

## 8. 必须制造的故障场景

不能只测 happy path。

## 8.1 Notification duplication

同一条 notification 多次投递。

期望：

- 不重复写 message
- 不重复写 hit

## 8.2 Notification loss

人为丢掉部分 webhook。

期望：

- recovery 补回

## 8.3 Lifecycle disorder

`missed` / `subscriptionRemoved` / 正常 notification 乱序到达。

期望：

- stale lifecycle 被拒绝
- mailbox 状态不混乱
- recovery 能正确触发

## 8.4 Queue backlog

人为拉长 queue backlog。

期望：

- mailbox 进入 `delayed`
- operator 可见
- 命中流不会静默失真

## 8.5 Token failure storm

同一批 mailbox 同时 refresh 失败。

期望：

- 不发生 refresh 风暴
- `reauth_required` 能被正确标记

## 8.6 Graph throttling

模拟或观察 429 / 5xx。

期望：

- 有退避
- 不引发续订雪崩

## 8.7 Invalid delta cursor

让 delta link 失效。

期望：

- 进入 cursor reset path
- 不无限循环恢复

## 8.8 R2 object missing

body_html 对象缺失。

期望：

- detail 仍可读
- preview-first + fallback 成立

---

## 9. Phase 0 输出物

Phase 0 结束后必须产出这些文件。

### 1. `docs/PHASE0_RESULTS.md`

内容包括：

- 样本规模
- 指标结果
- 状态机与 version gate 结果
- backlog / PG-R2 split 结果
- 是否通过

### 2. `docs/PHASE0_RISKS.md`

内容包括：

- 当前仍未解决的高风险项
- 风险等级
- 是否阻塞 V1

### 3. `docs/PHASE0_DECISION.md`

只回答一件事：

- Go / No-Go / Narrow Further

---

## 10. Go / No-Go 标准

## Go

只有在下面条件都成立时才进入 V1：

1. DO 稳定作为 mailbox 单协调边界
2. version gate 成立
3. queue backlog age 可观测且不会让系统失去运营价值
4. token churn / reauth 成本在可接受范围
5. PG / R2 split 下 detail 查询仍可用
6. duplicate / replay / overlap 不产生重复 hit

## Narrow Further

如果链路能跑，但以下任一成立：

- 10 秒目标不稳
- hot mailbox 问题明显
- body / detail 路径过重
- 运营成本偏高

则进入：

> Narrow Further

收窄 V1：

- 更少规则
- 更少读能力
- 更晚引入 UI / API
- 更保守的 detail 能力

## No-Go

如果以下任一成立：

- DO 无法稳定承担 mailbox 协调边界
- version gate 太脆弱
- reauth 成本无法接受
- queue backlog 使系统对运营无意义
- PG / R2 split 仍无法承受正文与 detail 路径

则停止当前路线，重新定方案。

---

## 11. 推荐执行顺序

### Step 1

100 mailbox 打通主链路与状态机

### Step 2

500 mailbox 看 token、queue、renew、recovery 抖动

### Step 3

1000 mailbox 观察非线性问题

### Step 4

汇总数据，输出 Go / No-Go / Narrow Further 决策

---

## 12. 最后的原则

Cloudflare-native Phase 0 的成功，不是“做出一个 demo”。

它的成功是：

> 你已经拿到了足够真实的数据，  
> 可以决定这条 Cloudflare-native 路线该继续、该收窄，还是该停。
