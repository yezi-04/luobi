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
    renderArchiveView();
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
    // 解锁按钮与取消按钮互斥：finalized 时隐藏 cancel，避免语义重叠
    const btnCancel = document.querySelector('.cancel-btn');
    if (btnCancel) {
        btnCancel.style.display = (finalizeState === 'finalized') ? 'none' : '';
    }
    // 解锁/定稿按钮互斥显隐
    const btnUnlock = document.getElementById('btnUnlock');
    if (btnUnlock) {
        if (finalizeState === 'finalized') {
            btnUnlock.style.display = '';
            if (btnFinalize) btnFinalize.style.display = 'none';
        } else {
            btnUnlock.style.display = 'none';
            if (btnFinalize) btnFinalize.style.display = '';
        }
    }
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
    const box = document.getElementById('round2Box');

    // 统一收尾函数
    const finalize = () => {
        updateFinalizeUI();
        saveFinalizeData();
    };

    if (!content.trim()) {
        alert('请先完成章节内容');
        return;
    }

    const chapterId = DataCore.getCurrentChapterId();
    if (!chapterId) {
        box.style.display = 'block';
        box.innerHTML = '<p>未找到当前章节，无法提取亮点。</p>';
        return;
    }

    box.style.display = 'block';
    box.innerHTML = '⏳ 正在收集亮点反馈...';

    // 覆盖确认
    const memory = await DataCore.getMemory();
    const existing = memory.chapterArchives?.[chapterId]?.highlights || [];
    if (existing.length > 0) {
        if (!confirm(`本章已有 ${existing.length} 条亮点，重新提取将覆盖。是否继续？`)) {
            box.innerHTML = '<p>已取消提取。</p>';
            finalize();
            return;
        }
    }

    try {
        const result = await extractHighlights(content);

        // 异常路径
        if (result.error) {
            box.innerHTML = `<span style="color:#c0392b;">亮点提取失败：${escapeHTML(result.error)}</span>`;
            finalize();
            return;
        }

        // 降级路径：AI 返回非 JSON
        if (result.raw) {
            box.innerHTML = `
                <p>AI 未能提取结构化亮点。以下是原始返回：</p>
                <textarea id="highlightFallback" class="hard-injury-input">${escapeHTML(result.raw)}</textarea>
                <button onclick="parseManualHighlights()">解析为亮点</button>
            `;
            finalizeState = 'round2';
            finalize();
            return;
        }

        // 空结果路径
        if (result.highlights.length === 0) {
            box.innerHTML = '<p>AI 未提取到亮点。可能是本章暂无明显亮点，或提取服务异常。</p>';
            finalizeState = 'round2';
            finalize();
            return;
        }

        // 正常路径：展示勾选面板
        let html = '<p>读者审阅员提取到以下亮点，请确认：</p>';
        html += '<div class="highlight-list">';
        result.highlights.forEach((h, i) => {
            html += `
                <label class="highlight-item">
                    <input type="checkbox" class="highlight-checkbox" data-index="${i}" checked>
                    <span>${escapeHTML(h)}</span>
                </label>
            `;
        });
        html += '</div>';
        html += '<button onclick="confirmHighlights()" style="margin-top:8px;">✅ 确认写入本章亮点</button>';
        box.innerHTML = html;

        chapterHighlights = result.highlights.slice();
        finalizeState = 'round2';

        // 默认全选写入记忆库，保证「一键全部」也能归档
        memory.chapterArchives = memory.chapterArchives || {};
        if (!memory.chapterArchives[chapterId]) {
            memory.chapterArchives[chapterId] = {
                goal: '',
                involvedCharacterIds: [],
                involvedLocationIds: [],
                highlights: [],
                notes: '',
                tone: ''
            };
        }
        memory.chapterArchives[chapterId].highlights = result.highlights.slice();
        await DataCore.setMemory(memory);

        finalize();
    } catch (e) {
        box.innerHTML = `<span style="color:#c0392b;">亮点提取失败：${escapeHTML(e.message)}</span>`;
        finalize();
    }
}

