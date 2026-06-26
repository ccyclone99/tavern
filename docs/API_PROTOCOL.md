# API 协议与 AI 标记格式

> agent 驱动游戏必读。本文档定义：LLM API 如何调用、AI 回复里能用哪些标记、状态补丁怎么写。

## 一、LLM API 协议

### 端点
```
POST https://api.deepseek.com/chat/completions
```
SSE 流式响应。请求头需 `Authorization: Bearer <API_KEY>`。

### 请求体（由 `PromptBuilder.build` 组装）

```js
{
  model: "deepseek-v4-flash",       // 或 deepseek-chat / deepseek-reasoner
  stream: true,
  messages: [
    { role: "system", content: "<system prompt，见下方结构>" },
    { role: "user",      content: "玩家消息" },
    { role: "assistant", content: "DM/角色回复" },
    // ... 最近 50 条历史
  ],
  thinking: { type: "enabled" }     // 非 legacy 模型且开启思考时
}
```

### System Prompt 结构（注入顺序）

`PromptBuilder.build(character, scene, messages)` 按以下顺序拼接 `systemParts`：

1. **身份声明**：`你是 ${charName}。请严格扮演这个角色`
2. **玩家名**：`玩家名称是 ${userName}`
3. **角色背景** `【角色背景】`（来自 `character.description`）
4. **性格** `【性格】`（来自 `character.personality`）
5. **场景** `【当前场景】`
6. **示例对话** `【示例对话风格】`
7. **额外设定** `【额外设定】`（来自 `system_prompt`）
8. **世界书** `【世界书】`（关键词匹配触发，见 `buildLorebookPrompt`）
9. **剧情摘要** `【先前剧情摘要】`（自动摘要，上限 1200 字）
10. **关系状态** `【关系状态】`（好感度/情绪）
11. **NPC 私密设定** `【NPC 私密设定，仅用于扮演，禁止直接透露】`（动机/恐惧/秘密/筹码/隐藏档案）
12. **NPC 日程** `【NPC 个人日程，仅供扮演】`（agenda/currentPlan/offscreenActions）
13. **角色信条** `【角色信条与三观】`（creed/redLines/values，**人格锚点**）
14. **回复要求** `【回复要求】`（来自 `post_history_instructions`）
15. **规则层** `buildRulesContext(scene)`：属性/位置/地图/任务/物品/知识/势力/局势时钟/反制/检定规则/生存系统/动态事件/合理性协议
16. **剧情弧** `【剧情弧 · 叙事骨架】`（storyArcs 节拍，**AI 必须按此推进**）
17. **计策协议** `【计策主持人协议】`
18. **剧情推动 + 格式要求**

群聊（`buildGroup`）结构类似，额外注入其他角色名和**玩家信息**（含玩家信条）。

历史消息会先经过 `WorldEngine.filterMessagesForCharacter()`：无 `visibility` 的旧消息默认可见；带 `visibility` 的消息只有公开、当前 NPC 参与或被 `overheardBy` 标记时才注入。

### 流式响应解析

SSE 格式，每行 `data: {json}`。提取 `choices[0].delta.content`。遇到 `[DONE]` 结束。

⚠️ **中断处理**：流被中断（abort）时，已接收的 `<state_update>` 补丁可能不完整。`api.js` 在循环结束并拼接完整正文后才做补丁匹配；若中途 abort，末尾补丁会丢失。agent 实现时建议：流结束后再做一次补丁匹配，不依赖流式过程中的部分匹配。

---

## 二、AI 回复标记协议

AI 在回复**末尾**可以追加标记（每个独占一行），系统会解析并执行。agent 驱动时也应在 DM 回复里使用这些标记。

### 检定标记
```
[check:属性名|DC值]
```
触发交互式检定卡：属性名可用中文（力量/敏捷/体质/智力/感知/魅力）或英文。玩家点击“掷骰”或在主输入框输入“掷骰”后，系统计算 D20 + 属性调整值 vs DC。

掷骰结果以 `type:'check'` 消息插入，AI 收到的文本格式：
```
【力量检定：D20=18 +3 = 21 vs DC15 → 成功！】
【魅力检定：D20=12 +2 = 14 vs DC15 → 部分成功】
【力量检定：D20=1 +3 = 4 vs DC15 → 大失败！】
【后果提示：关系恶化；敌方反制】
```
- 自然 20 = 大成功（无视 DC）
- 自然 1 = 大失败（无视 DC）
- total >= DC = 成功
- total >= DC - 3 = 部分成功
- 其他失败 = 失败推进

