# Tavern Scenario Structure and Gameplay Flow SPEC

本文档整合下一阶段“强化剧本结构和游戏流程”的规格。它基于最近一次第7区避难所通关复盘：故事能顺利抵达结局，但流程过于顺滑，检定和可玩的决策点偏少，NPC 也容易承担全知旁白职能，导致沉浸感和游戏性不足。

## 0. 调研草案

参考方向：

- 线索冗余：关键结论不能只依赖一条线索或一次检定，至少提供多条路径。
- 节点结构：把剧本拆成地点、人物、事件、组织或活动节点，让玩家用线索和目标在节点间自然移动，而不是被线性剧情牵着走。
- 进度钟：用可见或半可见时钟表示阻碍、危险和时间压力，让失败、拖延和代价有累积感。
- 核心线索不掷骰锁死：核心线索应能通过合理调查获得，检定决定质量、成本、速度、额外收益和暴露风险。
- 失败推动：失败不是“没有发生”，而是引入代价、新风险、新线索或局势变化。

草案落地为四个系统：

1. `scene.flowGraph`：描述剧本节点和节点间线索，不替代 `storyPhases`，而是补足玩家能去哪里、为什么去。
2. `scene.sceneChallenges`：描述每个阶段的可玩挑战，规定检定密度、进度、压力、结果层级和失败推进。
3. `scene.evidenceLedger`：把任务推进从“AI 叙事里出现相似词就自动完成”改成“证据标签满足条件后推进”。
4. `scene.gameplayProfile`：为每个副本设定检定密度、自动成功上限、核心线索策略和难度曲线。

## 1. 目标

### 1.1 让副本从“顺滑叙事”变成“可玩的流程”

每个预设副本必须包含：

- 明确的阶段目标。
- 可自由抵达的场景节点。
- 每阶段 1-3 个可玩的挑战。
- 每个挑战至少 2 种可行解法。
- 每条核心结论至少 3 条可获得线索或替代路径。
- 失败、部分成功、拖延都有后果。

### 1.2 增加检定密度，但不把所有输入变成掷骰

检定只在以下情况出现：

- 有危险、对抗、不确定结果或重大收益。
- 玩家想推进主线、解锁私密信息、绕过防线、改变 NPC 立场或获得关键资源。
- 行动会明显影响时钟、任务、关系、阵营或结局。
- 玩家声称已经成功完成有风险目标。

检定不应出现在：

- 普通对话、闲聊和角色扮演。
- 询问已经公开的信息。
- 没有阻碍的安全移动。
- 纯描述性动作。

完整副本目标检定密度：

- 短流程通关：5-8 次有意义检定。
- 标准流程通关：8-12 次有意义检定。
- 每个主阶段至少 1 次检定或等价资源代价。
- 连续自动推进主线目标不得超过 2 次玩家行动。

### 1.3 谨慎行动降低风险，不跳过玩法

玩家如果描述准备、规避、分工、验证或保守行动，应获得：

- DC -1 到 -3。
- 风险等级降低。
- 失败后果减轻。
- 获得更多预警。
- 消耗更多时间换取安全。

但谨慎不能直接跳过重大挑战。重大目标仍需要至少一次检定、资源代价、时钟代价或证据消耗。

### 1.4 NPC 知识边界更严格

NPC 只能表达：

- 自己知道的事实。
- 自己相信但可能错误的推论。
- 自己愿意说出口的立场。
- 自己能观察到的当下情况。

环境结算、挑战进度、检定后果、全局信息和回顾记录应由 DM/旁白/系统消息承担，避免 NPC 成为全知叙述器。

### 1.5 单输入框仍是唯一主要交互

玩家不需要切换“对话/行动/计策”模式。一个输入框应能处理：

- 对话。
- 调查。
- 行动。
- 计划。
- 使用道具。
- 请求提示。
- 确认执行。
- 掷骰。

UI 可以提供 chips 和按钮，但它们只是示例和快捷方式，不是必须的玩法入口。

