<<<<<<< HEAD
/*
 * config.js — 落笔 通用规则配置、角色提示词、背景管理、API Key 管理
 */

// ============ 通用规则配置 ============
const ruleConfig = {
    // 风格审核：关注文本层面的表达质量
    'style': {
        name: '风格审核',
        active: true,
        rules: [
            { id: 'repeat-words', label: '重复用词检测', enabled: true, prompt: '同一段落内同一词汇出现超过3次，提醒替换。' },
            { id: 'dialogue-tags', label: '对话标签滥用', enabled: true, prompt: '检查"他说""她说"出现频率，建议用动作替代。' },
            { id: 'redundant-express', label: '冗余表达', enabled: true, prompt: '如"他决定离开"，"决定"可以删掉，直接用"他离开"。' },
            { id: 'paragraph-rhythm', label: '段落节奏', enabled: true, prompt: '连续超长段落或连续超短段落，提醒调整。' },
            { id: 'sentence-monotone', label: '句子结构单调', enabled: true, prompt: '连续以"他"开头的句子超过3句，建议变化。' },
            { id: 'cliche', label: '陈词滥调', enabled: true, prompt: '如"心如刀绞""万念俱灰"等常见套话，建议替换。' },
            { id: 'adj-stack', label: '形容词/副词堆砌', enabled: true, prompt: '一句话中超过2个修饰词，建议精简。' },
            { id: 'logic-connect', label: '逻辑关联词依赖', enabled: true, prompt: '过多使用"于是""然后""接着"等词，建议减少。' }
        ]
    },
    // 剧情锚点：关注故事逻辑和设定一致性
    'plot': {
        name: '剧情锚点',
        active: true,
        rules: [
            { id: 'timeline-consistency', label: '时间线一致性', enabled: true, prompt: '检查前后文事件顺序是否矛盾。' },
            { id: 'character-consistency', label: '人物行为一致性', enabled: true, prompt: '人物行为是否符合其已建立的性格。' },
            { id: 'item-continuity', label: '物品连续性', enabled: true, prompt: '前文获得的物品是否无故消失。' },
            { id: 'scene-clarity', label: '场景转换清晰度', enabled: true, prompt: '读者能否清楚知道人物身处何地。' },
            { id: 'state-tracking', label: '人物状态追踪', enabled: true, prompt: '人物的伤势、位置、情绪状态是否合理推进。' },
            { id: 'contradiction', label: '前后矛盾检测', enabled: true, prompt: '前文说"城门关闭"，后文又"骑马进城"这类矛盾。' },
            { id: 'info-boundary', label: '信息一致性', enabled: true, prompt: '人物知道的与读者知道的，是否出现越界。' }
        ]
    },
    // 读者审阅：关注阅读体验与情感
    'review': {
        name: '读者审阅',
        active: true,
        rules: [
            { id: 'pacing', label: '节奏问题', enabled: true, prompt: '指出让你觉得拖沓或仓促的段落。' },
            { id: 'emotion-peak', label: '情感峰值检测', enabled: true, prompt: '本章的情感高潮是否成立。' },
            { id: 'boring', label: '无聊检测', enabled: true, prompt: '指出让你想放下书的段落。' },
            { id: 'immersion', label: '代入感', enabled: true, prompt: '指出让你出戏、无法沉浸的段落。' },
            { id: 'clarity', label: '清晰度', enabled: true, prompt: '指出让你困惑、需要重读才理解的段落。' },
            { id: 'highlight', label: '眼前一亮', enabled: true, prompt: '指出最打动你的句子（正向反馈）。' }
        ]
    },
    // 创作伙伴：关注协作与启发
    'partner': {
        name: '创作伙伴',
        active: true,
        rules: [
            { id: 'plot-discuss', label: '情节讨论', enabled: true, prompt: '分析当前情节走向，提出可能性。' },
            { id: 'motive-mining', label: '人物动机挖掘', enabled: true, prompt: '帮助作者理解人物行为背后的动机。' },
            { id: 'inspire', label: '灵感启发', enabled: true, prompt: '在卡文时给出2-3个可能的方向。' },
            { id: 'setting-check', label: '设定一致性', enabled: true, prompt: '检查新想法是否与已有设定冲突。' },
            { id: 'structure-suggest', label: '结构建议', enabled: true, prompt: '从叙事结构角度给出优化建议。' }
        ]
    }
};

