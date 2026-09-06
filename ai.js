/*
 * ai.js — 落笔 AI 角色管理、多会话、流式 API 调用、规则面板交互
 */

function generateId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

let currentRole = 'style';
let sessions = {};
let currentSessionId = {};
let lastSelection = { start: 0, end: 0, text: '' };
let userScrolledUp = false;

// ============ 会话 ============
function initSessions() {
    // 从 DataCore 恢复会话数据
    const allSessions = DataCore.getSessions();
    if (Object.keys(allSessions).length > 0) {
        sessions = allSessions;
    }

    ['style', 'plot', 'review', 'partner'].forEach(role => {
        if (!sessions[role] || sessions[role].length === 0) {
            sessions[role] = [{ id: generateId(), title: '默认会话', history: [] }];
        }
        if (!currentSessionId[role]) {
            currentSessionId[role] = sessions[role][0].id;
        }
    });
    saveSessions();
}

function saveSessions() {
    DataCore.setSessions(null, sessions);
    ['style', 'plot', 'review', 'partner'].forEach(role => {
        DataCore.setCurrentSessionId(role, currentSessionId[role]);
    });
}

function getCurrentSession() {
    return sessions[currentRole]?.find(s => s.id === currentSessionId[currentRole]);
}

function newSession() {
    const newId = generateId();
    const title = '新会话 ' + new Date().toLocaleTimeString();
    sessions[currentRole].push({ id: newId, title, history: [] });
    currentSessionId[currentRole] = newId;
    saveSessions();
    renderSessionList();
    clearCurrentChatDisplay();
}

function switchSession(sessionId) {
    currentSessionId[currentRole] = sessionId;
    saveSessions();
    renderSessionList();
    loadSessionToChat();
}

function deleteSession(sessionId) {
    if (sessions[currentRole].length <= 1) { alert('至少保留一个会话'); return; }
    if (!confirm('确定删除此会话？')) return;
    sessions[currentRole] = sessions[currentRole].filter(s => s.id !== sessionId);
    if (currentSessionId[currentRole] === sessionId) {
        currentSessionId[currentRole] = sessions[currentRole][0].id;
    }
    saveSessions();
    renderSessionList();
    loadSessionToChat();
}

function renameSession(sessionId) {
    const session = sessions[currentRole].find(s => s.id === sessionId);
    if (!session) return;
    const newName = prompt('新会话名称：', session.title);
    if (newName && newName.trim()) {
        session.title = newName.trim();
        saveSessions();
        renderSessionList();
    }
}

function renderSessionList() {
    const list = document.getElementById('sessionList');
    if (!list) return;
    const roleSessions = sessions[currentRole] || [];
    list.innerHTML = roleSessions.map(s => `
        <div class="session-item ${s.id === currentSessionId[currentRole] ? 'active' : ''}"
             onclick="switchSession('${s.id}')" ondblclick="renameSession('${s.id}')" title="${s.title}">
            <span class="session-title">${s.title}</span>
            <span class="session-delete" onclick="event.stopPropagation(); deleteSession('${s.id}')">×</span>
        </div>
    `).join('');
}

function loadSessionToChat() {
    const chatArea = document.getElementById('chat-' + currentRole);
    if (!chatArea) return;
    const session = getCurrentSession();
    if (!session) return;
    chatArea.innerHTML = '<p>🤖 AI助手已就绪。</p>';
    session.history.forEach(msg => {
        if (msg.role === 'user') {
            chatArea.innerHTML += `<div class="chat-user"><strong>👤 我</strong><br>${msg.content}</div>`;
        } else if (msg.role === 'assistant') {
            chatArea.innerHTML += `<div class="chat-ai"><strong>🤖 ${getRoleName(currentRole)}</strong><br>${marked.parse(msg.content)}</div>`;
        }
    });
    chatArea.scrollTop = chatArea.scrollHeight;
}

function clearCurrentChatDisplay() {
    const chatArea = document.getElementById('chat-' + currentRole);
    if (chatArea) chatArea.innerHTML = '<p>🤖 AI助手已就绪。</p>';
}

function resetCurrentChat() {
    if (!confirm('确定清空当前会话的全部对话历史吗？')) return;
    const session = getCurrentSession();
    if (session) { session.history = []; saveSessions(); }
    clearCurrentChatDisplay();
}

// ============ Tab 切换 ============
function switchTab(role) {
    currentRole = role;
    const tabMap = { style: 0, plot: 1, review: 2, partner: 3 };
    const allTabs = document.querySelectorAll('.ai-pane .tab');
    allTabs.forEach(t => t.classList.remove('active'));
    if (tabMap[role] !== undefined && allTabs[tabMap[role]]) {
        allTabs[tabMap[role]].classList.add('active');
    }
    ['style', 'plot', 'review', 'partner'].forEach(r => {
        const el = document.getElementById('chat-' + r);
        if (el) el.style.display = (r === role) ? '' : 'none';
    });
    renderSessionList();
    loadSessionToChat();
    userScrolledUp = false;
}

// ============ 新版分析模式 ============
let analyzeMode = false;