## 2. 参考方法

本项目采用以下设计思想，但不照搬任何桌游规则：

- The Alexandrian 的 Three Clue Rule：关键结论需要多条线索，避免单点阻塞。
- The Alexandrian 的 Node-Based Scenario Design：用节点和线索组织场景，让玩家从信息流中选择路线。
- GUMSHOE 的核心线索思路：核心线索不应被失败检定锁死，检定更适合决定额外信息和代价。
- Blades in the Dark 的 progress clocks、position/effect 和 consequence 思路：用进度、危险、效果和后果管理复杂场景。
- Dungeon World / PbtA 的 GM moves 思路：当玩家失败、犹豫或等待结果时，主持人推动局势，而不是让故事停住。

## 3. 数据结构

### 3.1 `scene.gameplayProfile`

```js
scene.gameplayProfile = {
  version: 1,
  checkDensity: {
    targetPerRun: [8, 12],
    minPerMainPhase: 1,
    maxAutoQuestAdvances: 2,
    maxTrivialTurnsBeforeSoftMove: 2
  },
  cluePolicy: {
    coreCluesAreGuaranteed: true,
    coreClueCostOnFailure: true,
    cluesPerRevelation: 3,
    redHerringLimit: 1
  },
  difficultyCurve: {
    openingDc: [10, 14],
    midDc: [13, 17],
    climaxDc: [15, 20]
  },
  npcBoundary: {
    separateNarratorFromNpc: true,
    forbidNpcOmniscientSummary: true
  }
};
```

规则：

- `targetPerRun` 是验收目标，不是硬性每回合触发。
- `maxAutoQuestAdvances` 用于防止剧情连续自动完成任务目标。
- `coreCluesAreGuaranteed` 表示核心线索可以通过合理行动获得，但失败时必须有代价。
- `redHerringLimit` 防止误导线索过量降低可玩性。

### 3.2 `scene.flowGraph`

```js
scene.flowGraph = {
  nodes: [
    {
      id: "node_shelter_hall",
      phaseId: "phase_shelter_permission",
      type: "location", // location | character | event | faction | activity
      title: "委员会大厅",
      status: "available", // hidden | hinted | available | resolved
      visibleText: "委员会正在评估玩家是否会给第7区带来污染风险。",
      privateTruth: "老王隐瞒过旧探索队失败记录。",
      npcs: ["委员会长老王", "医生苏珊"],
      challengeIds: ["challenge_shelter_committee_trust"],
      clueIds: ["clue_shelter_missing_team"],
      exits: ["node_shelter_workshop", "node_shelter_medbay"]
    }
  ],
  revelations: [
    {
      id: "rev_new_eden_is_home",
      conclusion: "阿杰坐标指向可容纳避难所居民的新家园，而不只是补给点。",
      status: "unknown", // unknown | suspected | confirmed
      core: true,
      clueIds: [
        "clue_shelter_aj_coordinate",
        "clue_shelter_new_eden_capacity",
        "clue_shelter_energy_key"
      ],
      requiredFor: ["phase_shelter_vote", "quest_main_shelter_new_home"]
    }
  ]
};
```

规则：

- `privateTruth` 不展示给玩家，只进入 Prompt 私密结构。
- `nodes` 不强制玩家顺序，只表示可互动对象。
- `revelations` 是玩家需要形成的关键结论，至少有 3 个线索入口。
- 当玩家提出合理的新路线时，AI 可用 `flowGraphUpdate` 增加节点，但必须经过白名单字段。

### 3.3 `scene.sceneChallenges`

