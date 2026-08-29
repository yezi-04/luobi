/*
 * finalize.js — 两轮定稿流程（独立面板版）
 * 所有操作通过 DataCore 锁定当前章节
 */

let finalizeState = 'none';
let chapterHardInjuries = [];
let chapterHighlights = [];
const reviewRoles = ['style', 'review'];
const DRAFT_SUFFIX = '_draft';

// ============ 状态持久化 ============
function saveFinalizeData() {
    const id = DataCore.getCurrentChapterId();
    if (!id) return;
    DataCore.setFinalizeData(id, {
        state: finalizeState,
        hardInjuries: chapterHardInjuries,
        highlights: chapterHighlights
    });
}

function loadFinalizeData() {
    const id = DataCore.getCurrentChapterId();
    if (!id) { resetFinalizeUI(); return; }

    const data = DataCore.getFinalizeData(id);
    if (data) {
        finalizeState = data.state || 'none';
        chapterHardInjuries = data.hardInjuries || [];
        chapterHighlights = data.highlights || [];
    } else {
        resetFinalizeData();
    }

    updateFinalizeUI();
    const editor = document.getElementById('editor');
    if (editor) editor.readOnly = (finalizeState === 'finalized');
    updateFinalizeChapterBadge();
}

function resetFinalizeData() {
    finalizeState = 'none';
    chapterHardInjuries = [];
    chapterHighlights = [];
}

function resetFinalizeUI() {
    resetFinalizeData();
    updateFinalizeUI();
    const editor = document.getElementById('editor');
    if (editor) editor.readOnly = false;
}

// ============ UI 更新 ============
function updateFinalizeUI() {
    const stateMap = { 'none': 0, 'report': 0, 'round1': 1, 'round1done': 2, 'round2': 3, 'finalized': 4 };
    const current = stateMap[finalizeState] || 0;

    ['fstep1', 'fstep2', 'fstep3', 'fstep4', 'fstep5'].forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active', 'done');
        if (i < current) el.classList.add('done');
        if (i === current && finalizeState !== 'finalized') el.classList.add('active');
        if (i === 4 && finalizeState === 'finalized') el.classList.add('active');
    });

    const btnReport = document.getElementById('btnCheckReport');
    const btnRound1 = document.getElementById('btnRound1');
    const btnRound1Done = document.getElementById('btnRound1Done');
    const btnRound2 = document.getElementById('btnRound2');
    const btnFinalize = document.getElementById('btnFinalize');

    if (btnReport) btnReport.disabled = false;
    if (btnRound1) btnRound1.disabled = !(finalizeState === 'none' || finalizeState === 'report');
    if (btnRound1Done) btnRound1Done.disabled = finalizeState !== 'round1';
    if (btnRound2) btnRound2.disabled = finalizeState !== 'round1done';
    if (btnFinalize) btnFinalize.disabled = finalizeState !== 'round2';
}

// ============ 一键全部 ============
async function runFullFinalize() {
    if (!DataCore.getCurrentChapterId()) { alert('请先在左侧目录中选择一个章节'); return; }
    if (!confirm('将自动执行：生成报告 → 硬伤定位 → 锁定亮点 → 标记定稿。确定？')) return;

    const content = document.getElementById('editor').value;
    if (!content.trim()) { alert('请先完成章节内容'); return; }

    finalizeState = 'none';
    await generateCheckReport();
    if (finalizeState !== 'report') return;

    await startRoundOneInternal(content);
    if (finalizeState !== 'round1') return;

    if (chapterHardInjuries.length === 0) {
        finalizeState = 'round1done';
        saveFinalizeData();
    } else {
        alert(`发现 ${chapterHardInjuries.length} 条硬伤，请修改后手动点击"✅ 第一轮修改完成"`);
        updateFinalizeUI();
        return;
    }

    await startRoundTwoInternal(content);
    if (finalizeState !== 'round2') return;

    await finalizeChapterInternal();
}

// ============ 校验报告 ============
async function generateCheckReport() {
    const content = document.getElementById('editor').value;
    if (!content.trim()) { alert('请先完成章节内容'); return; }

    const box = document.getElementById('checkReportBox');
    box.style.display = 'block';
    box.innerHTML = '⏳ 正在生成校验报告...';

    try {
        const reply = await callFinalizeAI([
            { role: 'system', content: getCheckReportPrompt() },
            { role: 'user', content }
        ]);
        box.innerHTML = `<div class="report-content">${marked.parse(reply)}</div>`;
        finalizeState = 'report';
        saveReportToFile(reply);
    } catch (e) {
        box.innerHTML = `<span style="color:#c0392b;">生成失败：${e.message}</span>`;
    }
    updateFinalizeUI();
    saveFinalizeData();
}