function getRoundTwoPrompt(role) {
    if (role === 'style') return '作为风格审核员，请指出本章中**最让你满意、绝对不能改的一个细节**。无则说"无明显亮点"。';
    if (role === 'review') return '作为读者，请指出本章中**最打动你、绝对不能丢的一个亮点**。无则说"无明显亮点"。';
    return '';
}

async function confirmHighlights() {
    const chapterId = DataCore.getCurrentChapterId();
    if (!chapterId) {
        alert('未找到当前章节。');
        return;
    }

    // 收集勾选状态
    const checkboxes = document.querySelectorAll('.highlight-checkbox');
    const selected = [];
    checkboxes.forEach(cb => {
        if (cb.checked) {
            const idx = parseInt(cb.dataset.index);
            if (chapterHighlights[idx]) selected.push(chapterHighlights[idx]);
        }
    });

    if (selected.length === 0) {
        alert('请至少勾选一条亮点。');
        return;
    }

    // 写入记忆库
    const memory = await DataCore.getMemory();
    memory.chapterArchives = memory.chapterArchives || {};
    if (!memory.chapterArchives[chapterId]) {
        memory.chapterArchives[chapterId] = {
            goal: '',
            involvedCharacterIds: [],
            involvedLocationIds: [],
            highlights: [],
            notes: '',
            tone: ''
        };
    }
    memory.chapterArchives[chapterId].highlights = selected;
    await DataCore.setMemory(memory);

    // 清空临时变量
    chapterHighlights = [];

    alert(`已写入 ${selected.length} 条亮点。`);
    finalizeState = 'round2';
    updateFinalizeUI();
    saveFinalizeData();
}

/**
 * 降级路径：解析用户手动粘贴的文本为亮点
 */
async function parseManualHighlights() {
    const textarea = document.getElementById('highlightFallback');
    if (!textarea) return;
    const lines = textarea.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
        alert('请先粘贴或输入亮点。');
        return;
    }
    chapterHighlights = lines;

    // 重新展示勾选面板
    const box = document.getElementById('round2Box');
    let html = '<p>以下是从文本解析出的亮点，请确认：</p>';
    html += '<div class="highlight-list">';
    lines.forEach((h, i) => {
        html += `
            <label class="highlight-item">
                <input type="checkbox" class="highlight-checkbox" data-index="${i}" checked>
                <span>${escapeHTML(h)}</span>
            </label>
        `;
    });
    html += '</div>';
    html += '<button onclick="confirmHighlights()" style="margin-top:8px;">✅ 确认写入本章亮点</button>';
    box.innerHTML = html;
}

// ============ 定稿 ============
async function finalizeChapter() {
    await finalizeChapterInternal();
}

async function finalizeChapterInternal() {
    if (!confirm('确定将此章节标记为定稿吗？')) return;

    const chapterId = DataCore.getCurrentChapterId();
    if (!chapterId) { alert('未找到当前章节'); return; }

    const editor = document.getElementById('editor');
    const content = editor?.value || '';

    // ===== 记忆库处理：成功后再锁定状态 =====
    const memory = await DataCore.getMemory();

    // archive 来源：当前层优先，缺失时回退历史层（用于摘要更新）
    let archive = memory.chapterArchives?.[chapterId];
    if (!archive && memory.historicalChapterArchives?.[chapterId]) {
        archive = memory.historicalChapterArchives[chapterId];
    }

    // 更新摘要（两种场景都执行）
    if (archive && content.trim()) {
        try {
            const newSummary = await updateGlobalSummary(memory, chapterId, archive, content);
            if (newSummary) memory.globalSummary = newSummary;
        } catch (e) {
            showToast('全局摘要更新失败，不影响定稿', 'info');
            console.warn('globalSummary update failed:', e);
        }
    }

    // 迁移档案（仅当当前层有档案时执行）
    if (memory.chapterArchives?.[chapterId]) {
        archiveChapter(memory, chapterId, memory.chapterArchives[chapterId]);
    }

    try {
        await DataCore.setMemory(memory);
    } catch (e) {
        alert('保存记忆库失败，章节未定稿');
        console.error('setMemory failed:', e);
        return;
    }

    // ===== 写入成功，锁定状态 =====
    finalizeState = 'finalized';
    if (editor) editor.readOnly = true;
    updateFinalizeUI();
    saveFinalizeData();
    if (typeof renderToc === 'function') renderToc();
    updateFinalizeChapterBadge();
    alert('✅ 本章已定稿。');
}