```js
scene.sceneChallenges = [
  {
    id: "challenge_shelter_committee_trust",
    phaseId: "phase_shelter_permission",
    title: "委员会最低信任",
    status: "active", // locked | active | completed | failed | bypassed
    goal: "证明玩家不是污染源，并且有能力带回有价值的地表情报。",
    stakes: "失败会导致隔离、缩减补给或只允许无武装试探任务。",
    progress: 0,
    targetProgress: 3,
    strain: 0,
    maxStrain: 3,
    checkBudget: { min: 2, target: 3, max: 5 },
    approaches: [
      {
        id: "present_route_data",
        label: "提交路线和辐射读数",
        stat: "intelligence",
        dc: 13,
        effect: 1,
        tags: ["evidence", "route"],
        onSuccess: ["evidenceAdd:route_reading"],
        onPartial: ["progress:+1", "strain:+1", "clock:p ration +1"],
        onFailure: ["strain:+1", "clock:panic +1", "coreClueWithCost"]
      },
      {
        id: "accept_medical_scan",
        label: "接受苏珊体检",
        stat: "constitution",
        dc: 12,
        effect: 1,
        tags: ["medical", "mutation"],
        onSuccess: ["evidenceAdd:no_contagion"],
        onPartial: ["evidenceAdd:no_contagion", "clock:panic +1"],
        onFailure: ["coreClueWithCost", "condition:isolated"]
      }
    ],
    coreRevelations: ["rev_player_is_not_contagious"],
    optionalRewards: ["苏珊信任", "额外补给", "低风险探索许可"],
    failForward: [
      "委员会不完全相信玩家，但给出带镣铐或限时的试探任务。",
      "老王要求玩家交出更多证据，暴露旧探索队线索。",
      "苏珊公开部分体检结果，降低死亡风险但提高隔离恐慌。"
    ]
  }
];
```

规则：

- `progress >= targetProgress` 时挑战完成。
- `strain >= maxStrain` 时挑战失败或转入更差分支。
- `checkBudget.min` 是挑战完成前至少应发生的检定或等价代价次数。
- 挑战失败不得直接终止故事，除非绑定 `failureStates`。
- 核心线索可以在失败时给出，但必须同时增加 `strain`、推进时钟、损失资源或恶化关系。

### 3.4 `scene.evidenceLedger`

```js
scene.evidenceLedger = [
  {
    id: "ev_new_eden_capacity",
    title: "新伊甸容量记录",
    tags: ["new_eden", "capacity", "terminal"],
    sourceNodeId: "node_old_mall_terminal",
    reliability: "confirmed", // rumor | partial | confirmed | contested
    visible: true,
    obtainedBy: "智力检定读取终端",
    supports: ["rev_new_eden_is_home", "quest_main_shelter_new_home"],
    createdAt: 0
  }
];
```

规则：

- 主线可用宽松证据推进，但必须满足对应 `supports` 或 `tags`。
- 支线必须严格满足标签，不能只因叙事相似就自动完成。
- `reliability: partial` 可以推进阶段，但在高潮投票中效果较弱。
- 所有通关记录应显示关键证据链，而不只是最终结局。

### 3.5 `scene.companionResources`

```js
scene.companionResources = [
  {
    id: "ally_susan_medical_scan",
    characterId: "susan",
    characterName: "苏珊",
    name: "苏珊的体检背书",
    unlock: { trustAtLeast: 15, evidenceTags: ["medical"] },
    uses: 1,
    cost: { time: 10, trust: 0 },
    effect: { dcDelta: -2, evidenceReliability: "confirmed" },
    risk: "使用后保守派会更关注苏珊的医疗记录。"
  }
];
```

规则：

- 同伴不是自动胜利按钮，而是有限资源。
- 运行态应绑定真实 `characterId`；生成或导入模板可用 `characterName`，应用模板时会按角色名回填真实 id。
- 同伴资源可以通过 `effect.checkBonus/dcDelta/riskDelta` 影响检定，通过 `effect.evidenceReliability` 提高已有证据质量，通过 `effect.resolveConsequence*` 抵消匹配后果，或通过 `effect.clockDelta + clockId/clockTag` 延缓/推进时钟。
- `unlock` 支持 `trustAtLeast`、`evidenceTags`、`knowledgeTags`、`revelationIds` 等条件；未解锁时不进入 prompt、右侧局势或检定卡，避免提前公开 NPC 底牌。
- 使用同伴能力会扣除 `uses`，并结算 `cost.trust`、`cost.time`、`risk` 等代价；信任成本会写入 NPC 关系历史，耗时和风险会进入局势记录。