function getCheckReportPrompt() {
    return `你是章节校验员。请按以下格式输出报告（使用Markdown）：

## 1. 故事逻辑回顾
- 时间线是否一致？是否有前后矛盾？
- 人物行为是否符合其性格设定？

## 2. 状态追踪
- 人物的位置、伤势、情绪状态是否合理推进？
- 物品使用是否有连续性？

## 3. 场景与衔接
- 场景转换是否清晰？
- 段落之间的过渡是否自然？

## 4. 本章总结
- 本章完成了什么目标？
- 是否出现了逻辑硬伤？

只输出报告，不附加额外评论。`;
}

// ============ 第一轮：硬伤定位 ============
async function startRoundOne() {
    await startRoundOneInternal(document.getElementById('editor').value);
}

async function startRoundOneInternal(content) {
    if (!content.trim()) return alert('请先完成章节内容');

    const box = document.getElementById('round1Box');
    box.style.display = 'block';
    box.innerHTML = '⏳ 正在收集硬伤反馈...';

    try {
        const results = await Promise.all(reviewRoles.map(role =>
            callFinalizeAI([
                { role: 'system', content: getRoundOnePrompt(role) },
                { role: 'user', content }
            ]).then(text => ({ role, text }))
        ));

        let html = '';
        results.forEach(({ role, text }) => {
            html += `<div class="feedback-item"><b>${getRoleName(role)}</b>: ${marked.parse(text)}</div>`;
        });
        html += `<textarea class="hard-injury-input" id="hardInjuryInput" placeholder="请根据上方反馈，总结必须修改的硬伤（一行一条）">${chapterHardInjuries.join('\n')}</textarea>`;
        html += '<button onclick="confirmHardInjuries()">✅ 确认硬伤列表</button>';
        box.innerHTML = html;
        finalizeState = 'round1';
    } catch (e) {
        box.innerHTML = `<span style="color:#c0392b;">反馈收集失败：${e.message}</span>`;
    }
    updateFinalizeUI();
    saveFinalizeData();
}

function getRoundOnePrompt(role) {
    if (role === 'style') return '作为风格审核员，请仅指出本章中**最让你不舒服的一个地方**（只描述症状，不给方案）。无则说"无明显硬伤"。';
    if (role === 'review') return '作为挑剔读者，请仅指出本章中**最让你出戏/逻辑不通的一个地方**（只描述症状，不给方案）。无则说"无明显硬伤"。';
    return '';
}

function confirmHardInjuries() {
    const input = document.getElementById('hardInjuryInput');
    if (!input) return;
    chapterHardInjuries = input.value.split('\n').filter(l => l.trim());
    saveFinalizeData();
    alert(`已记录 ${chapterHardInjuries.length} 条硬伤。修改正文后点击"✅ 第一轮修改完成"。`);
}

function markRoundOneDone() {
    if (chapterHardInjuries.length === 0 && !confirm('没有硬伤记录，确认第一轮完成？')) return;
    finalizeState = 'round1done';
    updateFinalizeUI();
    saveFinalizeData();
}

// ============ 第二轮：亮点锁定 ============
async function startRoundTwo() {
    await startRoundTwoInternal(document.getElementById('editor').value);
}

async function startRoundTwoInternal(content) {
    if (!content.trim()) return alert('请先完成章节内容');

    const box = document.getElementById('round2Box');
    box.style.display = 'block';
    box.innerHTML = '⏳ 正在收集亮点反馈...';

    try {
        const results = await Promise.all(reviewRoles.map(role =>
            callFinalizeAI([
                { role: 'system', content: getRoundTwoPrompt(role) },
                { role: 'user', content }
            ]).then(text => ({ role, text }))
        ));

        let html = '';
        results.forEach(({ role, text }) => {
            html += `<div class="feedback-item"><b>${getRoleName(role)}</b>: ${marked.parse(text)}</div>`;
        });
        html += `<textarea class="hard-injury-input" id="highlightInput" placeholder="请输入本章绝对不能修改的亮点（一行一条）">${chapterHighlights.join('\n')}</textarea>`;
        html += '<button onclick="confirmHighlights()">🔒 锁定亮点</button>';
        box.innerHTML = html;
        finalizeState = 'round2';
    } catch (e) {
        box.innerHTML = `<span style="color:#c0392b;">反馈收集失败：${e.message}</span>`;
    }
    updateFinalizeUI();
    saveFinalizeData();
}

function getRoundTwoPrompt(role) {
    if (role === 'style') return '作为风格审核员，请指出本章中**最让你满意、绝对不能改的一个细节**。无则说"无明显亮点"。';
    if (role === 'review') return '作为读者，请指出本章中**最打动你、绝对不能丢的一个亮点**。无则说"无明显亮点"。';
    return '';
}

function confirmHighlights() {
    const input = document.getElementById('highlightInput');
    if (!input) return;
    chapterHighlights = input.value.split('\n').filter(l => l.trim());
    saveFinalizeData();
    alert(`已锁定 ${chapterHighlights.length} 个亮点。点击"📌 标记为定稿"完成本章。`);
}