function toggleAnalyzeMode() {
    const btn = document.getElementById('analyzeModeBtn');
    analyzeMode = !analyzeMode;

    if (analyzeMode) {
        btn.classList.add('active');
        btn.textContent = '🛑 退出分析';
    } else {
        btn.classList.remove('active');
        btn.textContent = '✨ 分析模式';
        hideQuickCommand();
    }
}

function handleTextSelection(e) {
    if (!analyzeMode) return;
    const editor = document.getElementById('editor');
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    if (!selectedText || selectedText.trim().length < 10) return;
    const key = selectedText + editor.selectionStart + editor.selectionEnd;
    if (window._lastSelectionKey === key) return;
    window._lastSelectionKey = key;
    lastSelection = { start: editor.selectionStart, end: editor.selectionEnd, text: selectedText };
    const chatArea = document.getElementById('chat-' + currentRole);
    chatArea.innerHTML += `<div class="chat-user"><strong>📌 选中段落:</strong> ${selectedText.substring(0, 60)}…</div>`;
    askAI(selectedText);
    toggleAnalyzeMode();
    setTimeout(() => { window._lastSelectionKey = null; }, 500);
}

// ============ 快捷指令菜单 ============
function showQuickCommand(selectedText) {
    const overlay = document.getElementById('quickCommandOverlay');
    const list = document.getElementById('quickCommandList');
    if (!overlay || !list) return;

    const role = DataCore.getCurrentRole();
    const commands = getQuickCommands(role);

    list.innerHTML = commands.map(cmd =>
        `<div class="quick-command-item" onclick="executeQuickCommand('${cmd.action}', \`${selectedText.replace(/`/g, '\\`')}\`)">${cmd.label}</div>`
    ).join('');

    overlay.style.display = 'flex';
}

function hideQuickCommand() {
    const overlay = document.getElementById('quickCommandOverlay');
    if (overlay) overlay.style.display = 'none';
}

function cancelQuickCommand() {
    hideQuickCommand();
    toggleAnalyzeMode();
}

function executeQuickCommand(action, selectedText) {
    hideQuickCommand();

    const chatArea = document.getElementById('chat-' + DataCore.getCurrentRole());
    chatArea.innerHTML += `<div class="chat-user"><strong>👤 选中段落:</strong> ${selectedText.substring(0, 60)}…</div>`;
    chatArea.scrollTop = chatArea.scrollHeight;

    const prompt = getQuickCommandPrompt(action);
    askAI(prompt + '\n\n' + selectedText);

    toggleAnalyzeMode();
}

function getQuickCommands(role) {
    const commands = {
        'style': [
            { label: '🔍 检查句式问题', action: 'check_sentence' },
            { label: '✏️ 润色这段文字', action: 'polish' },
            { label: '📝 检查用词重复', action: 'check_repeat' },
        ],
        'plot': [
            { label: '🔗 检查设定一致性', action: 'check_setting' },
            { label: '🕐 检查时间线', action: 'check_timeline' },
            { label: '📌 检查物品连续性', action: 'check_items' },
        ],
        'review': [
            { label: '👁️ 读者视角评价', action: 'review_feel' },
            { label: '⚡ 指出情感峰值', action: 'check_peak' },
            { label: '🔊 指出最打动人的句子', action: 'best_line' },
        ],
        'partner': [
            { label: '💡 讨论这段情节', action: 'discuss_plot' },
            { label: '🤔 帮我找灵感', action: 'inspire' },
            { label: '📋 检查是否与设定冲突', action: 'check_conflict' },
        ],
    };
    return commands[role] || [];
}

function getQuickCommandPrompt(action) {
    const prompts = {
        'check_sentence': '请检查以下文字的句式是否有问题：',
        'polish': '请润色以下文字，保持原意和风格，只做微调：',
        'check_repeat': '请检查以下文字中是否有重复用词或冗余表达：',
        'check_setting': '请检查以下文字是否与已建立的设定一致：',
        'check_timeline': '请检查以下文字的时间线是否一致：',
        'check_items': '请检查以下文字中物品的使用是否连续：',
        'review_feel': '请以挑剔读者的视角评价以下文字：',
        'check_peak': '请指出以下文字的情感峰值是否成立：',
        'best_line': '请指出以下文字中最打动人的一句：',
        'discuss_plot': '请和我讨论以下情节的走向：',
        'inspire': '请根据以下内容给我一些灵感建议：',
        'check_conflict': '请检查以下内容是否与已有设定冲突：',
    };
    return prompts[action] || '请分析以下文字：';
}

