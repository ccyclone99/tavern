/**
 * 新手教程系统
 * - 独立教学世界（新手酒馆）
 * - 教学状态机（localStorage 持久化）
 * - 5 步教学剧本（行为驱动推进）
 * - 复用 DM 叙事通道（_dmNarrate + buildTutorialNarration）
 *
 * 守卫：所有教学逻辑都通过 TutorialWorld.isCurrentScene() 限定在教学世界内，
 * 普通世界零影响。
 */

// ============================================================
// 1. 教学状态机（持久化）
// ============================================================
const TutorialState = {
    KEY: 'tavern_tutorial_progress',
    _data: null,

    load() {
        if (this._data) return this._data;
        try {
            const raw = localStorage.getItem(this.KEY);
            this._data = raw ? JSON.parse(raw) : { completed: false, skipped: false, step: 0, seenHints: [] };
        } catch (e) {
            this._data = { completed: false, skipped: false, step: 0, seenHints: [] };
        }
        return this._data;
    },

    save() {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(this.load()));
        } catch (e) {
            console.warn('教程进度保存失败:', e);
        }
    },

    /** 教程是否还需要展示（未完成且未主动跳过） */
    isNeeded() {
        const d = this.load();
        return !d.completed && !d.skipped;
    },

    getStep() { return this.load().step; },
    setStep(n) { const d = this.load(); d.step = n; this.save(); },

    /** 标记某步骤完成，自动推进到下一步 */
    markStepDone(n) {
        const d = this.load();
        if (d.step < n + 1) d.step = n + 1;
        if (d.step >= TutorialScript.STEPS.length) d.completed = true;
        this.save();
    },

    markCompleted() {
        const d = this.load();
        d.completed = true;
        this.save();
    },

    /** 主动跳过（大厅清单"不再显示"） */
    skip() {
        const d = this.load();
        d.skipped = true;
        this.save();
    },

    /** 记录已展示的首遇提示，防重复 */
    hasSeenHint(id) { return this.load().seenHints.includes(id); },
    markHintSeen(id) {
        const d = this.load();
        if (!d.seenHints.includes(id)) { d.seenHints.push(id); this.save(); }
    },

    reset() {
        this._data = { completed: false, skipped: false, step: 0, seenHints: [] };
        this.save();
    }
};

// ============================================================
// 2. 教学剧本（5 步，完整覆盖核心玩法）
// ============================================================
const TutorialScript = {
    /**
     * 每个步骤：goal（教学目标）, cue（DM 引导话术要点）, doneHint（玩家行为提示）
     * 行为推进由 Tutorial.afterPlayerMessage 等钩子判定，不依赖 AI 文本。
     */
    STEPS: [
        {
            id: 0,
            title: '基础对话',
            goal: '让玩家学会直接打字与角色对话',
            cue: '欢迎玩家来到新手酒馆。用亲切幽默的语气打破第四面墙，告诉玩家：「你现在可以像聊天一样，直接在下面输入框打字，然后按发送，跟我说话试试看。」语气要轻松，像老朋友。',
        },
        {
            id: 1,
            title: '群聊指定角色',
            goal: '让玩家学会点击右侧角色头像，指定回复对象',
            cue: '夸奖玩家发消息成功。然后说：「这个酒馆里还有别人哦——看看右边（或左边）的角色列表，点击某个角色的头像或名字，就可以专门跟他/她说话了。试试点击艾莉，再跟她聊一句。」',
        },
        {
            id: 2,
            title: '计策模式',
            goal: '让玩家进入计策模式，制定一个计划',
            cue: '引导玩家：「想让莫里斯给你打折？光靠聊天可不够——你可以点输入框旁边的 /计策 按钮，进入『主持人模式』，让我（作为 DM）帮你制定一个说服计策。点一下试试，哪怕只是个馊主意也行。」',
        },
        {
            id: 3,
            title: 'D20 检定',
            goal: '让玩家经历一次检定并看懂结果',
            cue: '玩家已在计策模式。引导他尝试一个有风险的小行动（比如说服莫里斯、或跟艾莉掷骰子）。当系统检测到检定发生并叙述完结果后，本步自动完成。',
        },
        {
            id: 4,
            title: '地图移动',
            goal: '让玩家打开地图并移动到新地点',
            cue: '引导玩家：「最后教你看地图——点击右侧 🗺 地图标签，你会看到酒馆的几个房间。点击『后院』，你的角色就会走过去。试试看！」',
        },
        {
            id: 5,
            title: '毕业',
            goal: '恭喜玩家出师，引导其回大厅开始真正的冒险',
            cue: '热烈祝贺玩家完成所有教学。告诉他：「你已经掌握了对话、指定角色、计策、检定、地图——这套功夫足够你在任何世界冒险了。想开始真正的旅程，随时点左上角回大厅，选一个你喜欢的世界。如果你想留在这儿再练练手，也完全没问题。」',
        }
    ],

    getStep(n) { return this.STEPS[n] || null; }
};

