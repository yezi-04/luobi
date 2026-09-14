/*
 * memory.js — 落笔 长期记忆库 v2
 * 六区结构 + 三级实体识别 + 按需注入
 */

// ============ 基础读写 ============
function getMemory() { return DataCore.getMemory(); }
async function saveMemory(memory) { await DataCore.setMemory(memory); }

// ============ 实体索引重建 ============
/**
 * 重建实体索引表
 * key 用 "type:id" 唯一，value 存 name 和 aliases 供匹配
 */
function rebuildEntityIndex(memory) {
    const index = {};

    // 角色
    Object.entries(memory.characterProfiles || {}).forEach(([id, profile]) => {
        if (!profile.name) return;
        index[`character:${id}`] = {
            id: id,
            type: 'character',
            name: profile.name,
            aliases: profile.aliases || []
        };
    });

    // 地点
    Object.entries(memory.locations || {}).forEach(([id, loc]) => {
        if (!loc.name) return;
        index[`location:${id}`] = {
            id: id,
            type: 'location',
            name: loc.name,
            aliases: loc.aliases || []
        };
    });

    // 伏笔
    Object.entries(memory.foreshadowDetails || {}).forEach(([id, fs]) => {
        if (!fs.title) return;
        index[`foreshadow:${id}`] = {
            id: id,
            type: 'foreshadow',
            name: fs.title,
            aliases: []
        };
    });

    memory.entityIndex = index;
}

// ============ 章节基线 ============
/**
 * 获取当前写作基线章节索引
 * 基线 = max(最新定稿章节索引, 当前草稿章节索引 - 1)
 * @returns {number} 章节索引（从0开始），无当前章节时返回 -1
 */
function getCurrentChapterIndex() {
    const toc = DataCore.getToc();
    const chapterOrder = flattenChapters(toc);
    if (chapterOrder.length === 0) return -1;

    const currentId = DataCore.getCurrentChapterId();
    const currentDraftIndex = chapterOrder.findIndex(c => c.id === currentId);

    let latestFinalizedIndex = -1;
    chapterOrder.forEach((c, idx) => {
        const fData = DataCore.getFinalizeData(c.id);
        if (fData && fData.state === 'finalized') {
            latestFinalizedIndex = Math.max(latestFinalizedIndex, idx);
        }
    });

    return Math.max(
        latestFinalizedIndex,
        currentDraftIndex >= 0 ? currentDraftIndex - 1 : -1
    );
}

// ============ 伏笔状态计算 ============
function computeForeshadowStatus(fs, currentIdx, chapterOrder) {
    if (fs.status === 'resolved' || fs.status === 'abandoned') return fs.status;

    if (!fs.plannedResolutionChapterId || currentIdx < 0) {
        return fs.status;
    }

    const plannedIdx = chapterOrder.findIndex(c => c.id === fs.plannedResolutionChapterId);
    if (plannedIdx < 0) return fs.status;

    if (currentIdx > plannedIdx) {
        const overdueBy = currentIdx - plannedIdx;
        if (overdueBy >= 4) return 'overdue-severe';
        if (overdueBy >= 2) return 'overdue-moderate';
        return 'overdue-mild';
    }

    return fs.status;
}

function isNearResolution(fs, currentIdx, chapterOrder) {
    if (!fs.plannedResolutionChapterId || currentIdx < 0) return false;
    const plannedIdx = chapterOrder.findIndex(c => c.id === fs.plannedResolutionChapterId);
    if (plannedIdx < 0) return false;
    return (plannedIdx - currentIdx) <= 1;
}

function buildOpenForeshadows(memory, currentIdx, chapterOrder) {
    return Object.values(memory.foreshadowDetails || {})
        .filter(fs => fs.status === 'planted' || fs.status === 'hinted')
        .map(fs => {
            const derived = computeForeshadowStatus(fs, currentIdx, chapterOrder);
            return { ...fs, derivedStatus: derived };
        })
        .filter(fs =>
            fs.status === 'hinted' ||
            fs.layer === 'main' ||
            fs.derivedStatus.startsWith('overdue') ||
            isNearResolution(fs, currentIdx, chapterOrder)
        )
        .map(fs => ({
            id: fs.id,
            title: fs.title,
            plantedChapter: fs.plantedChapter,
            layer: fs.layer,
            derivedStatus: fs.derivedStatus
        }));
}