// ============ 核心 API 调用 ============
async function askAI(selectedText) {
    const apiKey = DataCore.getApiKey();
    if (!apiKey) { alert('请先在规则面板设置 API Key'); return; }

    const inputField = document.getElementById('ai-input');
    const userInput = selectedText || inputField.value;
    if (!userInput) return;

    const chatArea = document.getElementById('chat-' + currentRole);
    if (!selectedText) {
        chatArea.innerHTML += `<div class="chat-user"><strong>👤 我</strong><br>${userInput}</div>`;
        inputField.value = '';
    }

    let session = getCurrentSession();
    if (!session) { newSession(); session = getCurrentSession(); }

    let systemContent = getRolePrompt(currentRole);
    const memoryCtx = typeof getMemoryContext === 'function' ? getMemoryContext() : '';
    if (memoryCtx) {
        systemContent = memoryCtx + '\n---\n' + systemContent;
    }

    const bg = getBackground();
    if (currentRole === 'style' || currentRole === 'review') {
        // 不注入
    } else if (currentRole === 'plot') {
        const summary = typeof getSettingSummary === 'function' ? getSettingSummary() : '';
        if (summary.trim()) {
            systemContent = `【设定摘要】\n${summary.trim()}\n---\n` + systemContent;
        } else if (bg.trim()) {
            const shortBg = bg.trim().substring(0, 500) + (bg.trim().length > 500 ? '...' : '');
            systemContent = `【设定参考】\n${shortBg}\n---\n` + systemContent;
        }
    } else if (currentRole === 'partner') {
        if (!session.history || session.history.length === 0) {
            if (bg.trim()) {
                systemContent = `【故事背景】\n${bg.trim()}\n\n` + systemContent;
            }
        }
    }

    const messages = [
        { role: "system", content: systemContent },
        ...(session.history || []),
        { role: "user", content: userInput }
    ];

    const msgId = 'msg-' + Date.now();
    chatArea.innerHTML += `
        <div class="chat-ai" id="${msgId}">
            <strong>🤖 ${getRoleName(currentRole)}</strong><br>
            <span class="ai-reasoning" id="${msgId}-reasoning" style="display:none;"></span>
            <span class="ai-content" id="${msgId}-content"></span>
            <div class="apply-btn-row" id="${msgId}-apply" style="display:none;">
                <button class="apply-btn" onclick="applyEdit('${msgId}')">📥 应用修改</button>
            </div>
        </div>`;
    chatArea.scrollTop = chatArea.scrollHeight;

    const model = (ruleConfig[currentRole] && ruleConfig[currentRole].model) ||
                  (typeof currentModel !== 'undefined' ? currentModel : 'deepseek-chat');

    let fullContent = '';
    let reasoningContent = '';
    let renderTimer = null;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages, stream: true })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const jsonStr = trimmed.slice(6);
                if (jsonStr === '[DONE]') continue;
                try {
                    const chunk = JSON.parse(jsonStr);
                    const delta = chunk.choices[0]?.delta;
                    if (!delta) continue;
                    if (delta.reasoning_content) {
                        reasoningContent += delta.reasoning_content;
                        const reasoningEl = document.getElementById(`${msgId}-reasoning`);
                        if (reasoningEl) {
                            reasoningEl.style.display = 'block';
                            reasoningEl.innerHTML = `<details open><summary>💭 思考过程</summary>${marked.parse(reasoningContent)}</details>`;
                        }
                    }
                    if (delta.content) {
                        fullContent += delta.content;
                        const contentEl = document.getElementById(`${msgId}-content`);
                        if (contentEl) {
                            contentEl.textContent = fullContent;
                            if (renderTimer) clearTimeout(renderTimer);
                            renderTimer = setTimeout(() => {
                                contentEl.innerHTML = marked.parse(fullContent);
                                const isNearBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 60;
                                if (!userScrolledUp || isNearBottom) {
                                    chatArea.scrollTop = chatArea.scrollHeight;
                                }
                            }, 80);
                        }
                    }
                } catch (e) {}
            }
        }

        if (renderTimer) clearTimeout(renderTimer);
        const contentEl = document.getElementById(`${msgId}-content`);
        if (contentEl) contentEl.innerHTML = marked.parse(fullContent);
        const isNearBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 60;
        if (!userScrolledUp || isNearBottom) {
            chatArea.scrollTop = chatArea.scrollHeight;
        }

        const applyRow = document.getElementById(`${msgId}-apply`);
        if (applyRow) applyRow.style.display = '';

        session.history.push(
            { role: "user", content: userInput },
            { role: "assistant", content: fullContent }
        );
        saveSessions();

    } catch (error) {
        const contentEl = document.getElementById(`${msgId}-content`);
        if (contentEl) contentEl.innerHTML = `<span class="chat-error">❌ ${error.message}</span>`;
    }
}

// ============ 应用修改 ============
function applyEdit(msgId) {
    const contentEl = document.getElementById(msgId + '-content');
    if (!contentEl) return;
    const aiText = contentEl.textContent || contentEl.innerText || '';
    let replacement = extractModifiedText(aiText);
    if (!replacement || replacement.trim().length === 0) {
        alert('未能从 AI 回复中提取到可替换的文本。');
        return;
    }
    const opinionKeywords = ['无需修改', '符合要求', '没有违规', '全部符合', '未发现'];
    if (opinionKeywords.some(kw => replacement.includes(kw)) && replacement.length < 100) {
        alert('AI 认为这段文字无需修改。');
        return;
    }

    const editor = document.getElementById('editor');
    const originalText = lastSelection.text || editor.value.substring(lastSelection.start, lastSelection.end);
    const origLen = originalText.length;
    const replLen = replacement.length;
    const changeRatio = (replLen - origLen) / origLen;
    if (origLen > 0 && Math.abs(changeRatio) > 0.5) {
        if (!confirm(`⚠️ 替换后字数变化较大：${origLen} → ${replLen} 字 (${(changeRatio * 100).toFixed(0)}%)\n超过 ±50% 的安全阈值。是否继续？`)) return;
    }
    const similarity = calculateTextSimilarity(originalText, replacement);
    if (similarity < 0.3 && origLen > 20) {
        if (!confirm(`⚠️ AI 建议的修改与原文差异较大（相似度约 ${(similarity * 100).toFixed(0)}%）。确认替换？`)) return;
    }

    const before = editor.value.substring(0, lastSelection.start);
    const after = editor.value.substring(lastSelection.end);
    editor.value = before + replacement + after;
    const newEnd = lastSelection.start + replacement.length;
    lastSelection = { start: lastSelection.start, end: newEnd, text: replacement };

    const currentId = DataCore.getCurrentChapterId();
    if (currentId) {
        DataCore.setChapterContent(currentId, editor.value);
    }

    const btn = document.querySelector(`#${msgId}-apply .apply-btn`);
    if (btn) {
        btn.textContent = '✅ 已应用';
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = '📥 应用修改';
            btn.disabled = false;
        }, 2000);
    }
}

function calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    const s1 = text1.toLowerCase().replace(/\s+/g, ' ');
    const s2 = text2.toLowerCase().replace(/\s+/g, ' ');
    if (s1 === s2) return 1;
    if (s1.length < 2 || s2.length < 2) {
        return 1 - (levenshteinDistance(s1, s2) / Math.max(s1.length, s2.length));
    }
    const bigrams1 = new Set();
    const bigrams2 = new Set();
    for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.substring(i, i + 2));
    for (let i = 0; i < s2.length - 1; i++) bigrams2.add(s2.substring(i, i + 2));
    const intersection = new Set([...bigrams1].filter(x => bigrams2.has(x)));
    const union = new Set([...bigrams1, ...bigrams2]);
    return intersection.size / (union.size || 1);
}

function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i-1] === a[j-1]) {
                matrix[i][j] = matrix[i-1][j-1];
            } else {
                matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
            }
        }
    }
    return matrix[b.length][a.length];
}

function extractModifiedText(aiText) {
    const newMarker = aiText.match(/【可替换文本】\s*\n([\s\S]+?)(?=\n\n|$)/);
    if (newMarker && newMarker[1].trim()) return newMarker[1].trim();
    const patterns = [
        /修改后[：:]\s*\n?([\s\S]+?)(?=\n\n|\n?$)/,
        /建议改为[：:]\s*\n?([\s\S]+?)(?=\n\n|\n?$)/,
        /修改建议[：:]\s*\n?([\s\S]+?)(?=\n\n|\n?$)/,
        /润色后[：:]\s*\n?([\s\S]+?)(?=\n\n|\n?$)/
    ];
    for (const p of patterns) {
        const m = aiText.match(p);
        if (m && m[1].trim()) return m[1].trim().replace(/^["']|["']$/g, '');
    }
    const codeBlock = aiText.match(/```[\s\S]*?\n([\s\S]*?)```/);
    if (codeBlock && codeBlock[1].trim()) return codeBlock[1].trim();
    const quoteBlock = aiText.match(/"([\s\S]{20,})"/);
    if (quoteBlock && quoteBlock[1].trim()) return quoteBlock[1].trim();
    return null;
}

// ============ 规则面板 ============
let currentRuleTab = 'style';

function toggleRulePanel() {
    const panel = document.getElementById('rulePanel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
    if (panel.style.display !== 'none') {
        if (currentRuleTab === 'background') initBackgroundField();
        else renderRuleList();
    }
}

function switchRuleTab(role) {
    currentRuleTab = role;
    const ruleTabMap = { style: 0, plot: 1, review: 2, partner: 3, background: 4, appearance: 5, memory: 6 };
    const tabs = document.querySelectorAll('.rule-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (ruleTabMap[role] !== undefined && tabs[ruleTabMap[role]]) {
        tabs[ruleTabMap[role]].classList.add('active');
    }
    const ruleList = document.getElementById('ruleList');
    const bgEditor = document.getElementById('backgroundEditor');
    const appearanceSettings = document.getElementById('appearanceSettings');
    const memoryPanel = document.getElementById('memoryPanel');
    if (ruleList) ruleList.style.display = 'none';
    if (bgEditor) bgEditor.style.display = 'none';
    if (appearanceSettings) appearanceSettings.style.display = 'none';
    if (memoryPanel) memoryPanel.style.display = 'none';
    if (role === 'background') {
        if (bgEditor) bgEditor.style.display = '';
        if (typeof initBackgroundField === 'function') initBackgroundField();
    } else if (role === 'appearance') {
        if (appearanceSettings) appearanceSettings.style.display = '';
        if (typeof initAppearanceSettings === 'function') initAppearanceSettings();
    } else if (role === 'memory') {
        if (memoryPanel) memoryPanel.style.display = '';
        if (typeof renderMemoryPanel === 'function') renderMemoryPanel();
    } else {
        if (memoryPanel) memoryPanel.style.display = 'none';
        if (ruleList) ruleList.style.display = '';
        renderRuleList();
    }
}

function renderRuleList() {
    const list = document.getElementById('ruleList');
    if (!list) return;
    const roles = ['style', 'plot', 'review', 'partner'];
    const roleLabels = {
        'style': '🎨 风格审核',
        'plot': '📈 剧情锚点',
        'review': '🔍 读者审阅',
        'partner': '💡 创作伙伴'
    };
    let html = '';
    roles.forEach(role => {
        const config = ruleConfig[role];
        if (!config) return;
        const rules = config.rules || [];
        const enabledCount = rules.filter(r => r.enabled).length;
        html += `<details class="rule-group-details" ${role === currentRuleTab ? 'open' : ''}>`;
        html += `<summary class="rule-group-summary">${roleLabels[role]} (${enabledCount}/${rules.length} 启用)</summary>`;
        html += `<div class="rule-group-content">`;
        if (rules.length === 0) {
            html += `<p style="font-size:12px;padding:8px;color:var(--text-color);opacity:0.6;">暂无规则</p>`;
        } else {
            rules.forEach(rule => {
                html += `
                    <div class="rule-item" data-rule-id="${rule.id}">
                        <input type="checkbox" id="rule-${rule.id}" ${rule.enabled ? 'checked' : ''}
                               onchange="toggleRule('${role}', '${rule.id}')">
                        <label for="rule-${rule.id}" ondblclick="editRuleLabel('${role}', '${rule.id}')">${rule.label}</label>
                        <span class="rule-actions">
                            <button class="icon-btn rule-edit-btn" onclick="editRulePrompt('${role}', '${rule.id}')" title="编辑指令">✎</button>
                            <button class="icon-btn rule-delete-btn" onclick="deleteRule('${role}', '${rule.id}')" title="删除规则">×</button>
                        </span>
                    </div>`;
            });
        }
        html += `<button class="rule-add-btn" onclick="addCustomRule('${role}')">+ 添加规则</button>`;
        html += `</div></details>`;
    });
    html += `<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">
        <button onclick="aiExtractRules()" style="font-size:11px;padding:4px 10px;">🧠 从内核提取</button>
        <button onclick="aiReviewAllRules()" style="font-size:11px;padding:4px 10px;">🔍 审查全部规则</button>
    </div>`;
    list.innerHTML = html;
}

function toggleRule(role, ruleId) {
    const config = ruleConfig[role];
    if (!config) return;
    const rule = config.rules.find(r => r.id === ruleId);
    if (!rule) return;
    const checkbox = document.getElementById('rule-' + ruleId);
    rule.enabled = checkbox ? checkbox.checked : !rule.enabled;
    saveRuleConfig();
    renderRuleList();
}

// ============ AI 提取规则 ============
async function aiExtractRules() {
    const kernel = prompt('请粘贴写作内核全文，AI 将自动提取为规则：');
    if (!kernel || !kernel.trim()) return;
    const apiKey = DataCore.getApiKey();
    if (!apiKey) { alert('请先设置 API Key'); return; }

    const chatArea = document.getElementById('chat-' + currentRole);
    if (chatArea) {
        chatArea.innerHTML += `<div class="chat-system">🧠 正在解析写作内核，提取规则…</div>`;
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    const systemPrompt = `你是一个专业的写作规则提取器。请将以下文档中的每条规则提取为 JSON 数组。格式：[{"role":"style|plot|review|partner","label":"简短名称","prompt":"检查指令"}]。不要编造规则。`;

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
                    { role: 'user', content: kernel }
                ],
                stream: false
            })
        });

        const data = await response.json();
        const aiText = data.choices[0].message.content;
        const jsonMatch = aiText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            if (chatArea) chatArea.innerHTML += `<div class="chat-error">❌ AI 返回无法解析。</div>`;
            return;
        }

        const rules = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(rules) || rules.length === 0) {
            if (chatArea) chatArea.innerHTML += `<div class="chat-system">ℹ️ 未提取到新规则。</div>`;
            return;
        }

        let addedCount = 0, updatedCount = 0, skippedCount = 0;

        for (const rule of rules) {
            const role = ['style', 'plot', 'review', 'partner'].includes(rule.role) ? rule.role : 'style';
            if (!ruleConfig[role]) continue;

            const exactMatch = ruleConfig[role].rules.find(r => r.label === rule.label);

            if (exactMatch) {
                if (exactMatch.prompt === rule.prompt) {
                    skippedCount++;
                    continue;
                }
                const choice = confirm(
                    `规则「${rule.label}」已存在，但新内核中有不同的描述。\n\n📌 旧版本：${exactMatch.prompt}\n\n🆕 新版本：${rule.prompt}\n\n点「确定」覆盖，点「取消」保留。`
                );
                if (choice) {
                    exactMatch.prompt = rule.prompt;
                    exactMatch.isCustom = true;
                    updatedCount++;
                } else {
                    skippedCount++;
                }
                continue;
            }

            const similarMatch = ruleConfig[role].rules.find(r =>
                r.label.includes(rule.label) || rule.label.includes(r.label)
            );
            if (similarMatch) {
                const choice = confirm(
                    `检测到可能重复的规则：\n\n📌 已有规则：「${similarMatch.label}」— ${similarMatch.prompt}\n\n🆕 新规则：「${rule.label}」— ${rule.prompt}\n\n点「确定」仍添加，点「取消」跳过。`
                );
                if (!choice) { skippedCount++; continue; }
            }

            ruleConfig[role].rules.push({
                id: 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                label: rule.label,
                enabled: true,
                prompt: rule.prompt,
                isCustom: true
            });
            addedCount++;
        }

        saveRuleConfig();
        if (typeof renderRuleList === 'function') renderRuleList();

        if (chatArea) {
            chatArea.innerHTML += `<div class="chat-system">✅ 已添加 ${addedCount} 条新规则。</div>`;
            chatArea.scrollTop = chatArea.scrollHeight;
        }
    } catch (error) {
        if (chatArea) chatArea.innerHTML += `<div class="chat-error">❌ ${error.message}</div>`;
    }
}