### 生存系统标记
```
[damage:N|原因]    # 玩家受 N 点伤害，HP 归零触发死亡结局
[heal:N]           # 玩家恢复 N 点生命
[gold:N]           # 金钱变动（正获得/负花费）
[exp:N]            # 经验获得（满 level×100 升级，+2 属性点）
```
这些标记只作为剧情触发入口，必须分别调用 `WorldEngine.applyPlayerDamage()`、`applyPlayerHealing()`、`addGold()`、`addExperience()` 结算；规则层不可用时不应直接改写 HP、金币、经验或等级。
同一条 AI 回复中，若某个 `<state_update>` 字段或标记把 `scene.gameState` 变为 `defeated` / `victorious`，后续 `state_update` 字段、标记、自动检定和自动关系分析必须停止处理，不能在结局后继续发奖励、扣资源、创建检定或写入 NPC 关系记忆。
如果收到 `<state_update>` 时当前场景已经不是 `playing`，整块状态补丁必须跳过；计策创建、更新、放弃和计策物品消耗也属于被禁止的结局后状态变更。

### 剧情/任务标记
```
[quest:任务名|main或side|描述|目标1,目标2|奖励]   # 创建任务
[quest_update:任务名|目标序号]                     # 标记目标完成（序号从1开始；结构化副本会先检查挑战/证据/结论闸门）
[event:事件描述]                                   # 触发剧情事件
[move:地点名]                                      # 建议移动到新地点
```
- **奖励格式**：`金币x100, 经验x50, 短剑x1`（逗号分隔，`物品名x数量` 或 `金币xN` 或 `经验xN`）
- 主线任务全完成 → 触发胜利结局

### 物品标记
```
[item_add:名称|描述|类型|数量]     # 给予物品（类型：weapon/armor/consumable/quest/misc）
[item_remove:名称]                # 移除物品
[item_equip:名称]                 # 装备物品
[item_unequip:名称]               # 卸下物品
```
- 奖励和 `[item_add:]` 会对常见名称做轻量语义推断：治疗/药水会生成可直接使用的回血消耗品，补给/零件会生成可在检定卡消耗的资源，武器/防具会生成装备，地图/钥匙/证据会生成任务物品。
- 物品标记和 `<state_update>.itemAdd` 必须调用 `WorldEngine.grantInventoryItem()`、`removeInventoryItem()`、`equipInventoryItem()` 或 `unequipInventoryItem()`，不能直接改写 `scene.inventory` 或装备槽。
- `<state_update>.questsUpdate` 和 `scene.worldTensionDelta` 必须分别调用 `WorldEngine.applyQuestUpdates()` 与 `WorldEngine.addWorldTension()`；规则层不可用时跳过并报警，不做降级直写。

### 角色/世界标记
```
[new_char:角色名|emoji|外貌|性格|开场白]   # 新角色登场
[char_exit:角色名|原因]                    # 角色退场
```
- 角色登场/退场标记必须先经过 `PromptGuard` 清洗，再调用 `WorldEngine.addExistingCharacterToScene()` / `removeCharacterFromScene()`；不能直接改写 `scene.characters`，结局后不能改变在场角色。

### 情绪标记（可放回复末尾）
```
[emotion:情绪名]    # 如 happy/angry/sad/shy/surprised
```

由 `Renderer.parseMessageType` 在消息渲染时解析，用于显示角色头像表情。

---

## 三、`<state_update>` 状态补丁协议

AI 在回复末尾可追加**隐藏的 JSON 补丁**来更新游戏状态。玩家看不到补丁内容（系统会剥离）。格式：

