# 多 agent 模拟与游玩报告

> 本文档定义如何用多个 agent 模拟酒馆场景，以及一局模拟结束后如何输出可复盘的游玩报告。

## 一、目标

多 agent 模拟不是让多个模型无约束闲聊，而是把现有 `scene` 当作共享世界状态：

- 一个 **DM agent** 维护叙事、公正裁决、标记和 `<state_update>`。
- 一个或多个 **玩家 agent** 扮演玩家角色，提出行动、计策和选择。
- 多个 **NPC agent** 扮演 `scene.characters` 中的角色，严格遵守各自信条、秘密、筹码和关系。
- 一个可选 **Observer agent** 记录状态变化、校验协议、生成报告。

所有 agent 共用 `GAME_STATE.md` 的状态结构，并通过 `API_PROTOCOL.md` 的标记/补丁协议产生可应用后果。

## 二、推荐 agent 角色

### DM agent

职责：

- 维护世界逻辑和合理性协议。
- 判断何时要求 `[check:属性|DC]`。
- 触发任务、移动、伤害、奖励、新角色、退场等标记。
- 只通过白名单 `<state_update>` 改计策、情报、势力、关系、地点、物品。
- 控制节奏，每 2-3 轮引入事件或推动剧情弧。

禁止：

- 替玩家做最终决定。
- 无条件承认玩家自称的成功。
- 修改 `settings`、`apiKey` 或任意非白名单状态。
- 因讨好某个 agent 破坏 NPC 信条。

### Player agent

职责：

- 扮演玩家，不读取 NPC 私密字段，除非模拟设定允许“全知玩家”。
- 通过自然语言提出行动、调查、谈判、计策或移动意图。
- 接受检定和失败后果。
- 明确资源使用、筹码、风险偏好。

推荐输入格式：

```text
【玩家行动】
目标：获得审判官初步信任
做法：承认自己隐瞒了一部分经历，但主动交出货舱日志碎片
风险偏好：愿意接受一次中等 DC 的魅力检定
```

### NPC agent

职责：

- 只扮演一个角色。
- 遵守 `creed`、`redLines`、`values`。
- 使用 `motives`、`fears`、`secrets`、`leverage` 做长期决策。
- 根据关系、势力和世界紧张度调整态度。

禁止：

- 泄露自己不知道的信息。
- 违背底线讨好玩家。
- 直接改状态；如需后果，应由 DM agent 汇总为标记或补丁。

### Observer agent

职责：

- 记录每轮输入、输出、标记、补丁和状态变化。
- 校验 JSON、白名单、安全约束。
- 追踪任务、计策、剧情弧、死亡/胜利条件。
- 生成最终游玩报告。

Observer 不参与剧情裁决，除非模拟明确把它设为仲裁器。

## 三、单轮模拟循环

推荐顺序：

```text
1. 读取当前 scene、角色公开信息、最近 messages、summary。
2. Player agent 产出玩家行动。
3. DM agent 根据行动、规则层和剧情弧产出叙事、标记和 state_update。
4. 解析 DM 输出：
   - 剥离 <state_update>
   - 解析方括号标记
   - 保存清理后的正文为 assistant 消息
5. 应用标记：
   - [check:] 生成 check 消息
   - [damage:] / [heal:] / [gold:] / [exp:] 更新玩家状态
   - [quest:] / [quest_update:] 更新任务
   - [item_*] 更新背包
   - [move:] 移动到相邻地点
6. 应用 state_update 白名单补丁。
7. NPC agent 根据最新状态各自回应，或由调度器选择 1 个 NPC 回应。
8. Observer 记录本轮 diff。
9. 检查 gameState、主线任务、HP、轮数上限。
```

现有浏览器实现中，步骤 3-6 主要由 `GroupChat.replyAs()`、`_parseMarkers()`、`_processMarkers()` 和 `StrategyManager.applyStateUpdate()` 执行。外部模拟可以复刻这个流程，也可以直接驱动浏览器 UI。

## 四、多 NPC 调度策略

推荐从简单到复杂逐步实现：

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| 当前选中角色优先 | 与现有 UI 一致，当前角色先回应 | 人类旁观调试 |
| 轮询 | 每轮选择下一个 NPC | 小队式群聊 |
| 相关性选择 | 根据玩家提到的人名、地点、任务选择 NPC | 剧情模拟 |
| 主动性权重 | `_priority`、`_talkativeness`、动机强度影响发言概率 | 社会模拟 |
| 冲突驱动 | 势力态度、秘密暴露、世界紧张度越高越容易发言 | 阴谋/政治模拟 |

最低可行实现：每轮只让 DM 和一个最相关 NPC 发言，避免消息爆炸。

## 五、上下文隔离

公开给所有 agent：

- `scene.name`、`background`
- `scene.userName`、`playerPersona`
- 当前地点、地图、任务、背包、装备、玩家属性/HP/金币/等级
- 已出现的 `messages`
- `summary`
- 世界书中已触发或明确公开的内容
- 已发现的 `intel`
- 公开势力态势

只给 DM 或对应 NPC：

- NPC 的 `secrets`
- NPC 的隐藏 `leverage`
- 未发现情报
- 剧情弧完整 beats
- Observer 的审计记录

