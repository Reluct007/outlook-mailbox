# PHASE0_RESULTS.md

## 1. 结论摘要

- 执行日期：TBD
- 执行人：TBD
- 当前状态：TBD
- 建议结论：TBD（`Go` / `Narrow Further` / `No-Go`）

### 一句话结论

TBD

### 为什么是这个结论

1. TBD
2. TBD
3. TBD

---

## 2. 本次验证范围

### 样本规模

| 档位 | mailbox 数量 | 实际完成 | 备注 |
| --- | ---: | ---: | --- |
| A | 100 | TBD | 打通主链路与状态机 |
| B | 500 | TBD | 观察 token / queue / renew / recovery 抖动 |
| C | 1000 | TBD | 观察非线性问题与 hot mailbox |

### 本次纳入验证的链路

- [ ] mailbox onboarding
- [ ] ensure subscription
- [ ] webhook ingress
- [ ] mailbox DO decision
- [ ] fetch message
- [ ] evaluate rules
- [ ] create hit event
- [ ] recovery

### 本次未纳入验证的内容

- 完整 UI
- 完整搜索页
- 完整邮箱池页面
- SSE
- workspace
- 其他：TBD

---

## 3. 验证环境

### 基础环境

- Worker runtime：TBD
- Durable Objects：TBD
- Queues：TBD
- R2：TBD
- Hyperdrive：TBD
- PostgreSQL：TBD
- Microsoft Graph app 配置：TBD

### 规则集

- verification code：TBD
- reward / cashback / redeem：TBD

### 正文存储策略

- [ ] PG 只存 preview / excerpt / parsed fields
- [ ] `body_html` / raw payload 存 R2
- [ ] detail 查询 preview-first + R2 fallback
- [ ] 其他：TBD

---

## 4. 核心结论速览

| 问题 | 目标 | 结果 | 是否通过 | 备注 |
| --- | --- | --- | --- | --- |
| DO 是否稳定成为 mailbox 单协调边界 | 状态只经 DO 推进 | TBD | TBD | TBD |
| version gate 是否成立 | stale / replay / overlap 不污染状态 | TBD | TBD | TBD |
| token churn / reauth 成本是否可控 | 可运营 | TBD | TBD | TBD |
| queue backlog age 是否可接受 | 不破坏命中流价值 | TBD | TBD | TBD |
| PG / R2 split 是否可接受 | PG 压力下降，detail 仍可用 | TBD | TBD | TBD |

---

## 5. 指标结果

## 5.1 Onboarding

| 指标 | 结果 |
| --- | --- |
| onboarding success rate | TBD |
| avg onboarding latency | TBD |
| p95 onboarding latency | TBD |
| 主要失败类型 | TBD |

### 观察

- TBD

## 5.2 mailbox coordinator

| 指标 | 结果 |
| --- | --- |
| stale event reject rate | TBD |
| duplicate collapse rate | TBD |
| lifecycle state transition count | TBD |
| version gate reject count | TBD |

### 观察

- TBD

## 5.3 Subscription lifecycle

| 指标 | 结果 |
| --- | --- |
| create success rate | TBD |
| renew success rate | TBD |
| rebuild success rate | TBD |
| lifecycle receive rate | TBD |
| subscription drift incidents | TBD |
| renew burst incidents | TBD |

### 观察

- TBD

## 5.4 Token refresh / reauth

| 指标 | 结果 |
| --- | --- |
| refresh success rate | TBD |
| refresh fail rate | TBD |
| reauth rate / 100 mailboxes / day | TBD |
| manual recovery cost | TBD |
| DO-initiated refresh consistency | TBD |

### 观察

- TBD

## 5.5 Webhook ingress

| 指标 | 结果 |
| --- | --- |
| receive rate | TBD |
| malformed rate | TBD |
| duplicate notification rate | TBD |
| route-to-DO latency P50 | TBD |
| route-to-DO latency P95 | TBD |

### 观察

- TBD

## 5.6 Message fetch

| 指标 | 结果 |
| --- | --- |
| fetch success rate | TBD |
| avg fetch latency | TBD |
| p95 fetch latency | TBD |
| 401 incidence | TBD |
| 404 incidence | TBD |
| 429 incidence | TBD |
| 5xx incidence | TBD |
| retry distribution | TBD |

### 观察

- TBD

## 5.7 Rule evaluation

| 指标 | 结果 |
| --- | --- |
| verification code recall proxy | TBD |
| verification code precision proxy | TBD |
| reward keyword recall proxy | TBD |
| reward keyword precision proxy | TBD |
| duplicate hit rate | TBD |
| quoted / forwarded text 干扰情况 | TBD |