// ============ AI 审查全部规则库 ============
async function aiReviewAllRules() {
    let allRulesText = '';
    ['style', 'plot', 'review', 'partner'].forEach(role => {
        const config = ruleConfig[role];
        if (!config || !config.rules || config.rules.length === 0) return;
        allRulesText += `\n## ${config.name}（${role}）\n`;
        config.rules.forEach((rule, index) => {
            allRulesText += `${index + 1}. [${rule.label}] ${rule.prompt}\n`;
        });
    });

    if (!allRulesText.trim()) {
        alert('当前没有任何规则，请先添加规则或使用 🧠 提取规则。');
        return;
    }

    const bgKernel = getBackground();
    let kernel = '';

    if (bgKernel && bgKernel.trim().length > 100) {
        const useExisting = confirm(
            '检测到创作背景中已有内容（约 ' + bgKernel.length + ' 字）。\n\n点「确定」使用创作背景作为写作内核进行审查。\n点「取消」手动粘贴新的写作内核。'
        );
        if (useExisting) {
            kernel = bgKernel;
        } else {
            kernel = prompt('请粘贴写作内核全文：');
        }
    } else {
        kernel = prompt(
            '请粘贴写作内核全文（可选）：\n\n如果留空，AI 将仅审查现有规则之间的冲突和重复。\n如果填入写作内核，AI 会额外检查规则是否与内核一致。'
        );
    }

    const apiKey = DataCore.getApiKey();
    if (!apiKey) { alert('请先设置 API Key'); return; }

    const chatArea = document.getElementById('chat-' + currentRole);
    if (chatArea) {
        chatArea.innerHTML += `<div class="chat-system">🔍 正在审查全部规则库，请稍候…</div>`;
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    let systemPrompt = `你是一个专业的规则库审查员。用户会给你一份当前所有审查规则的清单`;
    if (kernel && kernel.trim()) {
        systemPrompt += `以及一份写作内核文档`;
    }
    systemPrompt += `。请执行以下审查任务：

1. **重复检测**：找出语义高度重复的规则（不同名称但检查内容相同），建议合并。
2. **冲突检测**：找出可能相互矛盾的规则（比如一条要求克制，另一条要求煽情）。
3. **冗余检测**：找出过于宽泛、无法实际执行的规则，建议细化或删除。
4. **覆盖盲区**：如果提供了写作内核，指出内核中明确提到但规则库中缺失的检查点。

请按以下 Markdown 格式输出审查报告：

## 🔄 建议合并的重复规则
- 规则A：「xxx」+ 规则B：「xxx」→ 建议合并为「xxx」

## ⚠️ 可能存在冲突的规则
- 规则A：「xxx」⇔ 规则B：「xxx」→ 冲突原因：xxx

## 🗑️ 建议删除或细化的冗余规则
- 规则「xxx」→ 原因：xxx

## 📋 缺失的检查点（如有写作内核）
- xxx（内核要求了但规则库中没有）

如果没有发现某类问题，请写"未发现"。`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `【现有规则清单】\n${allRulesText}\n\n` + (kernel ? `【写作内核】\n${kernel}` : '') }
    ];

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages,
                stream: false
            })
        });

        const data = await response.json();
        const reply = data.choices[0].message.content;

        if (chatArea) {
            const reportId = 'report-' + Date.now();
            chatArea.innerHTML += `
                <div class="chat-ai" id="${reportId}">
                    <strong>🔍 规则库审查报告</strong><br>
                    <div class="report-content">${marked.parse(reply)}</div>
                    <div class="apply-btn-row" style="margin-top:8px;">
                        <button class="apply-btn" onclick="autoFixRules('${reportId}')">🔧 一键自动修复</button>
                    </div>
                </div>`;
            chatArea.scrollTop = chatArea.scrollHeight;
        }
    } catch (error) {
        if (chatArea) {
            chatArea.innerHTML += `<div class="chat-error">❌ 审查失败：${error.message}</div>`;
        }
    }
}