// ============ 第一层：常驻注入 ============
function getAnchorContext(memory, currentIdx, chapterOrder) {
    // 无基线：只注入锚点中的目标，跳过伏笔计算
    if (currentIdx < 0) {
        let ctx = '';
        if (memory.anchor.currentChapterGoal) {
            ctx += `【当前章节目标】${memory.anchor.currentChapterGoal}\n`;
        }
        const activeIds = memory.anchor.involvedCharacterIds || [];
        if (activeIds.length > 0) {
            ctx += '【相关角色状态】\n';
            activeIds.forEach(id => {
                const profile = memory.characterProfiles[id];
                const state = memory.activeStates[id];
                if (profile && state) {
                    ctx += `- ${profile.name}：${state.status || '正常'}，位于${state.position || '未知'}\n`;
                }
            });
        }
        return ctx || '【提示】尚未创建任何章节。';
    }

    // 有基线
    let ctx = '';

    if (memory.anchor.currentChapterGoal) {
        ctx += `【当前章节目标】${memory.anchor.currentChapterGoal}\n`;
    }

    const activeIds = memory.anchor.involvedCharacterIds || [];
    if (activeIds.length > 0) {
        ctx += '【相关角色状态】\n';
        activeIds.forEach(id => {
            const profile = memory.characterProfiles[id];
            const state = memory.activeStates[id];
            if (profile && state) {
                ctx += `- ${profile.name}：${state.status || '正常'}，位于${state.position || '未知'}\n`;
            }
        });
    }

    const openFs = buildOpenForeshadows(memory, currentIdx, chapterOrder);
    if (openFs.length > 0) {
        ctx += '【未回收伏笔】\n';
        openFs.forEach(f => {
            ctx += `- [${f.plantedChapter}] ${f.title}（${f.layer}｜${f.derivedStatus}）\n`;
        });
    }

    return ctx;
}

// ============ 实体识别（第一级） ============
function resolveEntities(userInput, memory) {
    const index = memory.entityIndex || {};
    const matched = [];

    Object.values(index).forEach(entry => {
        if (entry.name && userInput.includes(entry.name)) {
            matched.push({ id: entry.id, type: entry.type });
        }
        (entry.aliases || []).forEach(alias => {
            if (userInput.includes(alias)) {
                matched.push({ id: entry.id, type: entry.type });
            }
        });
    });

    // 去重
    const seen = new Set();
    return matched.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });
}

// ============ 第二层：按需注入 ============
function getEntityContext(entities, memory) {
    let ctx = '';

    entities.forEach(({ id, type }) => {
        if (type === 'character') {
            const profile = memory.characterProfiles[id];
            const state = memory.activeStates[id];
            if (profile) {
                ctx += `【角色档案：${profile.name}】\n`;
                ctx += `性格：${profile.personality || '未填写'}\n`;
                ctx += `动机：${profile.motivation || '未填写'}\n`;
                if (state) {
                    ctx += `当前状态：${state.status || '正常'}，位于${state.position || '未知'}\n`;
                }
            }
        } else if (type === 'location') {
            const loc = memory.locations[id];
            if (loc) {
                ctx += `【地点：${loc.name}】${loc.description || ''}\n`;
            }
        } else if (type === 'foreshadow') {
            const fs = memory.foreshadowDetails[id];
            if (fs) {
                ctx += `【伏笔：${fs.title}】${fs.fullDescription}\n`;
            }
        }
    });

    return ctx;
}

function getRelationshipContext(charIds, memory) {
    if (charIds.length < 2) return '';
    let ctx = '';
    const pairs = [];

    for (let i = 0; i < charIds.length; i++) {
        for (let j = i + 1; j < charIds.length; j++) {
            const a = memory.characterProfiles[charIds[i]];
            const b = memory.characterProfiles[charIds[j]];
            if (!a || !b) continue;

            const relAB = (a.relationships || []).find(r => r.target === charIds[j]);
            const relBA = (b.relationships || []).find(r => r.target === charIds[i]);
            const rel = relAB || relBA;

            if (rel) {
                pairs.push(`- ${a.name} 与 ${b.name}：${rel.type}`);
            }
        }
    }

    if (pairs.length > 0) {
        ctx = '【角色关系】\n' + pairs.join('\n') + '\n';
    }
    return ctx;
}

// ============ 第二级：规则层 ============
function matchByRules(userInput) {
    const rules = [
        { keywords: ['节奏', '拖沓', '快慢', '读起来', '流畅'], type: 'chapterArchive' },
        { keywords: ['伏笔', '坑', '回收', '埋'], type: 'foreshadowOverview' },
        { keywords: ['整体', '全书', '结构', '主线', '大纲'], type: 'globalSummary' },
        { keywords: ['他', '她', '他们', '它', '那个'], type: 'pronoun' }
    ];

    const matched = [];
    rules.forEach(rule => {
        if (rule.keywords.some(kw => userInput.includes(kw))) {
            matched.push(rule.type);
        }
    });
    return matched;
}