```json
<state_update>
{
  "strategies": {
    "create": [{ "title": "...", "goal": "...", "phase": "intel" }],
    "update": [{ "id": "st_xxx", "phase": "setup", "risk": 35 }]
  },
  "knowledgeAdd": [{ "subjectType": "character", "subjectId": "char_xxx", "level": "hint", "text": "...", "source": "观察", "reliability": "unverified" }],
  "discoveryUpdate": [{ "characterId": "char_xxx", "factId": "secret_0_abcd", "state": "hinted", "evidence": ["..."] }],
  "intelAdd": [{ "text": "...", "source": "...", "reliability": "rumor" }],
  "factionsUpdate": [{ "name": "商会", "attitude": -10, "power": 60 }],
  "characterUpdates": [{ "characterId": "char_xxx", "suspicionDelta": 10 }],
  "clockUpdate": [{ "id": "clock_main_pressure", "delta": 1, "reason": "玩家休息" }],
  "storyArcUpdate": [{ "title": "混沌渗透之谜", "advance": true, "reason": "玩家确认货舱异常" }],
  "storyPhaseUpdate": [{ "id": "phase_cargo", "activate": true, "reason": "货舱调查挑战已完成" }],
  "clueUpdate": [{ "id": "clue_cargo", "status": "active", "evidenceAdd": ["货舱异响"] }],
  "failureStateUpdate": [{ "id": "fail_riot", "status": "disabled", "reason": "玩家安抚了码头工人" }],
  "counterStrategyUpdate": [{ "title": "有人在调查你", "visibility": "hinted", "progress": 30 }],
  "npcAgendaUpdate": [{ "characterId": "char_xxx", "currentPlan": "监控玩家接触过的证人" }],
  "challengeUpdate": [{ "id": "challenge_cargo", "status": "completed", "progress": 100, "evidenceAdd": ["ev_cargo_rune"] }],
  "evidenceAdd": [{ "id": "ev_cargo_rune", "title": "货舱符文", "text": "木箱底部有新刻的符文", "reliability": "confirmed" }],
  "revelationUpdate": [{ "id": "rev_smuggling", "status": "confirmed", "reason": "证据链闭合" }],
  "flowGraphUpdate": { "nodes": [{ "id": "node_cargo", "status": "resolved" }], "revelations": [{ "id": "rev_smuggling", "status": "confirmed" }] },
  "questsUpdate": [{ "questId": "quest_main", "objectiveIdx": 0, "status": "completed" }],
  "itemAdd": [{ "name": "染血徽章", "type": "evidence", "quantity": 1 }],
  "locationUpdate": [{ "id": "loc_hidden_pier", "name": "废弃栈桥", "alertLevel": 25 }],
  "scene": { "worldTensionDelta": 5, "activeStrategyId": "st_xxx" }
}
</state_update>
```

### 白名单字段（安全约束）

补丁经过**严格白名单**，AI 不能修改任意字段：

| 顶层字段 | 允许的子操作 |
|---------|-------------|
| `strategies.create` | 创建计策（title/goal/phase/risk/progress 等） |
| `strategies.update` | 更新计策（必须带 id） |
| `knowledgeAdd` | 添加玩家知识账本条目（subjectType/subjectId/level/text/source/reliability/tags） |
| `discoveryUpdate` | 更新 NPC 隐藏档案解锁状态（characterId/factId/state/evidence） |
| `intelAdd` | 兼容旧协议的添加情报（text/source/reliability: rumor\|confirmed\|false），系统会同步写入知识账本 |
| `factionsUpdate` | 更新势力（name/attitude/power/description/leverage），变化会写入事件日志并提示局势 tab |
| `characterUpdates` | 更新角色关系（characterId/affectionDelta/trustDelta/suspicionDelta/fearDelta/debtDelta/leverageAdd/memoryAdd/mood/secret），公开关系变化会写入事件日志并提示详情/局势 tab；`secret` 只进入 NPC 私密设定，不直接展示给玩家。旧字段 `relationshipUpdate` 会兼容到同一处理路径，但新输出应使用 `characterUpdates` |
| `clockUpdate` | 新增或推进时钟（id/name/value/delta/max/visibility/trigger/reason） |
| `storyArcUpdate` | 推进剧情弧（title/id/phase/synopsis/advance/advanceBy/currentBeat/reason；推进 beat 必须带 reason） |
| `storyPhaseUpdate` | 推进剧情阶段（id/title/status/activate/reason/failForward/alternative/outcome/cost/bypassCost/costs/goldCost/worldTensionDelta/clockDelta；激活下一阶段或完成 active 阶段必须满足阶段闸门，结构化绕过代价会真实扣资源/写后果） |
| `clueUpdate` | 更新线索链（id/title/status/currentStage/evidenceAdd/reason） |
| `failureStateUpdate` | 触发或禁用剧本失败状态（id/title/status/trigger/aftermath/reason） |
| `counterStrategyUpdate` | 新增或更新 NPC 反制（title/actorId/target/status/visibility/progress/exposure/counterplay） |
| `npcAgendaUpdate` | 更新 NPC 日程（characterId/currentPlan/priority/schedule/offscreenActions） |
| `challengeUpdate` | 更新场景挑战（id/status/progress/strain/supports/evidenceAdd/evidenceIds/reason 等；完成时走挑战闸门、奖励、任务和阶段联动） |
| `evidenceAdd` | 添加证据（id/title/text/reliability/tags/supports/obtainedBy；同步知识、线索和探索奖励） |
| `revelationUpdate` | 更新关键结论（id/conclusion/status/reason；影响主线和阶段推进） |
| `flowGraphUpdate` | 更新流程图节点和关键结论（nodes/revelations） |
| `scene` | 仅 worldTensionDelta 和 activeStrategyId；紧张度变动走 `WorldEngine.addWorldTension()` |
| `questsUpdate` | 更新任务（questId/objectiveIdx/objectiveNumber/status/reason；走 `WorldEngine.applyQuestUpdates()` 闸门、任务进展消息、任务奖励和防重复） |
| `itemAdd` | 添加物品（name/description/type/quantity/effects/uses/tags；走 `WorldEngine.grantInventoryItem()` 统一堆叠和事件日志） |
| `locationUpdate` | 新增或更新地点（id/name/description/connections/alertLevel），变化会写入事件日志并提示地图/局势 tab |