// ============ 自动修复规则 ============
async function autoFixRules(reportId) {
    const reportEl = document.getElementById(reportId);
    if (!reportEl) return;
    const reportText = reportEl.querySelector('.report-content')?.textContent || '';

    if (!reportText.trim()) {
        alert('未找到审查报告内容');
        return;
    }

    if (!confirm(
        'AI 将根据审查报告自动执行以下操作：\n\n✅ 合并重复规则（多条合一条）\n🗑️ 删除建议删除的规则\n✏️ 更新需要细化的规则\n\n此操作不可撤销，确定继续吗？'
    )) return;

    const apiKey = DataCore.getApiKey();
    if (!apiKey) { alert('请先设置 API Key'); return; }

    const chatArea = document.getElementById('chat-' + currentRole);
    chatArea.innerHTML += `<div class="chat-system">🔧 正在自动修复规则库...</div>`;
    chatArea.scrollTop = chatArea.scrollHeight;

    let allRulesJson = {};
    ['style', 'plot', 'review', 'partner'].forEach(role => {
        allRulesJson[role] = ruleConfig[role].rules.map(r => ({
            id: r.id,
            label: r.label,
            prompt: r.prompt
        }));
    });

    const systemPrompt = `你是一个规则库维护专家。请根据审查报告，输出一个 JSON 格式的修复指令。格式如下：

{
  "merge": [
    {
      "role": "style",
      "keepId": "保留的规则id",
      "removeIds": ["要删除的规则id1", "要删除的规则id2"],
      "newLabel": "合并后的规则名称",
      "newPrompt": "合并后的规则指令"
    }
  ],
  "delete": [
    { "role": "style", "id": "要删除的规则id" }
  ],
  "update": [
    { "role": "style", "id": "要更新的规则id", "newLabel": "新名称", "newPrompt": "新指令" }
  ]
}

规则：
1. 只处理审查报告中明确建议的操作
2. 合并时，keepId 必须是真实存在的规则id
3. 删除时，只删除报告中明确建议删除的规则
4. 更新时，只更新报告中明确建议细化的规则
5. 不要编造任何操作

当前规则列表：
${JSON.stringify(allRulesJson, null, 2)}`;

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
                    { role: 'user', content: `审查报告：\n${reportText}` }
                ],
                stream: false
            })
        });

        const data = await response.json();
        const aiText = data.choices[0].message.content;

        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            chatArea.innerHTML += `<div class="chat-error">❌ AI 返回无法解析</div>`;
            return;
        }

        const instructions = JSON.parse(jsonMatch[0]);
        let mergeCount = 0, deleteCount = 0, updateCount = 0;

        if (instructions.merge) {
            for (const m of instructions.merge) {
                const roleRules = ruleConfig[m.role]?.rules;
                if (!roleRules) continue;
                const removeIds = m.removeIds || [];
                ruleConfig[m.role].rules = roleRules.filter(r => !removeIds.includes(r.id));
                deleteCount += removeIds.length;
                const keepRule = ruleConfig[m.role].rules.find(r => r.id === m.keepId);
                if (keepRule) {
                    if (m.newLabel) keepRule.label = m.newLabel;
                    if (m.newPrompt) keepRule.prompt = m.newPrompt;
                    mergeCount++;
                }
            }
        }

        if (instructions.delete) {
            for (const d of instructions.delete) {
                const roleRules = ruleConfig[d.role]?.rules;
                if (!roleRules) continue;
                const before = roleRules.length;
                ruleConfig[d.role].rules = roleRules.filter(r => r.id !== d.id);
                if (ruleConfig[d.role].rules.length < before) deleteCount++;
            }
        }

        if (instructions.update) {
            for (const u of instructions.update) {
                const rule = ruleConfig[u.role]?.rules.find(r => r.id === u.id);
                if (rule) {
                    if (u.newLabel) rule.label = u.newLabel;
                    if (u.newPrompt) rule.prompt = u.newPrompt;
                    updateCount++;
                }
            }
        }

        saveRuleConfig();
        if (typeof renderRuleList === 'function') renderRuleList();

        chatArea.innerHTML += `
            <div class="chat-system">
                ✅ 自动修复完成：<br>
                🔄 合并 ${mergeCount} 组规则<br>
                🗑️ 删除 ${deleteCount} 条冗余规则<br>
                ✏️ 更新 ${updateCount} 条规则<br>
                <br>规则面板已刷新，请打开 ⚙️ 查看修改结果。
            </div>`;
        chatArea.scrollTop = chatArea.scrollHeight;

    } catch (error) {
        chatArea.innerHTML += `<div class="chat-error">❌ 自动修复失败：${error.message}</div>`;
    }
}