// ============ 角色提示词 ============
function getRolePrompt(role) {
    // 创作伙伴：协作角色，仅首次对话注入背景
    if (role === 'partner') {
        let prompt = '你是我的创作伙伴。你了解我的故事背景、角色设定和当前进度。你的职责不是审稿，而是协作。\n\n';
        const hist = typeof chatHistories !== 'undefined' ? chatHistories['partner'] : null;
        if (!hist || hist.length === 0) {
            const background = getBackground();
            if (background.trim()) {
                prompt += `【当前故事背景】\n${background.trim()}\n\n`;
            }
        }
        prompt += '工作方式：\n';
        prompt += '- 当我卡文时，给出启发式建议（2-3个可能的方向），但由我做最终选择。\n';
        prompt += '- 当我讨论人物动机时，从角色性格出发分析，而不是从套路出发。\n';
        prompt += '- 当我分享新想法时，帮我判断是否与已有设定冲突。\n';
        prompt += '- 记住我聊过的创作想法，在相关场景下主动提醒。\n';
        prompt += '- 不做审查，只做启发。';
        return prompt;
    }

    // 其他审查角色
    const config = ruleConfig[role];
    if (!config || !config.active) return '';
    const enabledRules = config.rules.filter(r => r.enabled);
    if (enabledRules.length === 0) return '';

    let basePrompt = `你是我的${config.name}。请检查以下文字：\n\n`;
    basePrompt += enabledRules.map(r => `- ${r.prompt}`).join('\n');
    basePrompt += '\n\n逐条对照，指出具体问题并给出修改建议。';
    basePrompt += '\n\n**边界情况处理：**\n';
    basePrompt += '- 如果收到明显测试性输入（如"123"、"test"、"你好"），回复："请选中一段小说正文后再试。"\n';
    basePrompt += '- 如果文字虽短但确实是小说片段（如"他感到恐惧"、"她推开门走了进去"），请正常分析并给出建议，不要以"文字过短"为由拒绝。';
    return basePrompt;
}

function getRoleName(role) {
    const names = { 'style': '风格审核', 'plot': '剧情锚点', 'review': '读者审阅', 'partner': '创作伙伴' };
    return names[role] || '';
}

// ============ 规则持久化 ============
function saveRuleConfig() {
    localStorage.setItem('luobi-rule-config', JSON.stringify(ruleConfig));
}

function loadRuleConfig() {
    const saved = localStorage.getItem('luobi-rule-config');
    if (!saved) return;
    try {
        const loaded = JSON.parse(saved);
        Object.keys(ruleConfig).forEach(role => {
            if (!loaded[role] || !loaded[role].rules) return;
            ruleConfig[role].rules.forEach(rule => {
                const savedRule = loaded[role].rules.find(r => r.id === rule.id);
                if (savedRule) {
                    if (typeof savedRule.enabled === 'boolean') rule.enabled = savedRule.enabled;
                    if (savedRule.label) rule.label = savedRule.label;
                    if (savedRule.prompt) rule.prompt = savedRule.prompt;
                }
            });
            loaded[role].rules.forEach(savedRule => {
                if (!ruleConfig[role].rules.find(r => r.id === savedRule.id)) {
                    ruleConfig[role].rules.push(savedRule);
                }
            });
        });
    } catch (e) {
        console.warn('[Config] 规则配置解析失败，已备份损坏数据，使用默认配置', e);
        const backupKey = 'luobi-rule-config-corrupted-' + Date.now();
        localStorage.setItem(backupKey, saved);
        saveRuleConfig();
    }
}

// ============ 规则增删改 ============
function addCustomRule(role) {
    const label = prompt('请输入新规则的名称（简短描述）：');
    if (!label || !label.trim()) return;
    const promptText = prompt('请输入这条规则的详细检查指令：');
    if (!promptText || !promptText.trim()) return;
    const newRule = { id: 'custom_' + Date.now(), label: label.trim(), enabled: true, prompt: promptText.trim(), isCustom: true };
    ruleConfig[role].rules.push(newRule);
    saveRuleConfig();
    if (typeof renderRuleList === 'function') renderRuleList();
}

function deleteRule(role, ruleId) {
    const rule = ruleConfig[role].rules.find(r => r.id === ruleId);
    if (!rule) return;
    if (!confirm(`确定删除规则「${rule.label}」吗？`)) return;
    ruleConfig[role].rules = ruleConfig[role].rules.filter(r => r.id !== ruleId);
    saveRuleConfig();
    if (typeof renderRuleList === 'function') renderRuleList();
}