// ============================================================
// 3. 教学世界数据（复用 WorldGenerator.templates 结构）
// ============================================================
const TutorialWorld = {
    id: 'tutorial_newbie_tavern',
    name: '新手酒馆',
    cover: '📖',
    description: '专为新手准备的 5 分钟教程。一位亲切的老酒馆老板会手把手教你：对话、群聊、计策、检定、地图——玩完这关，你就能在任何世界冒险了。',
    background: 'linear-gradient(180deg, #1a1410 0%, #2a1f15 50%, #1a1208 100%)',
    isTutorial: true,

    /** 判断当前场景是否是教学世界（守卫函数，普通世界返回 false） */
    isCurrentScene() {
        const scene = State.scene;
        if (!scene) return false;
        // 内存标记（刷新后丢失，下方兜底）
        if (scene._isTutorial || scene.tutorialWorldId === this.id) return true;
        // 持久化兜底：教学世界的标志性数据（刷新后仍可识别）
        const hasTutorialQuest = Array.isArray(scene.quests) &&
            scene.quests.some(q => q.id === 'q_tutorial');
        return hasTutorialQuest;
    },

    /** 教学世界完整数据，结构对齐 WorldGenerator.applyTemplate 的输入 */
    toTemplate() {
        return {
            id: this.id,
            name: this.name,
            cover: this.cover,
            description: this.description,
            background: this.background,
            scenario: '故事发生在一座温馨的新手酒馆「橡木桶」。这里没有危险、没有战斗，只有一位热情好客的老酒馆老板莫里斯，以及几位来帮忙教学的角色。玩家刚踏入酒馆，准备学习冒险的基本功。',
            userName: '新人',
            playerStats: { strength: 10, dexterity: 12, constitution: 11, intelligence: 14, wisdom: 12, charisma: 13 },
            locations: [
                { id: 'bar', name: '吧台', description: '橡木吧台擦得发亮，莫里斯正在擦拭酒杯。墙上挂满了老冒险者的合影', connections: ['yard', 'attic'] },
                { id: 'yard', name: '后院', description: '一个小巧的庭院，艾莉正坐在树下拨弄琴弦，空气里飘着花香', connections: ['bar'] },
                { id: 'attic', name: '阁楼', description: '堆满旧地图和指南针的阁楼，罗盘向导正在整理他的收藏', connections: ['bar'] }
            ],
            currentLocation: 'bar',
            quests: [
                {
                    id: 'q_tutorial',
                    name: '学会冒险的基本功',
                    type: 'main',
                    description: '在老酒馆老板莫里斯的指导下，学会对话、群聊、计策、检定、地图这五项基本功。',
                    objectives: [
                        { text: '学会与角色对话', completed: false },
                        { text: '学会指定角色回复', completed: false },
                        { text: '制定一个计策', completed: false },
                        { text: '经历一次检定', completed: false },
                        { text: '使用地图移动', completed: false }
                    ],
                    status: 'active',
                    giver: '莫里斯',
                    reward: '出师证明，以及开启真正冒险的勇气'
                }
            ],
            openingNarrative: '*橡木桶酒馆的门铃叮当作响，温暖的灯光和烤面包的香气扑面而来。一位白发苍苍却精神矍铄的老汉站在吧台后，手里擦着一只木酒杯，看到你进门，眼睛立刻笑成了月牙。*\n\n"哎哟，新面孔！" *他把酒杯往吧台上一墩，从柜台后绕出来，热情地拍了拍你的肩膀* "欢迎欢迎！我是莫里斯，这酒馆的老板。看你这眼神，是头一回出门冒险吧？别紧张——先随便找个地方坐，咱们慢慢聊。"\n\n*他压低声音，凑近你的耳朵，露出一个调皮的笑容* "顺便说一句：我是这游戏的『教学向导』，会一步步教你咋玩。你要是嫌烦，随时能回大厅跳过。不过嘛……试试也不亏，对吧？"',
            dmPersona: {
                name: '莫里斯',
                emoji: '🍺',
                description: '一位亲切幽默的老酒馆老板，身兼新手教学向导。语气温暖、像老朋友，会主动打破第四面墙，明确告诉玩家"这是教学，我是在教你玩游戏"。绝不施加压力，绝不推进严肃剧情，把每个机制用最轻松的方式讲清楚。'
            },
            characters: [
                {
                    name: '莫里斯',
                    avatar: '🍺',
                    description: '橡木桶酒馆的老板，白发白须，围着一条洗得发白的围裙。他是这个世界的新手向导，热心、幽默、偶尔讲冷笑话。',
                    personality: '亲切、热情、幽默。说话像老朋友唠家常，偶尔会突然正经一秒然后自己先笑场。绝不给玩家压力，鼓励为主。',
                    first_mes: '*莫里斯从柜台后探出头，朝你招手* "嘿！新人，这边这边！" *他指了指吧台前的高脚凳* "坐下坐下。咱们先从最简单的开始——你看下面那个输入框了吗？想跟我说啥，直接打字，按回车或者点发送就行。来，随便跟我打个招呼试试？"\n\n*他眨眨眼* "对了，我是莫里斯，这酒馆的老板兼你的新手教练。有啥不懂的尽管问。"',
                    mes_example: '<START>\n{{user}}: 你好\n{{char}}: *莫里斯哈哈大笑，重重拍了一下吧台* "好好好！看，你已经在跟 NPC 对话了——这就是最基础的玩法。" *竖起一根手指* "记住：想说话，就打字；想说给谁听，就先点谁。简单吧？"\n{{user}}: 我不知道该干嘛\n{{char}}: *莫里斯递给你一杯热麦酒，语气柔和下来* "嘿，新手迷茫是正常的。我会一步一步教你。咱们慢慢来，先把基本功学会，后面想去哪儿冒险都行。"',
                    tags: ['教学', '酒馆老板', '新手向导'],
                    _emotionTags: ['热情', '欣慰', '调皮'],
                    _talkativeness: 0.8,
                    motives: ['教会玩家所有基础玩法'],
                    fears: ['玩家被复杂机制吓跑'],
                    secrets: ['他其实年轻时是个大冒险家，但从来不提'],
                    leverage: ['对酒馆的一切了如指掌']
                },
                {
                    name: '艾莉',
                    avatar: '🎵',
                    description: '一位年轻的吟游诗人，常坐在后院弹琴。她来酒馆是为了帮忙教学——专门教玩家认识"检定"。',
                    personality: '活泼、爱玩、对游戏规则特别着迷。喜欢用"掷骰子"比喻一切，会把检定讲得像小游戏。',
                    first_mes: '*后院的树下传来一阵轻快的鲁特琴声。一位扎着双马尾的年轻姑娘抬起头，朝你挥了挥拨片* "嗨！我是艾莉。听说你是来学冒险的？要不要跟我玩个掷骰子的小游戏？那可是冒险里最刺激的部分——叫做『检定』！"',
                    mes_example: '<START>\n{{user}}: 什么是检定？\n{{char}}: *艾莉跳起来，从口袋里掏出一颗大大的二十面骰* "就是这个！当你要做有风险的事——比如跳过悬崖、说服守卫、破解机关——系统会让你掷它，加你的属性值，跟一个难度值比。掷得够高就成功，不够就……嘿嘿，那就好玩了。"\n{{user}}: 听起来好难\n{{char}}: *拍拍你肩膀* "一点都不难！掷骰子嘛，全看运气和你的本事。来，试试说服我请你看场表演？我给你定个难度，你掷掷看！"',
                    tags: ['吟游诗人', '检定教学', '活泼'],
                    _emotionTags: ['兴奋', '鼓励', '好奇'],
                    _talkativeness: 0.7,
                    motives: ['教会玩家认识检定机制'],
                    fears: ['玩家觉得检定太复杂'],
                    secrets: ['她其实是某位大法师的女儿'],
                    leverage: ['对检定规则倒背如流']
                },
                {
                    name: '罗盘向导',
                    avatar: '🧭',
                    description: '住在阁楼的古怪老头，收藏着成堆的旧地图。他负责教玩家使用"地图移动"功能。',
                    personality: '絮叨、念旧、爱讲冷知识。一开口就停不下来，但讲地图时格外认真。',
                    first_mes: '*阁楼的门吱呀一开，扑面而来的是旧羊皮纸的味道。一个戴着单片眼镜的老头正趴在地图堆里，闻声抬起头* "哦？有人来了？我是罗盘向导，专门研究地图的。年轻人，你知道这个世界其实有好几个地方可以走吗？点开地图，想去哪儿就去哪儿——这可是冒险的基本功啊！"',
                    mes_example: '<START>\n{{user}}: 地图怎么用？\n{{char}}: *罗盘向导激动地展开一张酒馆平面图* "看！这就是『橡木桶』的地图。你现在的位置会有个标记。点别的房间名，你的角色就会走过去——就这么简单。试试点『后院』？"',
                    tags: ['地图教学', '絮叨', '念旧'],
                    _emotionTags: ['兴奋', '专注', '絮叨'],
                    _talkativeness: 0.5,
                    motives: ['教会玩家使用地图移动'],
                    fears: ['玩家迷路'],
                    secrets: ['他画过的地图能绕世界三圈'],
                    leverage: ['掌握所有地图情报']
                }
            ],
            lorebook: [
                { keys: ['橡木桶', '酒馆'], content: '橡木桶酒馆是一座温馨的小酒馆，专为新手冒险者准备。老板莫里斯是这里的教学向导，热心教导每一位新人。', comment: '教学场景', constant: true }
            ]
        };
    }
};