// ============ 外观设置（通过 DataCore） ============
function initAppearanceSettings() {
    const editorSlider = document.getElementById('editorFontSizeSlider');
    const chatSlider = document.getElementById('chatFontSizeSlider');
    if (editorSlider) {
        editorSlider.value = DataCore.getUI('editorFontSize') || 18;
        updateEditorFontSize(editorSlider.value);
    }
    if (chatSlider) {
        chatSlider.value = DataCore.getUI('chatFontSize') || 14;
        updateChatFontSize(chatSlider.value);
    }
}

function updateEditorFontSize(value) {
    const editor = document.getElementById('editor');
    if (editor) editor.style.fontSize = value + 'px';
    const fontSizeValue = document.getElementById('fontSizeValue');
    if (fontSizeValue) fontSizeValue.textContent = value + 'px';
    DataCore.setUI('editorFontSize', parseInt(value));
}

function updateChatFontSize(value) {
    document.querySelectorAll('.chat-area').forEach(el => {
        el.style.fontSize = value + 'px';
    });
    const chatFontSizeValue = document.getElementById('chatFontSizeValue');
    if (chatFontSizeValue) chatFontSizeValue.textContent = value + 'px';
    DataCore.setUI('chatFontSize', parseInt(value));
}

function applySavedFontSizes() {
    const editorSize = DataCore.getUI('editorFontSize') || 18;
    const chatSize = DataCore.getUI('chatFontSize') || 14;
    const editor = document.getElementById('editor');
    if (editor) editor.style.fontSize = editorSize + 'px';
    document.querySelectorAll('.chat-area').forEach(el => {
        el.style.fontSize = chatSize + 'px';
    });
}