function editRulePrompt(role, ruleId) {
    const rule = ruleConfig[role].rules.find(r => r.id === ruleId);
    if (!rule) return;
    const newPrompt = prompt(`修改「${rule.label}」的检查指令：`, rule.prompt);
    if (newPrompt === null) return;
    if (!newPrompt.trim()) { alert('指令不能为空'); return; }
    rule.prompt = newPrompt.trim();
    saveRuleConfig();
    if (typeof renderRuleList === 'function') renderRuleList();
}

function editRuleLabel(role, ruleId) {
    const rule = ruleConfig[role].rules.find(r => r.id === ruleId);
    if (!rule) return;
    const newLabel = prompt(`修改「${rule.label}」的名称：`, rule.label);
    if (newLabel === null) return;
    if (!newLabel.trim()) { alert('名称不能为空'); return; }
    rule.label = newLabel.trim();
    saveRuleConfig();
    if (typeof renderRuleList === 'function') renderRuleList();
}

// ============ API Key（通过 DataCore） ============
function getApiKey() {
    return DataCore.getApiKey();
}

function saveApiKey(key) {
    DataCore.setApiKey(key);
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('apiKeyInput');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

function initApiKeyField() {
    const input = document.getElementById('apiKeyInput');
    if (input) input.value = DataCore.getApiKey();
}

// ============ 创作背景（通过 DataCore） ============
function getBackground() {
    return DataCore.getBackground();
}

function saveBackground(text) {
    DataCore.setBackground(text);
}

function autoSaveBackground() {
    const textarea = document.getElementById('backgroundText');
    if (textarea) saveBackground(textarea.value);
}

function initBackgroundField() {
    const textarea = document.getElementById('backgroundText');
    if (textarea) textarea.value = DataCore.getBackground();
    initSettingSummaryField();
}

function getSettingSummary() {
    return DataCore.getSettingSummary();
}

function saveSettingSummary() {
    const textarea = document.getElementById('settingSummary');
    if (textarea) DataCore.setSettingSummary(textarea.value);
}

function initSettingSummaryField() {
    const textarea = document.getElementById('settingSummary');
    if (textarea) textarea.value = DataCore.getSettingSummary();
}

// ============ 初始化 ============
loadRuleConfig();
=======
/*
 * config.js — 落笔 通用规则配置、角色提示词、背景管理、API Key 管理
 */

// ============ 通用规则配置 ============
const ruleConfig = {
    // 风格审核：关注文本层面的表达质量
    'style': {
        name: '风格审核',
        active: true,
        rules: [
            { id: 'repeat-words', label: '重复用词检测', enabled: true, prompt: '同一段落内同一词汇出现超过3次，提醒替换。' },
            { id: 'dialogue-tags', label: '对话标签滥用', enabled: true, prompt: '检查"他说""她说"出现频率，建议用动作替代。' },
            { id: 'redundant-express', label: '冗余表达', enabled: true, prompt: '如"他决定离开"，"决定"可以删掉，直接用"他离开"。' },
            { id: 'paragraph-rhythm', label: '段落节奏', enabled: true, prompt: '连续超长段落或连续超短段落，提醒调整。' },
            { id: 'sentence-monotone', label: '句子结构单调', enabled: true, prompt: '连续以"他"开头的句子超过3句，建议变化。' },
            { id: 'cliche', label: '陈词滥调', enabled: true, prompt: '如"心如刀绞""万念俱灰"等常见套话，建议替换。' },
            { id: 'adj-stack', label: '形容词/副词堆砌', enabled: true, prompt: '一句话中超过2个修饰词，建议精简。' },
            { id: 'logic-connect', label: '逻辑关联词依赖', enabled: true, prompt: '过多使用"于是""然后""接着"等词，建议减少。' }
        ]
    },
    // 剧情锚点：关注故事逻辑和设定一致性
    'plot': {
        name: '剧情锚点',
        active: true,
        rules: [
            { id: 'timeline-consistency', label: '时间线一致性', enabled: true, prompt: '检查前后文事件顺序是否矛盾。' },
            { id: 'character-consistency', label: '人物行为一致性', enabled: true, prompt: '人物行为是否符合其已建立的性格。' },
            { id: 'item-continuity', label: '物品连续性', enabled: true, prompt: '前文获得的物品是否无故消失。' },
            { id: 'scene-clarity', label: '场景转换清晰度', enabled: true, prompt: '读者能否清楚知道人物身处何地。' },
            { id: 'state-tracking', label: '人物状态追踪', enabled: true, prompt: '人物的伤势、位置、情绪状态是否合理推进。' },
            { id: 'contradiction', label: '前后矛盾检测', enabled: true, prompt: '前文说"城门关闭"，后文又"骑马进城"这类矛盾。' },
            { id: 'info-boundary', label: '信息一致性', enabled: true, prompt: '人物知道的与读者知道的，是否出现越界。' }
        ]
    },
    // 读者审阅：关注阅读体验与情感
    'review': {
        name: '读者审阅',
        active: true,
        rules: [
            { id: 'pacing', label: '节奏问题', enabled: true, prompt: '指出让你觉得拖沓或仓促的段落。' },
            { id: 'emotion-peak', label: '情感峰值检测', enabled: true, prompt: '本章的情感高潮是否成立。' },
            { id: 'boring', label: '无聊检测', enabled: true, prompt: '指出让你想放下书的段落。' },
            { id: 'immersion', label: '代入感', enabled: true, prompt: '指出让你出戏、无法沉浸的段落。' },
            { id: 'clarity', label: '清晰度', enabled: true, prompt: '指出让你困惑、需要重读才理解的段落。' },
            { id: 'highlight', label: '眼前一亮', enabled: true, prompt: '指出最打动你的句子（正向反馈）。' }
        ]
    },
    // 创作伙伴：关注协作与启发
    'partner': {
        name: '创作伙伴',
        active: true,
        rules: [
            { id: 'plot-discuss', label: '情节讨论', enabled: true, prompt: '分析当前情节走向，提出可能性。' },
            { id: 'motive-mining', label: '人物动机挖掘', enabled: true, prompt: '帮助作者理解人物行为背后的动机。' },
            { id: 'inspire', label: '灵感启发', enabled: true, prompt: '在卡文时给出2-3个可能的方向。' },
            { id: 'setting-check', label: '设定一致性', enabled: true, prompt: '检查新想法是否与已有设定冲突。' },
            { id: 'structure-suggest', label: '结构建议', enabled: true, prompt: '从叙事结构角度给出优化建议。' }
        ]
    }
};

// ============ 角色提示词 ============
function getRolePrompt(role) {
    // 创作伙伴：协作角色，仅首次对话注入背景
    if (role === 'partner') {
        let prompt = '你是我的创作伙伴。你了解我的故事背景、角色设定和当前进度。你的职责不是审稿，而是协作。\n\n';
        const hist = typeof chatHistories !== 'undefined' ? chatHistories['partner'] : null;
        if (!hist || hist.length === 0) {
            const background = getBackground();
            if (background.trim()) {
                prompt += `【当前故事背景】\n${background.trim()}\n\n`;
            }
        }
        prompt += '工作方式：\n';
        prompt += '- 当我卡文时，给出启发式建议（2-3个可能的方向），但由我做最终选择。\n';
        prompt += '- 当我讨论人物动机时，从角色性格出发分析，而不是从套路出发。\n';
        prompt += '- 当我分享新想法时，帮我判断是否与已有设定冲突。\n';
        prompt += '- 记住我聊过的创作想法，在相关场景下主动提醒。\n';
        prompt += '- 不做审查，只做启发。';
        return prompt;
    }

    // 其他审查角色
    const config = ruleConfig[role];
    if (!config || !config.active) return '';
    const enabledRules = config.rules.filter(r => r.enabled);
    if (enabledRules.length === 0) return '';

    let basePrompt = `你是我的${config.name}。请检查以下文字：\n\n`;
    basePrompt += enabledRules.map(r => `- ${r.prompt}`).join('\n');
    basePrompt += '\n\n逐条对照，指出具体问题并给出修改建议。';
    basePrompt += '\n\n**边界情况处理：**\n';
    basePrompt += '- 如果收到明显测试性输入（如"123"、"test"、"你好"），回复："请选中一段小说正文后再试。"\n';
    basePrompt += '- 如果文字虽短但确实是小说片段（如"他感到恐惧"、"她推开门走了进去"），请正常分析并给出建议，不要以"文字过短"为由拒绝。';
    return basePrompt;
}

function getRoleName(role) {
    const names = { 'style': '风格审核', 'plot': '剧情锚点', 'review': '读者审阅', 'partner': '创作伙伴' };
    return names[role] || '';
}

// ============ 规则持久化 ============
function saveRuleConfig() {
    localStorage.setItem('luobi-rule-config', JSON.stringify(ruleConfig));
}

function loadRuleConfig() {
    const saved = localStorage.getItem('luobi-rule-config');
    if (!saved) return;
    try {
        const loaded = JSON.parse(saved);
        Object.keys(ruleConfig).forEach(role => {
            if (!loaded[role] || !loaded[role].rules) return;
            ruleConfig[role].rules.forEach(rule => {
                const savedRule = loaded[role].rules.find(r => r.id === rule.id);
                if (savedRule) {
                    if (typeof savedRule.enabled === 'boolean') rule.enabled = savedRule.enabled;
                    if (savedRule.label) rule.label = savedRule.label;
                    if (savedRule.prompt) rule.prompt = savedRule.prompt;
                }
            });
            loaded[role].rules.forEach(savedRule => {
                if (!ruleConfig[role].rules.find(r => r.id === savedRule.id)) {
                    ruleConfig[role].rules.push(savedRule);
                }
            });
        });
    } catch (e) {
        localStorage.removeItem('luobi-rule-config');
    }
}

// ============ 规则增删改 ============
function addCustomRule(role) {
    const label = prompt('请输入新规则的名称（简短描述）：');
    if (!label || !label.trim()) return;
    const promptText = prompt('请输入这条规则的详细检查指令：');
    if (!promptText || !promptText.trim()) return;
    const newRule = { id: 'custom_' + Date.now(), label: label.trim(), enabled: true, prompt: promptText.trim(), isCustom: true };
    ruleConfig[role].rules.push(newRule);
    saveRuleConfig();
    if (typeof renderRuleList === 'function') renderRuleList();
}

function deleteRule(role, ruleId) {
    const rule = ruleConfig[role].rules.find(r => r.id === ruleId);
    if (!rule) return;
    if (!confirm(`确定删除规则「${rule.label}」吗？`)) return;
    ruleConfig[role].rules = ruleConfig[role].rules.filter(r => r.id !== ruleId);
    saveRuleConfig();
    if (typeof renderRuleList === 'function') renderRuleList();
}

function editRulePrompt(role, ruleId) {
    const rule = ruleConfig[role].rules.find(r => r.id === ruleId);
    if (!rule) return;
    const newPrompt = prompt(`修改「${rule.label}」的检查指令：`, rule.prompt);
    if (newPrompt === null) return;
    if (!newPrompt.trim()) { alert('指令不能为空'); return; }
    rule.prompt = newPrompt.trim();
    saveRuleConfig();
    if (typeof renderRuleList === 'function') renderRuleList();
}

function editRuleLabel(role, ruleId) {
    const rule = ruleConfig[role].rules.find(r => r.id === ruleId);
    if (!rule) return;
    const newLabel = prompt(`修改「${rule.label}」的名称：`, rule.label);
    if (newLabel === null) return;
    if (!newLabel.trim()) { alert('名称不能为空'); return; }
    rule.label = newLabel.trim();
    saveRuleConfig();
    if (typeof renderRuleList === 'function') renderRuleList();
}

// ============ API Key（通过 DataCore） ============
function getApiKey() {
    return DataCore.getApiKey();
}

function saveApiKey(key) {
    DataCore.setApiKey(key);
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('apiKeyInput');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

function initApiKeyField() {
    const input = document.getElementById('apiKeyInput');
    if (input) input.value = DataCore.getApiKey();
}

// ============ 创作背景（通过 DataCore） ============
function getBackground() {
    return DataCore.getBackground();
}

function saveBackground(text) {
    DataCore.setBackground(text);
}

function autoSaveBackground() {
    const textarea = document.getElementById('backgroundText');
    if (textarea) saveBackground(textarea.value);
}

function initBackgroundField() {
    const textarea = document.getElementById('backgroundText');
    if (textarea) textarea.value = DataCore.getBackground();
    initSettingSummaryField();
}

function getSettingSummary() {
    return DataCore.getSettingSummary();
}

function saveSettingSummary() {
    const textarea = document.getElementById('settingSummary');
    if (textarea) DataCore.setSettingSummary(textarea.value);
}

function initSettingSummaryField() {
    const textarea = document.getElementById('settingSummary');
    if (textarea) textarea.value = DataCore.getSettingSummary();
}

// ============ 初始化 ============
loadRuleConfig();
>>>>>>> 52d0b07cdba6ab31d13c22fa4808849409491158
initBackgroundField();