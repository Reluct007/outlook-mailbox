# PHASE0_DECISION.md

## 1. 决策摘要

- 决策日期：TBD
- 决策人：TBD
- 最终决策：TBD（`Go` / `Narrow Further` / `No-Go`）

### 一句话决定

TBD

---

## 2. 为什么做这个决定

### 支持这个决定的核心事实

1. TBD
2. TBD
3. TBD

### 反对意见 / 保留意见

1. TBD
2. TBD
3. TBD

---

## 3. 决策选项对比

| 选项 | 适用条件 | 当前是否满足 | 结论 |
| --- | --- | --- | --- |
| Go | Cloudflare-native 主链路稳定、风险可控、可进入 V1 | TBD | TBD |
| Narrow Further | 路线可行，但必须继续收窄 | TBD | TBD |
| No-Go | 路线本身不成立或运营不可接受 | TBD | TBD |

---

## 4. 对 Go / Narrow Further / No-Go 的判定

## 4.1 Go 判定

| 条件 | 当前结果 | 是否满足 |
| --- | --- | --- |
| DO 稳定承担 mailbox 单协调边界 | TBD | TBD |
| version gate 成立 | TBD | TBD |
| token churn / reauth 成本可接受 | TBD | TBD |
| queue backlog age 可观测且不会破坏运营价值 | TBD | TBD |
| PG / R2 split 下 detail 查询仍可用 | TBD | TBD |
| duplicate / replay / overlap 不产生重复 hit | TBD | TBD |

## 4.2 Narrow Further 判定

| 风险信号 | 当前结果 | 是否触发 |
| --- | --- | --- |
| 10 秒目标不稳 | TBD | TBD |
| hot mailbox 问题明显 | TBD | TBD |
| detail / body 路径过重 | TBD | TBD |
| 运营成本偏高 | TBD | TBD |

## 4.3 No-Go 判定

| 终止条件 | 当前结果 | 是否触发 |
| --- | --- | --- |
| DO 无法稳定承担 mailbox 协调边界 | TBD | TBD |
| version gate 太脆弱 | TBD | TBD |
| reauth 成本无法接受 | TBD | TBD |
| queue backlog 使系统对运营无意义 | TBD | TBD |
| PG / R2 split 仍无法承受正文与 detail 路径 | TBD | TBD |

---

## 5. 决策后的边界

## 5.1 如果结论是 Go

进入 Phase 1 时必须遵守：

1. 仍然坚持单租户 / 单工作空间假设
2. mailbox lifecycle state 只经 DO 推进
3. queue consumer 不拥有 mailbox lifecycle state
4. 仍然不做完整搜索页
5. 仍然不做完整邮箱池页面
6. 仍然不做重规则管理 UI
7. recovery 仍然属于 correctness 主链路

## 5.2 如果结论是 Narrow Further

需要直接收窄成：

- 更少规则
- 更少读能力
- 更保守的 detail 能力
- 更晚引入 UI / API
- 更保守的 cohort 扩张速度

### 必须同步修改的文档

- `docs/ARCHITECTURE.md`
- `docs/CLOUDFLARE_IMPLEMENTATION_PLAN.md`
- `docs/PRODUCT.md`

## 5.3 如果结论是 No-Go

需要停止的内容：

1. 当前 Cloudflare-native V1 实施计划
2. 当前 mailbox coordinator / queue / storage 假设
3. 当前产品承诺

### 需要重新回答的问题

1. 目标是不是应该进一步缩小
2. 路线是不是应该转向更重人工半自动
3. 是否应该放弃“10 秒可见 + 10000 邮箱”这一组合目标

---

## 6. 决策带来的直接动作

## 6.1 必做动作

1. TBD
2. TBD
3. TBD

## 6.2 后续第一批任务

1. 落实 mailbox state machine
2. 落实 component responsibility matrix
3. 按 cohort 启动实现

## 6.3 暂不做的事

1. workspace
2. SSE
3. 完整搜索页
4. 完整邮箱池页面
5. 重规则管理 UI

---

## 7. 风险接受声明

### 本次明确接受的风险

1. TBD
2. TBD
3. TBD

### 本次不接受的风险

1. mailbox lifecycle state 无法验证
2. version gate 不成立
3. queue backlog 让命中流失去运营价值

---

## 8. 签字检查清单

- [ ] `docs/PHASE0_RESULTS.md` 已填写
- [ ] `docs/PHASE0_RISKS.md` 已填写
- [ ] 本决策只基于真实样本，不基于想象
- [ ] 已明确是否进入 Phase 1
- [ ] 已明确是否需要进一步收窄
- [ ] 已明确哪些内容仍然后置

---

## 9. 相关文档

- `docs/PHASE0_VALIDATION_PLAN.md`
- `docs/PHASE0_RESULTS.md`
- `docs/PHASE0_RISKS.md`
- `docs/ARCHITECTURE.md`
- `docs/CLOUDFLARE_IMPLEMENTATION_PLAN.md`