**禁止修改**：`settings`、`apiKey`、玩家属性、玩家 HP 等核心字段。补丁是"建议性"的，系统会先递归剥离敏感字段、原型污染键和非白名单顶层字段，限制数组/对象/字符串体积，再交给白名单逻辑应用。

实现见 `js/features/strategy-manager.js` 的 `applyStateUpdate()`。

### state_update 与方括号标记的分工

| 目标 | 推荐协议 | 原因 |
|------|----------|------|
| 创建任务 | `[quest:...]` | 现有 state_update 只支持 `questsUpdate` 更新已有任务 |
| 完成任务目标 | `[quest_update:...]` 或 `questsUpdate` | 标记按任务名，补丁按 `questId`；结构化副本中不能绕过任务推进闸门 |
| 玩家受伤/回血/金币/经验 | `[damage:]` / `[heal:]` / `[gold:]` / `[exp:]` | 这些会触发系统消息、升级、死亡等副作用 |
| 计策/玩家知识/势力/关系/时钟/剧情弧/NPC 日程/反制 | `<state_update>` | 这些是补丁白名单的核心用途 |
| 新增地点/物品 | `<state_update>` 或 `[item_add:]` | 物品两者均可；地点更新仅 state_update 支持 |
| 新角色登场/退场 | `[new_char:]` / `[char_exit:]` | 需要 UI 确认，并通过 WorldEngine 结算场景角色列表变更 |

---

## 四、合理性协议（最高优先级 prompt 指令）

System prompt 里有这段约束，**所有 agent 扮演的 DM 必须遵守**：

1. 玩家声称"成功/说服/打败"时，必须要求检定或让 NPC 质问，绝不直接承认
2. 不合逻辑的行为必须被拒绝或产生负面后果
3. NPC 不会因"好话"违背立场——说服需要筹码/关系/检定
4. 重大成功需要铺垫——跳跃式成功伴随高 DC 或失败风险
5. 玩家跳过剧情关键环节时，用 NPC 拒绝/环境阻碍引导回正轨
6. "你是公正的 DM，不是许愿机"

### 玩家行动意图

玩家切换 `/行动` 后，系统会先生成本地风险预览。玩家确认后，消息会以 `type: "action_intent"` 写入历史，并在 prompt 中带上 `[玩家行动意图]` 前缀。

AI 处理规则：

- 尊重行动消息里的风险预览、建议检定和失败推进。
- 有对抗、不确定性、危险或重大收益时，用 `[check:属性名|DC值]` 要求检定。
- 检定失败必须产生推进型后果，例如暴露、关系变化、时间推进、资源损失、不完整线索、新场景、欠债或反制。
- 允许部分成功：目标达成但付出代价，或得到线索但引入新问题。

---

## 五、剧情弧推进协议

System prompt 注入 `storyArcs`，AI 必须按节拍推进：

```json
{
  "title": "混沌渗透之谜",
  "phase": "intro",
  "beats": [
    { "condition": "玩家获得初步信任", "action": "reveal:货舱遗物异常" },
    { "condition": "玩家调查货舱", "action": "reveal:助手死亡真相" },
    { "condition": "玩家接触灵能者", "action": "twist:第三道影子" }
  ],
  "currentBeat": 0
}
```

规则：
- 玩家行为满足当前 beat 的 `condition` 时，AI 必须在回复触发对应 `action`
- 玩家跑题时，用 NPC/事件引导回主线
- 一个 beat 消化完再推进下一个
- 非 `resolution` 结局阶段不得一次跳过多个 beat；系统会把 `advanceBy` 或 `currentBeat` 跳跃夹到下一步
- 推进必须写 `reason`，否则系统会记录“剧情推进待确认”并保持原 beat

agent 驱动时，应在触发或消化当前 beat 后输出：

```json
<state_update>
{ "storyArcUpdate": [{ "title": "混沌渗透之谜", "advance": true, "reason": "玩家确认货舱遗物异常" }] }
</state_update>
```

系统会白名单应用并持久化 `currentBeat`。