function getRuleContext(types, memory, currentIdx, chapterOrder) {
    let ctx = '';

    types.forEach(type => {
        if (type === 'chapterArchive') {
            if (currentIdx >= 0) {
                const recentChapters = chapterOrder.slice(Math.max(0, currentIdx - 2), currentIdx + 1);
                if (recentChapters.length > 0) {
                    ctx += '【最近章节节奏】\n';
                    recentChapters.forEach(ch => {
                        const archive = memory.chapterArchives[ch.id];
                        if (archive) {
                            ctx += `- ${ch.title}：${archive.tone || '未标注'}，${archive.goal || ''}\n`;
                        }
                    });
                }
            }
        } else if (type === 'foreshadowOverview') {
            const openFs = Object.values(memory.foreshadowDetails || {})
                .filter(fs => fs.status === 'planted' || fs.status === 'hinted');
            if (openFs.length > 0) {
                ctx += '【伏笔总览】\n';
                openFs.forEach(fs => {
                    ctx += `- ${fs.title}（${fs.layer}）：${fs.fullDescription}\n`;
                });
            }
        } else if (type === 'globalSummary') {
            if (memory.globalSummary) {
                ctx += `【全书摘要】\n${memory.globalSummary}\n`;
            }
        } else if (type === 'pronoun') {
            const recentCharIds = memory.anchor.involvedCharacterIds || [];
            if (recentCharIds.length > 0) {
                const names = recentCharIds.map(id => memory.characterProfiles[id]?.name).filter(Boolean);
                if (names.length > 0) {
                    ctx += `【最近对话涉及角色】${names.join('、')}\n`;
                }
            }
        }
    });

    return ctx;
}

// ============ 第三级：LLM 兜底 ============
async function classifyByLLM(userInput) {
    const apiKey = DataCore.getApiKey();
    if (!apiKey) return { types: [], confidence: 0 };

    const prompt = `请判断以下问题最可能涉及哪些数据类别。
可选类别：
- character（角色档案/状态）
- location（地点）
- foreshadow（伏笔）
- chapter（章节节奏/档案）
- world（世界观/主线）

严格按 JSON 返回：{"types": ["..."], "confidence": 0.0-1.0}
confidence 表示你对判断的确信程度。

问题：${userInput}`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                max_tokens: 100,
                temperature: 0.1
            })
        });
        const data = await response.json();
        const text = data.choices[0].message.content;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return { types: [], confidence: 0 };
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            types: Array.isArray(parsed.types) ? parsed.types : [],
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0
        };
    } catch (e) {
        return { types: [], confidence: 0 };
    }
}

function getTypeContext(types, memory, currentIdx, chapterOrder) {
    let ctx = '';

    types.forEach(type => {
        if (type === 'character') {
            Object.entries(memory.characterProfiles || {}).forEach(([id, profile]) => {
                const state = memory.activeStates[id];
                ctx += `【${profile.name}】${profile.personality || ''}`;
                if (state) ctx += ` | 状态：${state.status || '正常'}，位置：${state.position || '未知'}`;
                ctx += '\n';
            });
        } else if (type === 'location') {
            Object.entries(memory.locations || {}).forEach(([id, loc]) => {
                ctx += `【${loc.name}】${loc.description || ''}\n`;
            });
        } else if (type === 'foreshadow') {
            ctx += getRuleContext(['foreshadowOverview'], memory, currentIdx, chapterOrder);
        } else if (type === 'chapter') {
            ctx += getRuleContext(['chapterArchive'], memory, currentIdx, chapterOrder);
        } else if (type === 'world') {
            if (memory.globalSummary) ctx += `【全书摘要】${memory.globalSummary}\n`;
        }
    });

    return ctx;
}

