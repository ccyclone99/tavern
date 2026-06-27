/**
 * 通关记录 / 冒险回顾
 * 在胜利或失败结局出现时，把当前场景整理成玩家可回看的结构化记录。
 */
const RunRecorder = {
    version: 10,

    ensure(scene) {
        if (!scene) return scene;
        if (!Array.isArray(scene.runHistory)) scene.runHistory = [];
        if (!Array.isArray(scene.transcriptLog)) scene.transcriptLog = [];
        if (scene.runRecord && typeof scene.runRecord !== 'object') scene.runRecord = null;
        return scene;
    },

    archiveMessages(scene, messages = []) {
        if (!scene || !Array.isArray(messages) || messages.length === 0) return [];
        this.ensure(scene);
        const existingKeys = new Set(scene.transcriptLog.map(entry => this._transcriptKey(entry)));
        const start = scene.transcriptLog.length;
        const entries = messages
            .map((message, idx) => this._messageToTranscriptEntry(scene, message, start + idx + 1))
            .map(entry => entry ? { ...entry, archived: true, archivedAt: Date.now() } : null)
            .filter(Boolean)
            .filter(entry => {
                const key = this._transcriptKey(entry);
                if (existingKeys.has(key)) return false;
                existingKeys.add(key);
                return true;
            });
        if (entries.length > 0) {
            scene.transcriptLog.push(...entries);
        }
        return entries;
    },

    complete(scene, outcome = scene?.gameState || 'stopped', reason = '') {
        if (!scene) return null;
        this.ensure(scene);
        if (scene.runRecord && scene.runRecord.outcome === outcome && scene.runRecord.version === this.version) {
            return scene.runRecord;
        }

        const record = this.build(scene, outcome, reason);
        scene.runRecord = record;
        scene.runHistory = [
            ...scene.runHistory.filter(r => r && r.id !== record.id),
            record
        ].slice(-12);
        return record;
    },

    build(scene, outcome = 'stopped', reason = '') {
        const endingMessage = this._latestEndingMessage(scene);
        const completedAt = Date.now();
        const startedAt = scene.createdAt || scene.messages?.[0]?.timestamp || completedAt;
        const keyMoments = this._buildKeyMoments(scene);
        const transcript = this._buildTranscript(scene);
        const quests = (scene.quests || []).map(q => ({
            id: q.id || '',
            name: q.name || '任务',
            type: q.type || 'side',
            status: q.status || 'active',
            completed: (q.objectives || []).filter(o => o.completed).length,
            total: (q.objectives || []).length
        })).slice(0, 12);
        const discoveries = (scene.knowledge?.discoveries || []).slice(-12).map(d => ({
            title: d.title || d.text || '线索',
            text: d.text || d.title || '',
            source: d.source || '',
            level: d.level || 'hint',
            reliability: d.reliability || 'unverified'
        }));
        const visibleClocks = (scene.clocks || [])
            .filter(c => c.visibility !== 'hidden')
            .map(c => ({
                name: c.name || '局势时钟',
                value: Number(c.value || 0),
                max: Number(c.max || 0)
            }))
            .slice(0, 8);
        const failedState = scene.defeatReason
            ? (scene.failureStates || []).find(f => f.id === scene.defeatReason)
            : null;
        const challenges = (scene.sceneChallenges || []).map(c => ({
            id: c.id || '',
            phaseId: c.phaseId || '',
            title: c.title || '挑战',
            status: c.status || 'locked',
            progress: Number(c.progress || 0),
            targetProgress: Number(c.targetProgress || 0),
            strain: Number(c.strain || 0),
            maxStrain: Number(c.maxStrain || 0),
            checkCount: Number(c.checkCount || 0),
            supports: (c.supports || []).slice(0, 8)
        })).slice(0, 12);
        const evidence = (scene.evidenceLedger || [])
            .filter(e => e.visible !== false)
            .map(e => ({
                id: e.id || '',
                title: e.title || '证据',
                reliability: e.reliability || 'partial',
                tags: (e.tags || []).slice(0, 8),
                supports: (e.supports || []).slice(0, 8)
            }))
            .slice(-12);
        const checks = transcript
            .filter(entry => entry.type === 'check' && entry.check)
            .map(entry => ({
                statName: entry.check.statName || '属性',
                total: Number(entry.check.total || 0),
                dc: Number(entry.check.dc || 0),
                outcome: entry.check.outcome || '',
                intent: entry.check.intent || '',
                challengeTitle: entry.check.challengeTitle || '',
                secondaryResults: (entry.check.secondaryResults || []).slice(0, 4)
            }))
            .slice(-12);
        const phaseSummaries = this._buildPhaseSummaries(scene, challenges, evidence, checks, transcript);

        return {
            id: 'run_' + completedAt + '_' + Math.random().toString(36).slice(2, 6),
            version: this.version,
            sceneId: scene.id || '',
            sceneName: scene.name || '未命名世界',
            title: this._title(scene, outcome, failedState),
            outcome,
            reason: String(reason || failedState?.title || '').slice(0, 160),
            completedAt,
            startedAt,
            turns: Number(scene.turnCount || 0),
            player: {
                name: scene.playerPersona?.name || scene.userName || '旅人',
                level: Number(scene.level || 1),
                hp: Number(scene.playerHp || 0),
                maxHp: Number(scene.playerMaxHp || 0),
                gold: Number(scene.gold || 0)
            },
            ending: endingMessage,
            summary: this._summary(scene, endingMessage, keyMoments, phaseSummaries),
            phaseSummaries,
            keyMoments,
            transcript,
            transcriptCount: transcript.length,
            quests,
            discoveries,
            challenges,
            evidence,
            checks,
            clocks: visibleClocks,
            createdAt: completedAt
        };
    },

    _title(scene, outcome, failedState) {
        if (outcome === 'victorious') return `${scene.name || '冒险'}：通关`;
        if (failedState?.title) return `${scene.name || '冒险'}：${failedState.title}`;
        if (outcome === 'defeated') return `${scene.name || '冒险'}：失败结局`;
        return `${scene.name || '冒险'}：记录`;
    },

    _latestEndingMessage(scene) {
        const msg = [...(scene.messages || [])].reverse().find(m => m.type === 'victory' || m.type === 'gameover');
        return this._clean(msg?.content || '').slice(0, 900);
    },

    _summary(scene, endingMessage, keyMoments, phaseSummaries = []) {
        const phaseText = (phaseSummaries || [])
            .map(p => p.summary)
            .filter(Boolean)
            .slice(0, 4);
        if (phaseText.length > 0) return phaseText.join(' ').slice(0, 1200);

        const narrative = keyMoments
            .filter(m => ['玩家行动', '剧情推进', '角色回应'].includes(m.title))
            .slice(-4)
            .map(m => m.text);
        const system = keyMoments
            .filter(m => m.title === '系统变化' && /任务进展|任务完成|获得奖励/.test(m.text))
            .slice(-3)
            .map(m => m.text);
        const parts = this._dedupeTexts([...narrative, ...system]);
        if (parts.length > 0) return parts.join(' ').slice(0, 1200);
        return (this._clean(scene.summary || '') || endingMessage).slice(0, 1200);
    },

    _buildPhaseSummaries(scene, challenges = [], evidence = [], checks = [], transcript = []) {
        const phases = Array.isArray(scene?.storyPhases) ? scene.storyPhases : [];
        if (phases.length === 0) return [];
        const mainQuest = (scene.quests || []).find(q => q.type === 'main');
        return phases.map(phase => {
            const phaseChallenges = challenges.filter(c => c.phaseId === phase.id);
            const challengeIds = new Set(phaseChallenges.map(c => c.id).filter(Boolean));
            const challengeTitles = new Set(phaseChallenges.map(c => c.title).filter(Boolean));
            const phaseChecks = checks.filter(check => challengeTitles.has(check.challengeTitle));
            const phaseEvidence = evidence.filter(ev =>
                (ev.supports || []).some(item => challengeIds.has(item))
            );
            const objectiveTargets = new Set(
                phaseChallenges.flatMap(c => c.supports || []).filter(s => /^q_main:\d+$/.test(String(s)))
            );
            const completedObjectives = (mainQuest?.objectives || [])
                .map((objective, idx) => ({ text: objective.text || '', completed: !!objective.completed, target: `q_main:${idx + 1}` }))
                .filter(item => item.completed && objectiveTargets.has(item.target))
                .map(item => item.text)
                .slice(0, 4);
            const excerpts = this._buildPhaseExcerpts(phase, phaseChallenges, phaseEvidence, completedObjectives, transcript);
            const done = phaseChallenges.filter(c => c.status === 'completed').length;
            const total = phaseChallenges.length;
            const evidenceTitles = phaseEvidence.map(e => e.title || '证据').slice(0, 3);
            const checkText = phaseChecks.length ? `${phaseChecks.length}次检定` : '未发生检定';
            const progressText = total ? `${done}/${total}个挑战完成` : `阶段${phase.status || 'active'}`;
            const summary = [
                `${phase.title || '剧情阶段'}：${progressText}，${checkText}`,
                evidenceTitles.length ? `关键证据：${evidenceTitles.join('、')}` : '',
                completedObjectives.length ? `完成目标：${completedObjectives.join('、')}` : ''
            ].filter(Boolean).join('。');
            return {
                id: phase.id || '',
                title: phase.title || '剧情阶段',
                status: phase.status || 'active',
                summary,
                challenges: phaseChallenges.map(c => ({
                    title: c.title || '挑战',
                    status: c.status || '',
                    progress: Number(c.progress || 0),
                    targetProgress: Number(c.targetProgress || 0)
                })).slice(0, 6),
                evidence: evidenceTitles,
                checkCount: phaseChecks.length,
                completedObjectives,
                excerpts,
                excerptCount: excerpts.length
            };
        }).filter(p => p.summary);
    },

    _buildPhaseExcerpts(phase, phaseChallenges = [], phaseEvidence = [], completedObjectives = [], transcript = []) {
        if (!Array.isArray(transcript) || transcript.length === 0) return [];
        const challengeTitles = new Set(phaseChallenges.map(c => c.title).filter(Boolean));
        const rawTerms = [
            phase?.title,
            phase?.goal,
            phase?.stakes,
            ...(phaseChallenges || []).flatMap(c => [c.title, ...(c.supports || [])]),
            ...(phaseEvidence || []).map(e => e.title),
            ...(completedObjectives || [])
        ];
        const terms = [...new Set(rawTerms.flatMap(value => this._phaseMatchTerms(value)))].slice(0, 80);
        if (terms.length === 0 && challengeTitles.size === 0) return [];

        const indexes = new Set();
        transcript.forEach((entry, idx) => {
            if (!this._entryMatchesPhase(entry, terms, challengeTitles)) return;
            [idx - 1, idx, idx + 1].forEach(pos => {
                if (pos >= 0 && pos < transcript.length) indexes.add(pos);
            });
        });

        return [...indexes]
            .sort((a, b) => a - b)
            .map(pos => this._transcriptEntryToExcerpt(transcript[pos]))
            .filter(Boolean)
            .filter(excerpt => !this._isLowSignalMoment(excerpt.text))
            .slice(0, 6);
    },

    _entryMatchesPhase(entry, terms = [], challengeTitles = new Set()) {
        if (!entry) return false;
        if (entry.check?.challengeTitle && challengeTitles.has(entry.check.challengeTitle)) return true;
        const text = this._phaseTerm([
            entry.speaker,
            entry.text,
            entry.check?.intent,
            entry.check?.challengeTitle
        ].filter(Boolean).join(' '));
        if (!text) return false;
        return terms.some(term => term && (text.includes(term) || (term.length >= 6 && term.includes(text))));
    },

    _transcriptEntryToExcerpt(entry) {
        if (!entry) return null;
        const text = this._clipText(entry.text || '', 180);
        if (!text) return null;
        return {
            index: Number(entry.index || 0),
            speaker: entry.speaker || '记录',
            type: entry.type || 'message',
            text,
            timestamp: entry.timestamp || 0,
            check: entry.check ? {
                statName: entry.check.statName || '检定',
                total: Number(entry.check.total || 0),
                dc: Number(entry.check.dc || 0),
                outcome: entry.check.outcome || '',
                intent: entry.check.intent || '',
                challengeTitle: entry.check.challengeTitle || ''
            } : null
        };
    },

    _phaseMatchTerms(value) {
        const term = this._phaseTerm(value);
        if (!term) return [];
        const terms = new Set([term]);
        const chunks = String(value || '').match(/[a-z0-9_]{3,}|[\u4e00-\u9fff]{2,}/gi) || [];
        chunks.forEach(chunk => {
            const clean = this._phaseTerm(chunk);
            if (clean.length >= 2) terms.add(clean);
            if (/^[\u4e00-\u9fff]+$/.test(clean) && clean.length > 4) {
                for (let i = 0; i < clean.length - 1; i += 2) {
                    const part = clean.slice(i, i + 2);
                    if (part.length >= 2) terms.add(part);
                }
            }
        });
        return [...terms].filter(item => item.length >= 2);
    },

    _phaseTerm(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[：:，,。；;！？!?.、（）()[\]【】"'“”‘’<>《》]/g, '')
            .trim();
    },

    _buildKeyMoments(scene) {
        const interesting = new Set(['action', 'strategy', 'check', 'system', 'narrate', 'talk', 'gameover', 'victory']);
        const seen = new Set();
        return (scene.messages || [])
            .filter(m => interesting.has(m.type) && this._clean(m.content).length > 0)
            .map(m => ({
                type: m.type || 'message',
                title: this._momentTitle(m),
                text: this._clipText(m.content, 220),
                timestamp: m.timestamp || 0
            }))
            .filter(m => {
                if (this._isLowSignalMoment(m.text)) return false;
                const key = m.text.slice(0, 120);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(-14);
    },

    _buildTranscript(scene) {
        const archived = Array.isArray(scene?.transcriptLog) ? scene.transcriptLog : [];
        const archivedKeys = new Set(archived.map(entry => this._transcriptKey(entry)));
        const liveOffset = archived.length;
        const live = (scene.messages || [])
            .map((message, idx) => this._messageToTranscriptEntry(scene, message, liveOffset + idx + 1))
            .filter(Boolean)
            .filter(entry => !archivedKeys.has(this._transcriptKey(entry)));
        const summaryFallback = scene.summary && archived.length === 0
            ? [{
                index: 0,
                id: 'summary_fallback',
                role: 'system',
                type: 'summary',
                speaker: '先前剧情摘要',
                text: this._clean(scene.summary),
                timestamp: scene.createdAt || 0,
                check: null,
                archived: true,
                summaryFallback: true
            }]
            : [];
        return [...summaryFallback, ...archived, ...live];
    },

    _messageToTranscriptEntry(scene, message, index = 0) {
        if (!message) return null;
        const playerName = scene?.playerPersona?.name || scene?.userName || '玩家';
        const characterName = id => {
            if (!id || typeof State === 'undefined' || !Array.isArray(State.characters)) return '';
            return State.characters.find(c => c && c.id === id)?.name || '';
        };
        const text = this._clean(message.content || '');
        if (!text) return null;
        const check = message.checkData || null;
        const speakerSnapshot = String(message.characterName || message.speakerName || '').trim();
        const speaker = message.role === 'user'
            ? playerName
            : (message.role === 'assistant' ? (speakerSnapshot || characterName(message.characterId) || '主持人') : this._momentTitle(message));
        return {
            index,
            id: message.id || '',
            role: message.role || '',
            type: message.type || 'message',
            characterId: message.characterId || '',
            speaker,
            text,
            timestamp: message.timestamp || 0,
            check: check ? {
                statName: check.statName || '属性',
                total: Number(check.total || 0),
                dc: Number(check.dc || 0),
                outcome: check.resultLabel || check.outcome || '',
                intent: check.intent || '',
                challengeTitle: check.challengeContext?.challengeTitle || '',
                secondaryResults: (check.secondaryResults || []).slice(0, 4).map(item => ({
                    label: item.label || '',
                    outcome: item.outcome || '',
                    progressDelta: Number(item.progressDelta || 0),
                    strainDelta: Number(item.strainDelta || 0),
                    appliedEffects: item.appliedEffects === true
                }))
            } : null,
            archived: false
        };
    },

    _transcriptKey(entry) {
        if (!entry) return '';
        if (entry.id) return `id:${entry.id}`;
        return `${entry.timestamp || 0}|${entry.role || ''}|${entry.type || ''}|${String(entry.text || '').slice(0, 120)}`;
    },

    _momentTitle(msg) {
        const labels = {
            action: '玩家行动',
            strategy: '计策',
            check: '检定',
            system: '系统变化',
            narrate: '剧情推进',
            talk: '角色回应',
            gameover: '失败结局',
            victory: '通关'
        };
        return labels[msg.type] || '事件';
    },

    _isLowSignalMoment(text) {
        return /^获得 \d+ 金币/.test(text) ||
            /^获得 \d+ 经验/.test(text) ||
            /^.+好感\s*[↑↓]/.test(text);
    },

    _dedupeTexts(items) {
        const seen = new Set();
        return items
            .map(item => this._clean(item))
            .filter(Boolean)
            .filter(text => {
                const key = text.slice(0, 120);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    },

    _clipText(text, max = 220) {
        const clean = this._clean(text);
        if (clean.length <= max) return clean;
        const head = clean.slice(0, max);
        const cut = Math.max(
            head.lastIndexOf('。'),
            head.lastIndexOf('！'),
            head.lastIndexOf('？'),
            head.lastIndexOf('；'),
            head.lastIndexOf(';')
        );
        if (cut >= 80) return head.slice(0, cut + 1);
        return head.slice(0, Math.max(0, max - 3)) + '...';
    },

    _clean(text) {
        return String(text || '')
            .replace(/<state_update>[\s\S]*?<\/state_update>/g, '')
            .replace(/\[(check|damage|heal|gold|exp|quest|quest_update|event|move|item_add):[^\]]+\]/g, '')
            .replace(/\*/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
};