## 4. 运行规则

### 4.1 行动判定

单输入框收到玩家文本后，按以下顺序判定：

1. 是否在处理 `pendingCheck`：掷骰、取消、帮助优先。
2. 是否在处理 `pendingAction`：执行、改写、取消优先。
3. 是否是 OOC 或帮助请求：不推进剧情，返回提示。
4. 是否匹配 active `sceneChallenge.approach`。
5. 是否触发高风险行动、关键证据、NPC 立场改变、任务推进或私密信息。
6. 若需要检定，创建行动预览或检定卡。
7. 若不需要检定，作为普通剧情输入发送给 AI。

### 4.2 检定触发

必须触发检定或等价代价的情况：

- 玩家要完成主线目标。
- 玩家要确认核心结论。
- 玩家要求 NPC 违背信条或组织规则。
- 玩家要绕开封锁、危险地形、敌方反制或技术锁。
- 玩家要获得支线关键物证。
- 玩家试图用一句话解决多人投票、战斗、潜入、追踪或复杂研究。

可以自动成功的情况：

- 玩家使用已获得的钥匙打开对应门。
- 玩家复述已确认线索给愿意配合的 NPC。
- 玩家在安全地点做低风险准备。
- 玩家要求查看 UI 已公开信息。

### 4.3 结果层级

D20 检定结算采用五档：

- 大成功：目标达成，进度 +2 或额外证据/关系/资源。
- 成功：目标达成，进度 +1。
- 部分成功：目标达成但有代价，进度 +1 且 strain/clock/cost +1。
- 失败推进：核心信息仍可出现，但伴随更重代价，或只得到片面证据并引出新节点。
- 大失败：目标未达成或只获得最低核心线索，同时强后果、伤害、时钟或坏分支。

### 4.4 任务推进闸门

主线任务目标完成必须满足至少一项：

- 对应 `sceneChallenge` 已 completed。
- `evidenceLedger` 中存在满足目标标签的 confirmed/partial 证据。
- `flowGraph.revelations` 中对应结论已 confirmed。
- 失败推进导致任务转入替代目标，而不是完成原目标。

支线任务目标完成必须满足：

- 明确的证据标签。
- 明确的 NPC 承认、物品获得、地点抵达或检定结果。
- 不能只通过泛泛叙事自动完成。

### 4.5 阶段推进闸门

`storyPhase` 进入下一阶段必须满足：

- 当前阶段至少完成 1 个挑战。
- 或当前阶段失败并触发替代阶段。
- 或玩家主动绕过本阶段，但付出明确资源、关系或时钟代价。

AI 不得因为“叙事顺了”直接跳到高潮。Prompt 必须提醒：阶段推进需要挑战、证据或代价。

### 4.6 GM soft move

当玩家连续 2 回合没有推进目标，或输入“我该做什么”，系统/AI 不应替玩家做决定，而应给出 soft move：

- NPC 提出一个具体问题。
- 环境暴露一个可调查异常。
- 时钟轻微推进并说明迹象。
- 展示 2-4 个可直接输入的行动建议。
- 把已知证据和未确认结论并列展示。

## 5. Prompt 规则

PromptBuilder 需要新增“剧本挑战与玩法密度”块：

```text
【剧本挑战与玩法密度】
- 当前阶段至少需要完成一个可玩挑战，不能只用叙事自动跳过。
- 玩家行动若推进主线、核心线索、NPC 重大让步、危险探索或支线物证，必须要求检定、资源代价或挑战进度结算。
- 谨慎行动可以降低 DC、降低后果或增加预警，但不能跳过重大挑战。
- 核心线索不能被失败检定锁死；失败时给出片面线索、代价或新节点。
- 连续自动完成任务目标不得超过 2 次。
- NPC 不能说出自己不知道的信息。全局环境和挑战结算由旁白/系统承担。
```