// ============================================================
// 4. 教学控制器（行为驱动推进 + 叙事触发）
// ============================================================
const Tutorial = {
    _stepTransitioning: false,  // 防止步骤推进重入

    /** 进入教学世界时调用，重置教学进度 */
    start() {
        TutorialState.reset();
        TutorialState.setStep(0);
        this._injectTutorialFlag();
        console.log('[Tutorial] 教学开始，步骤 0');
    },

    /** 给当前 scene 打上教学标记（用于 isCurrentScene 守卫） */
    _injectTutorialFlag() {
        const scene = State.scene;
        if (scene) {
            scene._isTutorial = true;
            scene.tutorialWorldId = TutorialWorld.id;
            State.saveCurrentScene().catch(e => console.warn('[Tutorial] 保存教学标记失败:', e));
        }
    },

    /**
     * 玩家消息后的行为驱动钩子。
     * 由 GroupChat.handleUserMessage 在玩家发消息后调用（仅在教学世界）。
     * 检测当前步骤是否完成，完成则推进并触发下一步教学叙事。
     */
    async afterPlayerMessage() {
        if (!TutorialWorld.isCurrentScene()) return;
        if (this._isBusy()) return;

        const step = TutorialState.getStep();
        const completed = this._checkStepComplete(step);

        if (completed) {
            await this._advanceStep(step);
        }
    },

    /**
     * 玩家切换角色后的钩子（用于 step1: 指定角色回复）。
     * 由角色选择 UI 调用。
     */
    async afterCharacterSwitch() {
        if (!TutorialWorld.isCurrentScene()) return;
        if (this._isBusy()) return;
        if (TutorialState.getStep() === 1) {
            await this._advanceStep(1);
        }
    },

    /**
     * 玩家进入计策模式后的钩子（用于 step2）。
     */
    async afterStrategyMode() {
        if (!TutorialWorld.isCurrentScene()) return;
        if (this._isBusy()) return;
        if (TutorialState.getStep() === 2) {
            await this._advanceStep(2);
        }
    },

    /**
     * 检定完成后的钩子（用于 step3）。
     */
    async afterCheckResolved() {
        if (!TutorialWorld.isCurrentScene()) return;
        if (this._isBusy()) return;
        if (TutorialState.getStep() === 3) {
            await this._advanceStep(3);
        }
    },

    /**
     * 地图移动后的钩子（用于 step4）。
     */
    async afterLocationMove() {
        if (!TutorialWorld.isCurrentScene()) return;
        if (this._isBusy()) return;
        if (TutorialState.getStep() === 4) {
            await this._advanceStep(4);
        }
    },

    /** 判断某步骤是否通过玩家行为完成 */
    _checkStepComplete(step) {
        const scene = State.scene;
        if (!scene) return false;

        switch (step) {
            case 0:
                // step0 完成条件：玩家发了至少 1 条 user 消息
                return scene.messages.some(m => m.role === 'user');
            case 1:
                // step1 完成条件：玩家主动切换过角色（由 afterCharacterSwitch 钩子推进，此处仅作兜底）
                // 兜底：检测最近 4 条消息里是否出现了对非默认角色的 user 对话
                return this._playerTalkedToNonDefaultChar();
            case 2:
                // step2 由 afterStrategyMode 推进
                return State.inputMode === 'strategy';
            case 3:
                // step3 由 afterCheckResolved 推进
                return false;
            case 4:
                // step4 由 afterLocationMove 推进
                return false;
            default:
                return false;
        }
    },

    _playerTalkedToNonDefaultChar() {
        // 兜底判定：存在指向非默认角色的 user 消息
        const scene = State.scene;
        const chars = State.activeCharacters;
        if (chars.length < 2) return false;
        const defaultCharId = chars[0].id;
        return scene.messages.some(m =>
            m.role === 'user' && m.characterId && m.characterId !== defaultCharId
        );
    },

    /** 教学是否正在推进/叙事输出中（防并发重入） */
    _isBusy() {
        return !!this._stepTransitioning;
    },

    /** 推进到下一步：标记完成 + 触发下一步教学叙事 */
    async _advanceStep(doneStep) {
        if (this._stepTransitioning) return;
        this._stepTransitioning = true;

        try {
            TutorialState.markStepDone(doneStep);
            const nextStep = TutorialState.getStep();
            this._markQuestObjective(doneStep);

            if (TutorialState.load().completed || nextStep >= TutorialScript.STEPS.length - 1) {
                // 全部完成（nextStep 到达毕业步骤索引）
                this._markQuestObjective(TutorialScript.STEPS.length - 2);  // 最后一条有效目标索引
                await this.narrateStep(TutorialScript.STEPS.length - 1);  // 毕业叙事
                TutorialState.markCompleted();
                this._showSkipButton(false);
                return;
            }

            // 触发下一步教学叙事
            await this.narrateStep(nextStep);
        } finally {
            this._stepTransitioning = false;
        }
    },

    /** 同步勾选教学任务目标 */
    _markQuestObjective(stepIdx) {
        const scene = State.scene;
        if (!scene || !scene.quests) return;
        const q = scene.quests.find(qq => qq.id === 'q_tutorial');
        if (!q || !q.objectives[stepIdx]) return;
        if (!q.objectives[stepIdx].completed) {
            q.objectives[stepIdx].completed = true;
            State.saveCurrentSceneDebounced();
            if (typeof QuestTracker !== 'undefined' && QuestTracker.render) QuestTracker.render();
            if (typeof SidebarRight !== 'undefined' && SidebarRight.renderQuests) SidebarRight.renderQuests();
        }
    },

    /**
     * 触发某一步的教学叙事（复用 _dmNarrate 通道，用教学专用 prompt）。
     */
    async narrateStep(step) {
        if (typeof GroupChat === 'undefined' || typeof PromptBuilder === 'undefined') {
            console.warn('[Tutorial] GroupChat/PromptBuilder 未就绪，跳过叙事');
            return;
        }
        // 主路径：教学专用 prompt
        if (typeof PromptBuilder.buildTutorialNarration === 'function') {
            await GroupChat._dmNarrate({ trigger: 'tutorial', tutorialStep: step });
        } else {
            // 降级：回退到普通 DM 叙事 + 本地提示，避免玩家卡住
            console.warn('[Tutorial] buildTutorialNarration 缺失，降级为普通 DM 叙事');
            const stepData = TutorialScript.getStep(step);
            if (stepData) showToast(`教学 · ${stepData.title}：${stepData.goal}`);
            await GroupChat._dmNarrate({ trigger: 'event', focus: stepData ? stepData.cue : '' });
        }
    },

    // ===== 跳过按钮（顶栏）=====

    /** 显示/隐藏教学世界的"跳过教学"按钮 */
    _showSkipButton(show) {
        let btn = document.getElementById('tutorialSkipBtn');
        if (!show) {
            if (btn) btn.remove();
            return;
        }
        if (btn) return;
        const topRight = document.querySelector('.top-bar-right');
        if (!topRight) return;
        btn = document.createElement('button');
        btn.id = 'tutorialSkipBtn';
        btn.className = 'tutorial-skip-btn';
        btn.innerHTML = '🚪 跳过教学';
        btn.title = '完成教学并返回大厅';
        btn.onclick = async () => {
            btn.disabled = true;
            try { await this.confirmSkip(); }
            finally { btn.disabled = false; }
        };
        topRight.insertBefore(btn, topRight.firstChild);
    },

    async confirmSkip() {
        if (!confirm('确定跳过教学吗？你可以随时从大厅重新进入新手酒馆复习。')) return;
        TutorialState.markCompleted();
        this._showSkipButton(false);
        if (typeof WorldPicker !== 'undefined' && WorldPicker.returnToHall) {
            await WorldPicker.returnToHall();
        }
        showToast('教学已跳过，欢迎随时回来复习');
    },

    /** 教学世界场景切换后调用，显示跳过按钮 */
    onSceneActive() {
        if (TutorialWorld.isCurrentScene() && TutorialState.isNeeded()) {
            this._injectTutorialFlag();
            this._showSkipButton(true);
        }
    }
};
