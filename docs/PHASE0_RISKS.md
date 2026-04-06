# PHASE0_RISKS.md

## 1. 风险摘要

- 更新日期：TBD
- 当前总体风险评级：TBD
- 是否阻塞进入 Phase 1：TBD

### 最高优先级风险

1. mailbox coordinator 语义是否足够稳
2. version gate 是否足够硬
3. queue backlog 是否会破坏运营价值

---

## 2. 风险分级标准

### Probability

- `Low`：低频、难复现、暂未在真实样本中稳定出现
- `Medium`：已出现，需要设计性缓解
- `High`：高频或趋势明显，已威胁主链路

### Impact

- `Low`：局部噪音，不影响是否命中
- `Medium`：影响吞吐、成本或可维护性
- `High`：影响正确性、实时性或可运营性

### Blocking

- `Yes`：不解决不应进入 V1
- `No`：可带着进入 V1，但必须跟踪

---

## 3. 风险台账

| ID | 风险 | 证据 | Probability | Impact | Blocking | 当前应对 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | DO 无法稳定承担 mailbox 单协调边界 | TBD | TBD | TBD | TBD | versioned mailbox state | TBD |
| R-02 | stale lifecycle / replay 破坏状态正确性 | TBD | TBD | TBD | TBD | version gate | TBD |
| R-03 | queue backlog 让 hit feed 失去实时价值 | TBD | TBD | TBD | TBD | delayed / health visibility | TBD |
| R-04 | token churn / reauth 成本过高 | TBD | TBD | TBD | TBD | DO-initiated refresh + reauth flow | TBD |
| R-05 | PG / R2 split 仍无法承受 detail 路径 | TBD | TBD | TBD | TBD | preview-first + R2 fallback | TBD |

---

## 4. 按主题拆解

## 4.1 Coordination / State 风险

### 风险点

- DO 协调边界不够硬：TBD
- stale lifecycle 处理不正确：TBD
- queue consumer 越权推进状态：TBD

### 证据

- TBD

### 结论

- 是否阻塞：TBD
- 进入 Phase 1 前是否必须解决：TBD

## 4.2 Auth / Token 风险

### 风险点

- refresh token churn：TBD
- `reauth_required` 频率：TBD
- refresh 失败静默化：TBD

### 证据

- TBD

### 结论

- 是否阻塞：TBD
- 进入 Phase 1 前是否必须解决：TBD

## 4.3 Correctness / Idempotency 风险

### 风险点

- duplicate / replay 重复写入：TBD
- recovery overlap：TBD
- cursor 回退或失效：TBD

### 证据

- TBD

### 结论

- 是否阻塞：TBD
- 进入 Phase 1 前是否必须解决：TBD

## 4.4 Latency / backlog 风险

### 风险点

- webhook -> hit P95 不稳定：TBD
- queue backlog age 过高：TBD
- hot mailbox burst：TBD

### 证据

- TBD

### 结论

- 是否阻塞：TBD
- 进入 Phase 1 前是否必须解决：TBD

## 4.5 Storage / Query 风险

### 风险点

- PG 行膨胀：TBD
- R2 fallback 路径过慢：TBD
- detail 查询退化：TBD

### 证据

- TBD

### 结论

- 是否阻塞：TBD
- 进入 Phase 1 前是否必须解决：TBD

## 4.6 Rule Quality 风险

### 风险点

- verification code 漏报：TBD
- reward keyword 噪音过高：TBD
- quoted / forwarded text 干扰：TBD

### 证据

- TBD

### 结论

- 是否阻塞：TBD
- 进入 Phase 1 前是否必须解决：TBD

## 4.7 Operations 风险

### 风险点

- operator 看不到系统正在失败：TBD
- reauth / recovery 人工介入成本过高：TBD
- cohort 扩张后故障恢复流程不可执行：TBD

### 证据

- TBD

### 结论

- 是否阻塞：TBD
- 进入 Phase 1 前是否必须解决：TBD

---

## 5. 必须在进入 Phase 1 前关闭的风险

| ID | 风险 | 关闭标准 | Owner | 计划截止 |
| --- | --- | --- | --- | --- |
| R-01 | DO 协调边界不稳定 | mailbox state 只经 DO 推进且验证通过 | TBD | TBD |
| R-02 | version gate 不成立 | stale / replay / overlap 全部验证通过 | TBD | TBD |
| R-03 | backlog 破坏运营价值 | delayed / health summary 可见，backlog 可控 | TBD | TBD |

---

## 6. 可接受但需持续跟踪的风险

| ID | 风险 | 为什么当前可接受 | 监控方式 | 触发升级条件 |
| --- | --- | --- | --- | --- |
| R-04 | token churn / reauth 成本偏高但可运营 | TBD | reauth rate / mailbox health | TBD |
| R-05 | detail 路径性能仍有波动 | TBD | detail P95 / R2 miss P95 | TBD |

---

## 7. 风险应对动作

### 需要改架构

1. 明确 DO 作为唯一 mailbox lifecycle state 边界
2. 明确 versioned mailbox state
3. 明确 PG / R2 ownership

### 需要改实现计划

1. 增加 backlog / hot mailbox 基线
2. 增加 R2 fallback 约束
3. 增加 token refresh ownership 约束

### 需要改运营策略

1. cohort rollout
2. reauth operator workflow
3. recovery runbook

---

## 8. 风险复盘结论

### 如果继续做

必须接受的现实：

1. Cloudflare-native 不是“更简单的 Go 部署”，而是新运行模型
2. 正确性风险大于 CRUD 风险
3. operator visibility 和状态可观测性是主链路的一部分

### 如果要进一步收窄

优先收窄：

1. 规则数量
2. 读能力范围
3. 非主链路页面 / API

### 如果停止当前路线

停止原因：

1. DO 无法稳定承担协调边界
2. version gate 太脆弱
3. queue backlog / PG-R2 split 让系统对运营无意义

---

## 9. 相关文档

- `docs/PHASE0_VALIDATION_PLAN.md`
- `docs/PHASE0_RESULTS.md`
- `docs/PHASE0_DECISION.md`
- `docs/CLOUDFLARE_IMPLEMENTATION_PLAN.md`