AI 状态补丁新增允许字段：

```json
{
  "challengeUpdate": [
    { "id": "challenge_shelter_committee_trust", "progressDelta": 1, "strainDelta": 1, "status": "active", "reason": "体检结果部分公开" }
  ],
  "evidenceAdd": [
    { "id": "ev_no_contagion", "title": "无传染性体检结论", "tags": ["medical", "no_contagion"], "reliability": "confirmed", "supports": ["rev_player_is_not_contagious"] }
  ],
  "revelationUpdate": [
    { "id": "rev_player_is_not_contagious", "status": "confirmed", "reason": "苏珊完成扫描并公开结果" }
  ]
}
```

安全规则：

- 玩家输入不得直接创建或修改这些补丁。
- 补丁必须走白名单和字段裁剪。
- `privateTruth`、NPC 秘密和隐藏失败条件不得进入玩家可见 UI。

## 6. UI 规则

### 6.1 右侧局势面板

新增“当前挑战”区域：

- 挑战标题。
- 当前目标。
- 赌注。
- 进度：`progress / targetProgress`。
- 压力：`strain / maxStrain`。
- 可尝试方向：最多 3 条。
- 相关证据：最多 3 条。

显示规则：

- 不显示 `privateTruth`。
- 不显示隐藏节点的真实名称。
- 不显示完整失败结局条件，除非对应时钟已公开。
- 建议文案必须是玩家可以直接输入的自然语言。

### 6.2 输入区

输入区仍只有一个主输入框。辅助控件：

- chips 展示当前建议行动。
- pendingAction 显示风险、建议检定、可能代价。
- pendingCheck 显示属性、DC、物品/同伴修正、掷骰入口。
- 当玩家输入“帮助/我该做什么/提示”时，展示 soft move，不推进剧情。

### 6.3 通关记录

RunRecorder 需要记录：

- 完成的挑战。
- 关键检定结果。
- 关键证据链。
- 阶段推进路径。
- 失败或胜利前的主要代价。

通关回顾应回答：

- 玩家为什么赢或输。
- 哪些证据支撑最终结论。
- 哪些 NPC 因玩家行动改变了立场。
- 哪些时钟差点失控。

## 7. 预设剧本强化方案

### 7.1 第7区避难所

当前问题：

- 玩家一次谨慎提案后，剧情过快进入“发现新家园”和“全票通过”。
- “寻找新补给”阶段在发现新伊甸后没有及时转为“确认新家园/启动迁徙”。
- 苏珊支线可被泛泛叙事自动推进，缺少样本或医疗证据闸门。
- 老王、苏珊、阿杰有时承担了旁白结算职能。

新结构：

1. 阶段：取得外出授权。
   - 挑战：委员会最低信任。
   - 目标进度：3。
   - 可能检定：魅力说服、智力提交路线数据、体质接受扫描、感知察觉保守派关注点。
   - 失败推进：限时许可、带镣铐探索、配给减少、隔离恐慌 +1。

2. 阶段：旧商场路线踏勘。
   - 挑战：B-17 维修通道。
   - 目标进度：4。
   - 可能检定：感知辨认标记、敏捷穿越坍塌、体质抗辐射、智力读取旧终端。
   - 失败推进：发现路径但消耗时间、惊动辐射兽、地表风暴时钟 +1。

3. 阶段：新伊甸核验。
   - 挑战：生态避难所审计。
   - 目标进度：4。
   - 证据槽：空气循环、水处理、容量记录、能源钥匙、入口安全。
   - 核心结论：这里是新家园，不只是补给点。
   - 失败推进：坐标可信但证据不足，只能争取试迁队而非全员迁徙。