// ============ 定稿 ============
async function finalizeChapter() {
    await finalizeChapterInternal();
}

async function finalizeChapterInternal() {
    if (!confirm('确定将此章节标记为定稿吗？')) return;
    finalizeState = 'finalized';
    const editor = document.getElementById('editor');
    if (editor) editor.readOnly = true;
    updateFinalizeUI();
    saveFinalizeData();
    if (typeof renderToc === 'function') renderToc();
    updateFinalizeChapterBadge();
    alert('✅ 本章已定稿。报告已保存至下方列表。');
}

function cancelFinalize() {
    if (!confirm('确定取消定稿流程并清空所有记录吗？')) return;
    resetFinalizeData();
    document.getElementById('checkReportBox').style.display = 'none';
    document.getElementById('round1Box').style.display = 'none';
    document.getElementById('round2Box').style.display = 'none';
    const editor = document.getElementById('editor');
    if (editor) editor.readOnly = false;
    updateFinalizeUI();
    saveFinalizeData();
    if (typeof renderToc === 'function') renderToc();
}

// ============ 报告保存 ============
function saveReportToFile(reportContent) {
    const id = DataCore.getCurrentChapterId();
    if (!id) return;

    const node = findNode(id);
    const chapterTitle = node ? node.title : '未知章节';
    const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
    const filename = `${chapterTitle}-定稿报告-${timestamp}.md`;

    const reports = JSON.parse(localStorage.getItem('luobi-finalize-reports') || '{}');
    if (!reports[id]) reports[id] = [];
    reports[id].push({ filename, content: reportContent, time: Date.now() });
    localStorage.setItem('luobi-finalize-reports', JSON.stringify(reports));

    refreshReportList();
}

function refreshReportList() {
    const list = document.getElementById('reportList');
    if (!list) return;

    const id = DataCore.getCurrentChapterId();
    const reports = JSON.parse(localStorage.getItem('luobi-finalize-reports') || '{}');
    const chapterReports = reports[id] || [];

    if (chapterReports.length === 0) {
        list.innerHTML = '<p style="font-size:11px;opacity:0.5;">暂无报告</p>';
        return;
    }

    list.innerHTML = chapterReports.map((r, i) => `
        <div class="report-item" onclick="viewReport('${id}', ${i})" title="${r.filename}">
            📄 ${r.filename}
        </div>
    `).join('');
}

function viewReport(chapterId, index) {
    const reports = JSON.parse(localStorage.getItem('luobi-finalize-reports') || '{}');
    const chapterReports = reports[chapterId] || [];
    if (!chapterReports[index]) return;

    const r = chapterReports[index];
    const box = document.getElementById('checkReportBox');
    box.style.display = 'block';
    box.innerHTML = `<div class="report-content">${marked.parse(r.content)}</div>`;
}

// ============ AI 调用 ============
async function callFinalizeAI(messages) {
    const apiKey = DataCore.getApiKey();
    if (!apiKey) throw new Error('请先设置 API Key');
    const model = DataCore.getUI('deepThink') ? 'deepseek-reasoner' : 'deepseek-chat';

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages, stream: false })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `请求失败 (${response.status})`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
}

// ============ 定稿标记 ============
function getFinalizeBadge(chapterId) {
    const data = DataCore.getFinalizeData(chapterId);
    if (data && data.state === 'finalized') return ' <span class="finalize-badge">✅</span>';
    return '';
}

// ============ 草稿比对 ============
function saveDraft() {
    const currentId = DataCore.getCurrentChapterId();
    if (currentId) {
        const content = document.getElementById('editor').value;
        DataCore.setChapterContent(currentId + DRAFT_SUFFIX, content);
        alert('✅ 当前版本已保存为对比草稿。');
    }
}

function loadDraft() {
    const currentId = DataCore.getCurrentChapterId();
    return currentId ? DataCore.getChapterContent(currentId + DRAFT_SUFFIX) || '' : '';
}

function showDraftDiff() {
    const currentId = DataCore.getCurrentChapterId();
    if (!currentId) return;

    const oldText = loadDraft();
    const newText = document.getElementById('editor').value;

    if (!oldText.trim()) {
        alert('没有找到对比草稿，请先点击“💾 保存为草稿”按钮。');
        return;
    }

    if (oldText === newText) {
        alert('当前内容和草稿完全一致，没有差异。');
        return;
    }

    const diffs = computeCharDiff(oldText, newText);
    const diffHTML = renderCharDiffToHTML(diffs);

    const diffBox = document.getElementById('diffPreviewBox');
    if (diffBox) {
        diffBox.innerHTML = diffHTML;
        diffBox.style.display = 'block';
        diffBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ============ 初始化 ============
DataCore.on('chapter:switched', () => {
    loadFinalizeData();
    refreshReportList();
});