// ============ 解锁章节 ============
async function unlockChapter() {
    const chapterId = DataCore.getCurrentChapterId();
    if (!chapterId) { alert('未找到当前章节'); return; }

    if (!confirm(
        '确定解锁此章节？\n\n' +
        '解锁后：\n' +
        '· 章节档案将返回工作区（可被二次定稿更新）\n' +
        '· 编辑器解除只读\n' +
        '· 可重新走完整定稿流程\n' +
        '· 上次定稿的硬伤和亮点记录将清空（定稿报告仍保留）\n\n' +
        '注意：历史报告不会清空，二次定稿会追加新报告。'
    )) return;

    const memory = await DataCore.getMemory();

    // 档案迁回（仅当历史层有档案时执行迁回，但持久化无条件执行）
    if (memory.historicalChapterArchives?.[chapterId]) {
        restoreArchive(memory, chapterId);
    }

    try {
        await DataCore.setMemory(memory);
    } catch (e) {
        alert('保存记忆库失败，章节未解锁');
        console.error('setMemory failed:', e);
        return;
    }

    // 状态复位
    finalizeState = 'none';
    chapterHardInjuries = [];
    chapterHighlights = [];

    const editor = document.getElementById('editor');
    if (editor) editor.readOnly = false;

    updateFinalizeUI();
    saveFinalizeData();
    if (typeof renderToc === 'function') renderToc();
    updateFinalizeChapterBadge();

    // setMemory 会触发 memory:updated → renderArchiveView
    // 这里手动 await 是为了保证本次操作的渲染顺序（内存状态已复位后再渲染）
    await renderArchiveView();
    showToast('章节已解锁，可重新编辑', 'success');
}

/**
 * 档案迁回：历史层 → 当前层，删除 archivedAt
 */
function restoreArchive(memory, chapterId) {
    const archived = memory.historicalChapterArchives?.[chapterId];
    if (!archived) return false;

    memory.chapterArchives = memory.chapterArchives || {};
    memory.chapterArchives[chapterId] = {
        goal: archived.goal || '',
        involvedCharacterIds: [...(archived.involvedCharacterIds || [])],
        involvedLocationIds: [...(archived.involvedLocationIds || [])],
        highlights: [...(archived.highlights || [])],
        notes: archived.notes || '',
        tone: archived.tone || ''
        // 不复制 archivedAt
    };

    delete memory.historicalChapterArchives[chapterId];
    return true;
}