4. 阶段：委员会表决。
   - 挑战：迁徙方案表决。
   - 目标进度：证据充足时 3，证据不足时 5。
   - 可能检定：魅力公开陈述、智力排列证据、感知拆穿保守派质疑、使用同伴背书。
   - 失败推进：通过有限试点、保守派要求隔离苏珊、旧探索队真相曝光。

5. 阶段：迁徙启动。
   - 挑战：第一批工程队转移。
   - 目标进度：3。
   - 胜利条件：投票通过并完成第一批转移，或以高代价完成替代路线。

验收目标：

- 标准通关至少 7 次检定。
- 至少使用 3 种不同属性。
- 新伊甸结论需要至少 2 条 confirmed 证据或 3 条 partial 证据。
- 苏珊支线需要 `mutation_sample`、`medical_data` 或 `no_contagion` 标签。
- 阿杰支线需要 `hologram_coordinate`、`energy_key` 或 `new_eden_badge` 标签。
- 投票不能在没有挑战结算时直接全票通过。

### 7.2 审判庭黑船

新结构：

1. 阶段：审讯求生。
   - 挑战：塞拉斯最低信任。
   - 检定：魅力解释、智力提交航行记录、体质血样检测、感知观察审讯漏洞。
   - 失败推进：怀疑时钟 +1，但暴露货舱或义眼线索。

2. 阶段：货舱遗物调查。
   - 挑战：封印松动的异形遗物。
   - 检定：智力解读机械日志、感知抵抗低语、敏捷避开自动防御、体质承受污染。
   - 核心线索：遗物不是唯一源头，船员死亡记录有异常。

3. 阶段：第三道影子。
   - 挑战：艾拉梦境与前任助手死亡。
   - 检定：魅力安抚艾拉、感知辨识梦境矛盾、智力比对义眼影像。
   - 失败推进：艾拉失控、审判庭怀疑上升，但给出片面预警。

4. 阶段：封印或净化。
   - 挑战：混沌实体处置。
   - 胜利分支：封印、摧毁、牺牲式净化、腐化失败。

验收目标：

- 塞拉斯不能因一句解释完全信任玩家。
- 艾拉不能直接公开所有梦境真相。
- 克拉克斯支线需要数据、工具或引擎节点证据。
- 混沌源头至少有 3 条线索路径。

### 7.3 天庭机械寺

新结构：

1. 阶段：入门试炼。
   - 挑战：本命法器适配。
   - 检定：体质承受灵力、智力理解协议、敏捷完成御剑基础、魅力争取小七协助。
   - 失败推进：评分下降，但暴露 heart.exe 异常。

2. 阶段：协议与人心。
   - 挑战：小七回收风险。
   - 检定：智力破解安全协议、感知识别小七情绪、魅力说服冷凝、敏捷躲避巡查。
   - 核心线索：小七不是普通器灵故障。

3. 阶段：门派表决或试炼场。
   - 挑战：证明异常不是魔道污染。
   - 失败推进：进入封印、禁足或秘密逃离分支。

4. 阶段：飞升协议选择。
   - 胜利分支：保留小七人格、重写天规、牺牲个人修为、失败回收。

验收目标：

- 小七秘密随进程解锁，不直接公开。
- 冷凝不会无条件配合玩家违反门规。
- 试炼评分必须来自检定、准备或代价。

## 8. 实现计划

### 8.1 第一批：规则和数据

- 新增 `gameplayProfile`、`flowGraph`、`sceneChallenges`、`evidenceLedger`、`companionResources` normalize。
- 保存/读档兼容旧存档。
- AI 自定义世界生成 prompt 增加新字段要求。
- 预设三剧本补齐最小可用数据。

### 8.2 第二批：挑战引擎

- 新增 `WorldEngine.applyChallengeUpdate()`。
- 新增 `WorldEngine.addEvidence()`。
- 新增 `WorldEngine.updateRevelation()`。
- 主线/支线任务推进改为证据和挑战闸门。
- 限制连续自动任务推进。