// ============ 总入口 ============
async function getMemoryContext(userInput) {
    const memory = await DataCore.getMemory();
    if (!memory || !memory.version) return { context: '', hint: '' };

    const chapterOrder = flattenChapters(DataCore.getToc());
    const currentIdx = getCurrentChapterIndex();

    // 纯展开指令：只有整个输入就是指令时才走展开路径
    if (userInput && /^(展开|继续|详细说|展开看看|详细说说)[。！？\s]*$/.test(userInput.trim())) {
        const lastHint = window._lastMemoryHint;
        if (lastHint && Date.now() - lastHint.timestamp < 5 * 60 * 1000) {
            const context = getTypeContext(lastHint.types, memory, currentIdx, chapterOrder);
            window._lastMemoryHint = null;
            return { context, hint: '' };
        }
    }

    let context = '';
    let hint = '';

    // 第一层：常驻
    context += getAnchorContext(memory, currentIdx, chapterOrder);

    if (userInput) {
        // 第一级：精确匹配
        const entities = resolveEntities(userInput, memory);
        if (entities.length > 0) {
            context += '\n' + getEntityContext(entities, memory);
            const charIds = entities.filter(e => e.type === 'character').map(e => e.id);
            context += getRelationshipContext(charIds, memory);
            return { context, hint };
        }

        // 第二级：规则层
        const ruleTypes = matchByRules(userInput);
        if (ruleTypes.length > 0) {
            context += '\n' + getRuleContext(ruleTypes, memory, currentIdx, chapterOrder);
            return { context, hint };
        }

        // 第三级：LLM 兜底
        if (userInput.length > 15) {
            const result = await classifyByLLM(userInput);
            if (result.confidence >= 0.7) {
                context += '\n' + getTypeContext(result.types, memory, currentIdx, chapterOrder);
            } else if (result.confidence >= 0.4) {
                hint = `（我猜你可能想了解${result.types.join('、')}相关内容，如果需要展开请回复"展开"。）`;
                window._lastMemoryHint = { types: result.types, timestamp: Date.now() };
            }
        }
    }

    return { context, hint };
}

// ============ 记忆库提取（定稿后调用） ============
async function extractToMemory() {
    const id = DataCore.getCurrentChapterId();
    if (!id) return;
    const content = DataCore.getChapterContent(id) || '';
    if (!content.trim()) return;

    const chapterTitle = findNode(id)?.title || '未知章节';
    const apiKey = DataCore.getApiKey();
    if (!apiKey) return;

    const systemPrompt = `你是一个专业的文学记忆库提取器。请根据本章正文，提取以下结构化信息。严格按 JSON 格式输出，不要其他内容：

{
  "characters": {
    "角色名": {
      "status": "当前身体状态",
      "position": "当前位置"
    }
  },
  "foreshadows": [
    {
      "description": "新埋下的伏笔（30字以内）",
      "status": "open"
    }
  ],
  "resolvedForeshadows": [
    {
      "description": "本章回收的伏笔描述"
    }
  ]
}

如果没有新信息，对应字段留空数组或空对象。`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `章节名：${chapterTitle}\n\n正文：${content.substring(0, 8000)}` }
                ],
                stream: false
            })
        });

        const data = await response.json();
        const aiText = data.choices[0].message.content;
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);

        if (!jsonMatch) return;

        const extracted = JSON.parse(jsonMatch[0]);
        const memory = await getMemory();

        // 更新角色状态（存入 activeStates）
        if (extracted.characters) {
            Object.entries(extracted.characters).forEach(([name, info]) => {
                // 查找现有角色
                let charId = null;
                Object.entries(memory.characterProfiles).forEach(([id, profile]) => {
                    if (profile.name === name) charId = id;
                });
                // 新角色则创建
                if (!charId) {
                    charId = 'char_' + name.replace(/[^\u4e00-\u9fff\w]/g, '');
                    memory.characterProfiles[charId] = {
                        name: name,
                        aliases: [],
                        personality: '',
                        motivation: '',
                        relationships: [],
                        arc: ''
                    };
                }
                // 更新状态
                memory.activeStates[charId] = memory.activeStates[charId] || {};
                if (info.status) memory.activeStates[charId].status = info.status;
                if (info.position) memory.activeStates[charId].position = info.position;
            });
        }

        // 添加新伏笔
        if (extracted.foreshadows?.length) {
            extracted.foreshadows.forEach(f => {
                const fsId = 'fs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
                const title = f.description ? f.description.substring(0, 20) : '未命名伏笔';
                memory.foreshadowDetails[fsId] = {
                    id: fsId,
                    title: title,
                    fullDescription: f.description || '',
                    status: 'planted',
                    layer: 'sub',
                    plantedChapter: chapterTitle,
                    plantedChapterId: id,
                    plannedResolution: '',
                    plannedResolutionChapterId: null,
                    resolvedChapter: null,
                    resolvedChapterId: null,
                    relatedCharacterIds: [],
                    preconditions: []
                };
            });
        }

        // 标记已回收伏笔
        if (extracted.resolvedForeshadows?.length) {
            extracted.resolvedForeshadows.forEach(rf => {
                Object.values(memory.foreshadowDetails).forEach(fs => {
                    if (fs.status !== 'planted' && fs.status !== 'hinted') return;
                    if (fs.fullDescription.includes(rf.description) || rf.description.includes(fs.fullDescription)) {
                        fs.status = 'resolved';
                        fs.resolvedChapter = chapterTitle;
                        fs.resolvedChapterId = id;
                    }
                });
            });
        }

        // 重建实体索引
        rebuildEntityIndex(memory);

        await saveMemory(memory);
        console.log('[Memory] 记忆库已更新', memory);

    } catch (e) {
        console.warn('[Memory] 提取失败', e);
    }
}
/**
 * 从正文提取亮点
 * @param {string} chapterContent - 正文内容
 * @returns {Promise<{highlights: string[], raw: string|null, error: string|null}>}
 */
