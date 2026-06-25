# Tavern Scenario Deepening SPEC

本文档定义“剧本与角色深化”的实现规格。目标是在现有单输入框、检定、线索账本和局势时钟之上，让预设剧本形成更稳定的故事循环：玩家通过行动发现线索，线索解锁 NPC 私密信息，NPC 和局势根据玩家选择推进，最终导向分支性的高潮。

## 1. 目标

### 1.1 秘密必须有发现路径

NPC 的动机、恐惧、秘密和筹码不能只作为隐藏文本存在。每个关键秘密至少应有一条可玩的发现路径：

- 暗示：玩家能看到异常反应或传闻，但不知道真相。
- 证据：玩家通过观察、询问、潜入、交易或检定得到可验证信息。
- 推论：玩家把两条以上线索串联起来，接近真相。
- 确认：NPC 承认、物证坐实，或剧情事件公开真相。

### 1.2 剧情按阶段推进

每个预设剧本至少包含三个阶段：

- 开局：建立信任、识别威胁、获得行动资格。
- 中段：调查、站队、准备、反制和代价。
- 高潮：危机爆发，玩家作出不可逆选择。

阶段不是强制章节。它为推荐行动、Prompt 叙事和局势面板提供上下文，玩家仍然可以自由行动。

### 1.3 压力必须有剧本特色

每个剧本应拥有专属 `clocks` 和初始 `counterStrategies`，避免所有世界都退化成同一个“主线压力”。压力应对应世界题材：

- 黑船：审判庭怀疑、亚空间风暴、遗物低语。
- 机械寺：试炼评分、安全协议、小七回收风险。
- 避难所：配给耗尽、隔离恐慌、地表风暴。

### 1.4 UI 告诉玩家“为什么重要”

右侧局势面板不仅展示可选行动，还应展示：

- 当前剧情阶段。
- 当前赌注。
- 尚未解决的关键未知。
- 可追查的下一条线索。

这些内容不得泄露私密真相，只能展示调查方向和已知风险。

## 2. 数据结构

### 2.1 `scene.storyPhases`

```js
scene.storyPhases = [
  {
    id: "phase_trust",
    title: "建立最低信任",
    status: "active", // locked | active | completed
    goal: "让关键 NPC 相信玩家有行动价值",
    stakes: "失败会导致玩家被隔离、驱逐或失去行动资格",
    entry: "开场默认",
    exit: "获得关键 NPC 的初步许可或找到替代筹码",
    recommendedActions: ["向关键 NPC 解释经历", "寻找一条可验证证据"],
    pressureTags: ["suspicion", "resource"],
    spotlight: ["审判官塞拉斯"]
  }
]
```

规则：

- 任意时刻最多一个阶段应为 `active`。
- 没有 active 阶段时，系统选择第一个未 completed 阶段。
- 推荐行动优先来自 active 阶段，再结合任务、时钟、反制和线索。

### 2.2 `scene.clueGraph`

```js
scene.clueGraph = [
  {
    id: "clue_blackship_third_shadow",
    title: "第三道影子",
    subjectType: "mystery", // character | faction | location | mystery | item
    subjectName: "艾拉的梦境",
    status: "hinted", // hidden | hinted | suspected | confirmed
    currentStage: 0,
    truth: "船上存在不属于活人的灵能实体",
    stages: [
      {
        level: "hint",
        title: "梦境异常",
        text: "艾拉反复提到第三道影子，但无法解释它来自哪里。",
        source: "灵能者艾拉",
        locationId: "psyker",
        actions: ["询问艾拉第三道影子在梦里出现的地点"],
        check: { stat: "感知", dc: 12 },
        onFailure: "艾拉受到刺激，灵能镣铐报警，但她说出一个片面画面。"
      }
    ]
  }
]
```

规则：

- `truth` 是 DM 私密信息，不能直接出现在玩家 UI。
- UI 只展示当前阶段的 `text/actions/source`，或通用未知提示。
- AI 可以通过 `clueUpdate` 推进 `status/currentStage/evidence`。
- `knowledgeAdd` 仍用于玩家已知线索账本；`clueUpdate` 用于剧本结构进度。

### 2.3 `scene.consequenceLedger`

```js
scene.consequenceLedger = [
  {
    id: "cons_...",
    title: "审判庭怀疑上升",
    cause: "玩家拒绝配合血样检查",
    effect: "塞拉斯限制玩家前往货舱",
    severity: "medium",
    turn: 4
  }
]
```

本阶段先做字段兼容和 Prompt 约束，UI 可后续扩展为完整日志。

## 3. Prompt 规则

PromptBuilder 必须注入：

- 当前 active story phase。
- 可见或已暗示 clueGraph 项。
- 每条 clue 的当前追查行动。
- 私密 truth 的泄露限制。

AI 输出 `<state_update>` 时可以使用：

```json
{
  "clueUpdate": [
    {
      "id": "clue_blackship_third_shadow",
      "status": "suspected",
      "advance": true,
      "evidenceAdd": ["玩家从艾拉口中得知影子出现在货舱方向"]
    }
  ]
}
```

## 4. UI 规则

右侧“局势”面板新增：

- 当前阶段：title / goal / stakes。
- 关键未知：最多 3 条 clueGraph 当前阶段提示。
- 每条未知只显示可追查文本，不显示 truth。

## 5. 本阶段执行范围

本阶段必须完成：

- 新增 `docs/SCENARIO_DEEPENING_SPEC.md`。
- 三个预设剧本补 `storyPhases`。
- 三个预设剧本补 `clueGraph`。
- 三个预设剧本补专属 `clocks` 和初始 `counterStrategies`。
- 运行时兼容新字段：normalize、保存、读档、Prompt 注入、局势面板展示。

本阶段暂不做：

- 完整后果账本 UI。
- 图形化线索网。
- 自动根据语义判断每条 clue 是否满足，仍由 AI 通过 `clueUpdate` 与 `knowledgeAdd` 推进。

## 6. 验收

- 新建任意预设世界后，局势面板能看到当前阶段和赌注。
- 新建任意预设世界后，局势面板能看到 1-3 条不剧透的关键未知。
- 推荐行动包含阶段行动或线索追查行动。
- Prompt 中包含阶段和线索图上下文。
- AI 状态补丁可安全应用 `clueUpdate`。
- 未确认的 `clueGraph.truth` 不出现在局势 UI。
- 旧存档缺少新字段时不会报错。