function toggleSettingsMenu() {
    const menu = document.getElementById('settingsMenu');
    if (!menu) return;
    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : '';
    if (!isOpen) {
        const backdrop = document.createElement('div');
        backdrop.className = 'settings-backdrop';
        backdrop.onclick = () => {
            menu.style.display = 'none';
            backdrop.remove();
        };
        document.body.appendChild(backdrop);
    } else {
        const backdrop = document.querySelector('.settings-backdrop');
        if (backdrop) backdrop.remove();
    }
}

applySavedFontSizes();

// ============ 记忆库面板 ============
function renderMemoryPanel() {
    const memory = DataCore.getMemory();

    const charEl = document.getElementById('memoryCharacters');
    if (charEl) {
        const chars = memory.characters || {};
        const charKeys = Object.keys(chars);
        if (charKeys.length === 0) {
            charEl.innerHTML = '<p class="memory-empty">暂无人物状态</p>';
        } else {
            charEl.innerHTML = charKeys.map(name => {
                const info = chars[name];
                return `<div class="memory-item">
                    <div class="memory-item-header">
                        <strong>${name}</strong>
                        <button class="icon-btn memory-delete-btn" onclick="deleteMemoryCharacter('${name}')">×</button>
                    </div>
                    <div class="memory-item-body">${JSON.stringify(info)}</div>
                </div>`;
            }).join('');
        }
    }

    const foreEl = document.getElementById('memoryForeshadows');
    if (foreEl) {
        const foreshadows = memory.foreshadows || [];
        if (foreshadows.length === 0) {
            foreEl.innerHTML = '<p class="memory-empty">暂无伏笔记录</p>';
        } else {
            foreEl.innerHTML = foreshadows.map(f => {
                const statusIcon = f.status === 'open' ? '🔴' : '✅';
                const statusText = f.status === 'open' ? '未回收' : '已回收';
                return `<div class="memory-item">
                    <div class="memory-item-header">
                        <span>${statusIcon} ${statusText}</span>
                        <button class="icon-btn memory-delete-btn" onclick="deleteMemoryForeshadow('${f.id}')">×</button>
                    </div>
                    <div class="memory-item-body">${f.description}</div>
                    <div class="memory-item-footer">埋于：${f.chapterPlanted || '未知'}${f.chapterResolved ? ' | 回收于：' + f.chapterResolved : ''}</div>
                </div>`;
            }).join('');
        }
    }
}

function addMemoryCharacter() {
    const name = prompt('请输入人物名称：');
    if (!name || !name.trim()) return;
    const status = prompt('请输入当前状态（如：左臂擦伤、当前位置等）：');
    if (status === null) return;
    const memory = DataCore.getMemory();
    if (!memory.characters) memory.characters = {};
    memory.characters[name.trim()] = { status: status.trim() };
    DataCore.setMemory(memory);
    renderMemoryPanel();
}

function deleteMemoryCharacter(name) {
    if (!confirm(`确定要删除人物「${name}」吗？`)) return;
    const memory = DataCore.getMemory();
    if (memory.characters) delete memory.characters[name];
    DataCore.setMemory(memory);
    renderMemoryPanel();
}

function addMemoryForeshadow() {
    const description = prompt('请输入伏笔描述：');
    if (!description || !description.trim()) return;
    const chapterPlanted = prompt('请输入埋下伏笔的章节名称：');
    if (chapterPlanted === null) return;
    const memory = DataCore.getMemory();
    if (!memory.foreshadows) memory.foreshadows = [];
    memory.foreshadows.push({
        id: 'fs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        description: description.trim(),
        status: 'open',
        chapterPlanted: chapterPlanted.trim()
    });
    DataCore.setMemory(memory);
    renderMemoryPanel();
}

function deleteMemoryForeshadow(id) {
    if (!confirm('确定要删除这条伏笔记录吗？')) return;
    const memory = DataCore.getMemory();
    if (memory.foreshadows) {
        memory.foreshadows = memory.foreshadows.filter(f => f.id !== id);
    }
    DataCore.setMemory(memory);
    renderMemoryPanel();
}

// ============ AI 模块初始化（由 index.html 在 DataCore.init 之后调用） ============
function initAI() {
    initSessions();
    renderSessionList();
    loadSessionToChat();

    ['style', 'plot', 'review', 'partner'].forEach(role => {
        const chatArea = document.getElementById('chat-' + role);
        if (chatArea) {
            chatArea.addEventListener('scroll', () => {
                const isNearBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 60;
                userScrolledUp = !isNearBottom;
            });
        }
    });

    const editor = document.getElementById('editor');
    if (editor) {
        editor.addEventListener('mouseup', handleTextSelection);
        editor.addEventListener('keyup', handleTextSelection);
    }
}