// ============ 档案展示（双态：只读/编辑） ============
async function renderArchiveView() {
    const box = document.getElementById('archiveViewBox');
    if (!box) return;

    // 若焦点在档案字段内，跳过重建（避免打断输入）
    const activeEl = document.activeElement;
    if (activeEl && box.contains(activeEl) &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
    }

    const chapterId = DataCore.getCurrentChapterId();
    if (!chapterId) {
        box.innerHTML = '<p class="archive-empty">未选择章节</p>';
        return;
    }

    const memory = await DataCore.getMemory();

    // 数据源切换：当前层优先，回退历史层
    let archive = null;
    let source = '';
    if (memory.chapterArchives?.[chapterId]) {
        archive = memory.chapterArchives[chapterId];
        source = 'working';
    } else if (memory.historicalChapterArchives?.[chapterId]) {
        archive = memory.historicalChapterArchives[chapterId];
        source = 'archived';
    }

    if (!archive) {
        box.innerHTML = '<p class="archive-empty">本章暂无档案</p>';
        return;
    }

    const editable = (source === 'working');
    const layerLabel = editable ? '📝 工作档案（编辑中）' : '📁 已归档';
    let html = `<div class="archive-header">${layerLabel}</div>`;

    if (editable) {
        // 编辑态：goal / tone 用 input，notes 用 textarea
        html += `<div class="archive-field"><span>目标：</span>`;
        html += `<input class="archive-input" data-field="goal" oninput="onArchiveFieldInput(this)"></div>`;
        html += `<div class="archive-field"><span>基调：</span>`;
        html += `<input class="archive-input" data-field="tone" oninput="onArchiveFieldInput(this)"></div>`;
        html += `<div class="archive-field"><span>备注：</span>`;
        html += `<textarea class="archive-textarea" data-field="notes" oninput="onArchiveFieldInput(this)"></textarea></div>`;
    } else {
        // 只读态
        html += `<div class="archive-field"><span>目标：</span>${escapeHTML(archive.goal || '—')}</div>`;
        html += `<div class="archive-field"><span>基调：</span>${escapeHTML(archive.tone || '—')}</div>`;
        html += `<div class="archive-field"><span>备注：</span>${escapeHTML(archive.notes || '—')}</div>`;
    }

    // 亮点（只读）
    if (archive.highlights && archive.highlights.length > 0) {
        html += `<div class="archive-field"><span>亮点：</span></div>`;
        html += '<ul class="archive-highlights">';
        archive.highlights.forEach(h => {
            html += `<li>${escapeHTML(h)}</li>`;
        });
        html += '</ul>';
    }

    // 归档时间（仅已归档态）
    if (source === 'archived') {
        const time = archive.archivedAt
            ? new Date(archive.archivedAt).toLocaleString()
            : '归档时间未知';
        html += `<div class="archive-footer">归档于：${time}</div>`;
    }

    box.innerHTML = html;

    // 编辑态：用 DOM 方式填充 value（避免属性上下文转义问题）
    if (editable) {
        box.querySelectorAll('.archive-input').forEach(inp => {
            inp.value = archive[inp.dataset.field] || '';
        });
        const ta = box.querySelector('.archive-textarea');
        if (ta) ta.value = archive.notes || '';
    }
}

// ============ 档案字段编辑（防抖保存 + 串行化避免读-改-写竞态） ============
const archiveSaveTimers = {};
let archiveSaveChain = Promise.resolve();

function onArchiveFieldInput(el) {
    // 捕获当前章节：即使 1s 内切换章节，也保存到原章节
    const chapterId = DataCore.getCurrentChapterId();
    const field = el.dataset.field;
    const value = el.value;
    const key = `${chapterId}:${field}`;

    // 只清除同字段的未决计时器；不同字段互不影响
    if (archiveSaveTimers[key]) clearTimeout(archiveSaveTimers[key]);
    archiveSaveTimers[key] = setTimeout(() => {
        delete archiveSaveTimers[key];
        // 串行化：后一个任务等前一个 getMemory→setMemory 完成后再执行
        // 这样后一个 getMemory 必然看到前一个的写入，消除竞态
        archiveSaveChain = archiveSaveChain
            .then(async () => {
                const memory = await DataCore.getMemory();
                if (memory.chapterArchives?.[chapterId]) {
                    memory.chapterArchives[chapterId][field] = value;
                    await DataCore.setMemory(memory);
                }
            })
            .catch(e => {
                console.error('[Archive] 字段保存失败:', e);
            });
    }, 1000);
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
    // 先失焦，避免 renderArchiveView 的焦点检查误判为"编辑中"
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }
    loadFinalizeData();
    refreshReportList();
    renderArchiveView();
});

// 记忆库变化时刷新档案展示（定稿/解锁/亮点写入都会触发）
DataCore.on('memory:updated', () => {
    renderArchiveView();
});