async function extractHighlights(chapterContent) {
    const apiKey = DataCore.getApiKey();
    if (!apiKey) return { highlights: [], raw: null, error: '未配置 API Key' };

    const systemPrompt = `你是读者审阅员。请从以下正文中提取 2-5 条最打动你的亮点。

亮点定义：让读者心颤、沉默、或印象深刻的瞬间。可以是句子、意象、动作节奏。

严格按 JSON 返回：
{
  "highlights": [
    "林醒攥紧铁牌直到指节发白",
    "结尾处裂月突然变亮的三秒停顿"
  ]
}

只提取真正有力量的瞬间，不要凑数。`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: chapterContent.substring(0, 8000) }
                ],
                stream: false,
                max_tokens: 500,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return { highlights: [], raw: null, error: err.error?.message || `请求失败 (${response.status})` };
        }

        const data = await response.json();
        const aiText = data.choices[0].message.content;
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            return { highlights: [], raw: aiText, error: null };
        }

        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed.highlights)) {
                return { highlights: [], raw: aiText, error: null };
            }
            return { highlights: parsed.highlights, raw: null, error: null };
        } catch (e) {
            return { highlights: [], raw: aiText, error: null };
        }
    } catch (e) {
        return { highlights: [], raw: null, error: e.message };
    }
}
/**
 * 归档章节：将档案从当前层迁移到历史层
 * 支持字段合并：新档案有值的字段覆盖，空字段回退旧值
 */
function archiveChapter(memory, chapterId, archive) {
    if (!archive) return;
    memory.historicalChapterArchives = memory.historicalChapterArchives || {};
    const oldArchive = memory.historicalChapterArchives[chapterId] || {};

    memory.historicalChapterArchives[chapterId] = {
        goal: archive.goal || oldArchive.goal || '',
        involvedCharacterIds: (archive.involvedCharacterIds && archive.involvedCharacterIds.length > 0)
            ? [...archive.involvedCharacterIds]
            : (oldArchive.involvedCharacterIds || []),
        involvedLocationIds: (archive.involvedLocationIds && archive.involvedLocationIds.length > 0)
            ? [...archive.involvedLocationIds]
            : (oldArchive.involvedLocationIds || []),
        highlights: (archive.highlights && archive.highlights.length > 0)
            ? [...archive.highlights]
            : (oldArchive.highlights || []),
        notes: archive.notes || oldArchive.notes || '',
        tone: archive.tone || oldArchive.tone || '',
        archivedAt: Date.now()
    };

    if (memory.chapterArchives) {
        delete memory.chapterArchives[chapterId];
    }
}

/**
 * 更新全局摘要
 * @returns {Promise<string|null>} 新摘要字符串；无需更新时返回 null；更新失败时抛错
 */
async function updateGlobalSummary(memory, chapterId, archive, content) {
    const apiKey = DataCore.getApiKey();
    if (!apiKey) return null;
    if (!content || !content.trim()) return null;

    const chapterOrder = flattenChapters(DataCore.getToc());
    const chapterNode = chapterOrder.find(c => c.id === chapterId);
    const chapterTitle = chapterNode ? chapterNode.title : '未知章节';
    const currentSummary = memory.globalSummary || '';

    const prompt = `你是长篇小说的摘要员。以下是这本书的当前全局摘要，和刚定稿的一章。

请更新全局摘要，融入新章节的关键进展。

要求：
- 保留原有摘要中仍然有效的信息
- 融入新章节的关键事件、人物状态变化、未回收伏笔
- 控制在 500 字以内
- 不编造未出现的情节

当前全局摘要：
${currentSummary || '（暂无）'}

刚定稿章节：
标题：${chapterTitle}
目标：${archive.goal || '未填写'}
亮点：${(archive.highlights || []).join(' / ') || '无'}
正文：${content.substring(0, 3000)}

请直接输出更新后的全局摘要，不要任何解释。`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            max_tokens: 800,
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();
    if (!summary) throw new Error('摘要返回为空');
    return summary;
}