### 观察

- TBD

## 5.8 Recovery

| 指标 | 结果 |
| --- | --- |
| recovery success rate | TBD |
| avg recovery latency | TBD |
| duplicate generation rate | TBD |
| cursor reset frequency | TBD |
| recovery overlap correctness | TBD |

### 观察

- TBD

## 5.9 PG / R2 split

| 指标 | 结果 |
| --- | --- |
| avg PG row size | TBD |
| messages table size | TBD |
| indexes size | TBD |
| growth per 10k messages | TBD |
| hit feed query P50 | TBD |
| hit feed query P95 | TBD |
| detail query P50 | TBD |
| detail query P95 | TBD |
| detail query with R2 miss P95 | TBD |

### 观察

- TBD

## 5.10 queue / backlog / hot mailbox

| 指标 | 结果 |
| --- | --- |
| queue backlog age P50 | TBD |
| queue backlog age P95 | TBD |
| hottest mailbox event rate | TBD |
| delayed mailbox count | TBD |

### 观察

- TBD

## 5.11 端到端延迟

| 指标 | 结果 |
| --- | --- |
| webhook receive latency P50 | TBD |
| webhook receive latency P95 | TBD |
| fetch latency P50 | TBD |
| fetch latency P95 | TBD |
| parse latency P50 | TBD |
| parse latency P95 | TBD |
| hit creation latency P50 | TBD |
| hit creation latency P95 | TBD |
| end-to-end latency P50 | TBD |
| end-to-end latency P95 | TBD |
| end-to-end latency P99 | TBD |

### 是否满足目标

- 目标：命中邮件稳定接近 10 秒可见
- 结论：TBD

---

## 6. 故障注入与异常结果

| 场景 | 是否执行 | 结果 | 是否符合预期 | 备注 |
| --- | --- | --- | --- | --- |
| Notification duplication | TBD | TBD | TBD | TBD |
| Notification loss | TBD | TBD | TBD | TBD |
| Lifecycle disorder | TBD | TBD | TBD | TBD |
| Queue backlog | TBD | TBD | TBD | TBD |
| Token failure storm | TBD | TBD | TBD | TBD |
| Graph throttling | TBD | TBD | TBD | TBD |
| Invalid delta cursor | TBD | TBD | TBD | TBD |
| R2 object missing | TBD | TBD | TBD | TBD |

---

## 7. 失败模式汇总

| 编号 | 失败模式 | 触发条件 | 影响范围 | 当前处理 | 是否阻塞 |
| --- | --- | --- | --- | --- | --- |
| F-01 | stale lifecycle 污染当前 mailbox 状态 | 旧 subscription 事件迟到 | 状态错误 / recovery 错误触发 | TBD | TBD |
| F-02 | queue replay 产生重复 hit | at-least-once replay | 正确性 / 运营噪音 | TBD | TBD |
| F-03 | queue backlog 让命中流失去实时价值 | backlog 拉长 | 运营工作流受损 | TBD | TBD |
| F-04 | token refresh 静默失败 | refresh storm / credential drift | mailbox 不可用但不可见 | TBD | TBD |
| F-05 | R2 detail fallback 失效 | object missing / read fail | detail 不可读 | TBD | TBD |

---

## 8. 关键观察

### 做对了什么

1. TBD
2. TBD
3. TBD

### 真正危险的点

1. TBD
2. TBD
3. TBD

### 与原假设不一致的地方

1. TBD
2. TBD
3. TBD

---

## 9. Exit Criteria 复核

| 条件 | 结果 | 是否满足 | 备注 |
| --- | --- | --- | --- |
| 已拿到 Cloudflare-native 平台基线数据 | TBD | TBD | TBD |
| 已确认主风险不是致命阻塞 | TBD | TBD | TBD |
| 已明确要反映到 coordinator / queue / storage 设计里的约束 | TBD | TBD | TBD |

---

## 10. 对 Phase 1 的直接影响

### 必须保留的设计约束

1. mailbox lifecycle state 只经 DO 推进
2. queue consumer 不拥有 mailbox lifecycle state
3. PG / R2 split 保持不变

### 必须修改的计划项

1. TBD
2. TBD
3. TBD

### 明确后置的内容

1. 完整搜索页
2. 完整邮箱池页面
3. 重规则管理 UI

---

## 11. 附录

### 原始数据位置

- 指标导出：TBD
- 日志：TBD
- SQL / dashboard：TBD

### 相关文档

- `docs/PHASE0_VALIDATION_PLAN.md`
- `docs/PHASE0_RISKS.md`
- `docs/PHASE0_DECISION.md`