如果模拟选择“全知 agent”，报告中必须注明，因为这会影响复盘可信度。

## 六、协议校验清单

每轮 DM 输出后校验：

- `<state_update>` JSON 是否合法。
- state_update 是否只包含白名单字段。
- 方括号标记是否能被 `GroupChat._parseMarkers()` 正则识别。
- `[quest_update:任务名|序号]` 的序号是否从 1 开始。
- `[move:地点名]` 是否指向当前地点可达节点。
- `[damage:N|原因]` 是否符合剧情风险，不是无故惩罚。
- `[check:属性|DC]` 属性名是否为六项之一，DC 是否合理。
- AI 正文中是否残留隐藏 JSON 或内部推理。
- 是否出现 XSS 风险内容；渲染前必须走 `Renderer`。

## 七、已知限制

当前实现的限制，外部多 agent 模拟需要注意：

- `storyArcs.currentBeat` 可通过 `storyArcUpdate` 推进；外部模拟如果绕过浏览器实现，需要自行应用同等补丁。
- `WorldEngine.tickAfterPlayerTurn()` 会在浏览器端推进局势时钟和 NPC 离屏行动；外部模拟若不驱动浏览器，需要自行复刻。
- `<state_update>` 不能直接创建任务，只能轻量更新已有任务；创建任务应使用 `[quest:]`。
- `characterUpdates` 和 `npcAgendaUpdate` 优先使用 `characterId`，也支持当前场景内唯一角色名（`characterName/name/actorName/targetName`）匹配；外部模拟需要复刻重名跳过规则，避免误改。
- `[move:]` 按地点名匹配（支持部分匹配），外部模拟最好使用精确名称。
- 动态 `[new_char:]` 支持扩展字段并会自动补齐 `creed/redLines/values/motives/fears/secrets/leverage/profile.hiddenFacts`；外部模拟若绕过浏览器，需要复刻 `PromptGuard` 和 `NewCharacterHandler` 的裁剪、默认值与解锁槽生成逻辑。
- 自动摘要依赖 LLM API，外部模拟若不调用浏览器实现，需要自己维护 `summary`。
- 流式中断可能导致末尾 `<state_update>` 不完整，应在完整文本结束后再解析补丁。

## 八、游玩报告格式

推荐输出 Markdown：

```markdown
# 游玩报告：<场景名>

## 元信息

- 模拟日期：YYYY-MM-DD
- 回合数：N
- 使用模型：<model>
- 模拟模式：单玩家 / 多玩家 / 多 NPC 社会模拟
- 可见性：玩家是否读取隐藏信息
- 结束状态：playing / defeated / victorious / stopped

## 参与者

| agent | 扮演对象 | 可见信息 | 目标 |
|-------|----------|----------|------|
| DM | 叙述者 | 全局状态、隐藏信息 | 公正裁决、推进剧情 |
| P1 | 玩家 | 公开状态 | 完成主线 |
| NPC-1 | 审判官塞拉斯 | 自身秘密和公开状态 | 根除混沌 |

## 初始状态摘要

- 当前地点：
- 玩家状态：
- 活跃任务：
- 已知情报：
- 势力态势：
- 当前剧情弧 beat：

## 回合日志

### Round 1

**玩家行动**

...

**DM 输出摘要**

...

**解析出的标记**

- `[check:魅力|15]`
- `<state_update>`：新增计策、世界紧张度 +5

**状态变化**

- 新增计策：
- HP/金币/经验：
- 任务：
- 关系：
- 地点：

**裁决备注**

- 检定合理性：
- 是否有协议违规：

## 关键转折

1. ...
2. ...
3. ...

## 最终状态

- `gameState`：
- HP：
- 等级/经验/金币：
- 完成任务：
- 未解决任务：
- 当前地点：
- 活跃计策：
- 世界紧张度：

## 计策复盘

| 计策 | 阶段 | 状态 | 风险 | 进度 | 结果 |
|------|------|------|------|------|------|
| ... | action | exposed | 70 | 45 | ... |

## 角色关系变化

| 角色 | 初始态度 | 最终态度 | 变化原因 |
|------|----------|----------|----------|
| ... | 0 | +12 | ... |

## 协议违规或风险

- 无 / 列出违规输出、错误标记、非法补丁、安全问题。

## 复现材料

- 初始 scene JSON：
- agent prompt 版本：
- 随机种子或检定结果：
- 关键模型输出：
```

## 九、最小模拟示例

```text
Round 1 玩家行动：
我不否认自己去过污染星球，但主动交出货舱通行牌，要求换取一次证明清白的机会。

DM 回复末尾：
[check:魅力|15]
<state_update>
{
  "strategies": {
    "create": [{
      "title": "争取审判官初步信任",
      "goal": "用可验证证据换取行动空间",
      "phase": "intel",
      "status": "preparing",
      "risk": 40,
      "progress": 10
    }]
  },
  "intelAdd": [{
    "text": "玩家持有货舱通行牌，可能接触过异形遗物区域",
    "source": "玩家自述与物证",
    "reliability": "confirmed"
  }],
  "scene": { "worldTensionDelta": 3 }
}
</state_update>
```

报告应记录：创建了计策、世界紧张度上升、触发魅力检定、审判官未直接相信玩家但给出条件。