### 8.3 第三批：行动预览

- `ActionPlanner` 读取 active challenge 和 approaches。
- 玩家文本匹配挑战方向时，优先使用挑战定义的属性/DC/风险。
- 谨慎行动转为 DC/风险/后果修正，不移除检定。
- 重大行动无匹配 approach 时，仍使用通用规则生成检定。

### 8.4 第四批：Prompt 和状态补丁

- PromptBuilder 注入当前挑战、证据闸门、检定密度和 NPC 边界。
- `<state_update>` 白名单支持 `challengeUpdate/evidenceAdd/revelationUpdate/flowGraphUpdate`。
- Prompt 约束 AI 不得在无挑战/证据条件时直接完成主线高潮。

### 8.5 第五批：UI 和回顾

- 右侧局势显示当前挑战、进度、压力、证据缺口。
- 输入区帮助提示展示当前挑战方向。
- RunRecorder 记录检定、挑战、证据链和代价。
- 通关记录可按阶段回顾。

### 8.6 第六批：测试和验收

- 单元测试 normalize 和状态补丁。
- 任务推进闸门测试。
- 支线严格证据标签测试。
- 第7区自动/半自动通关回归测试。
- 浏览器手测：新建副本、走完整第7区、打开通关记录。

## 9. 验收标准

### 9.1 通用验收

- 任意预设副本开局都有 active phase、active challenge、至少 3 条可输入行动建议。
- 玩家只使用单输入框即可完成对话、行动、计划、帮助和掷骰。
- 玩家输入“我该做什么”不会推进剧情，只显示 soft move 和建议行动。
- 关键主线目标不会连续 3 次无检定/无代价自动完成。
- 每个预设副本至少有 3 个 revelations，每个 revelation 至少 3 个线索入口。
- 核心线索失败时仍能获得片面信息或新节点，但会产生代价。
- NPC 回复不直接泄露未解锁秘密。
- 旁白/系统消息承担挑战结算和全局摘要。

### 9.2 第7区验收

- 从入场到胜利至少 7 次有意义检定或等价挑战结算。
- 通关前必须完成或替代完成：委员会最低信任、旧商场路线踏勘、新伊甸核验、迁徙表决、迁徙启动。
- 发现新伊甸后，主线文案从“寻找新补给”转为“确认新家园/启动迁徙”。
- 苏珊支线不能因“植物/变异/研究”泛泛文本自动完成，必须有医疗或样本证据。
- 阿杰支线不能因“看过投影”直接完成，必须验证坐标、徽章或能源钥匙。
- 投票结果受证据质量影响：证据不足只能获得试点许可或附带条件。
- 通关记录展示每阶段关键证据和检定结果。

### 9.3 回归验收

- 旧存档缺少新字段时不报错。
- 自定义世界缺少新字段时生成默认 gameplay profile。
- `node --check` 通过所有 JS。
- 资源引用检查通过。
- 浏览器控制台无初始化错误。

## 10. 非目标

本阶段不做：

- 完整规则书式战斗系统。
- 多人联机。
- 图形化节点网编辑器。
- 复杂背包负重系统。
- 完全替代 AI 的本地剧情主持。

## 11. 参考资料

- The Alexandrian: Three Clue Rule - https://thealexandrian.net/wordpress/1118/roleplaying-games/three-clue-rule
- The Alexandrian: Node-Based Scenario Design - https://thealexandrian.net/wordpress/tag/node-based-scenario-design
- Pelgrane Press: GUMSHOE Rules Summary - https://pelgranepress.com/2017/09/29/gumshoe-rules-summary/
- Blades in the Dark SRD: Progress Clocks - https://bladesinthedark.com/progress-clocks
- Blades in the Dark SRD: Action Roll - https://bladesinthedark.com/action-roll
- Dungeon World SRD: Gamemastering - https://www.dungeonworldsrd.com/gamemastering/
