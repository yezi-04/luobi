/*
 * ui.js — 落笔 UI 控制：主题切换、面板显隐、专注模式、深度思考开关、拖拽分隔条
 * 数据源：统一通过 DataCore 的 UI 状态管理
 */

// ====================================================================
// 一、全局状态
// ====================================================================
let currentModel = 'deepseek-chat';   // 当前 AI 模型，可被 ai.js 读取

// ====================================================================
// 二、主题切换
// ====================================================================
function switchTheme(theme) {
    if (theme === 'default') {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', theme);
    }
    DataCore.setUI('theme', theme);
}

// ====================================================================
// 三、面板控制
// ====================================================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const collapsed = document.getElementById('sidebarCollapsed');
    const isOpen = sidebar.style.width !== '0px' && sidebar.style.display !== 'none';

    if (isOpen) {
        sidebar.style.width = '0px';
        sidebar.style.minWidth = '0px';
        sidebar.style.padding = '0px';
        sidebar.style.overflow = 'hidden';
        sidebar.style.borderRight = 'none';
        setTimeout(() => { sidebar.style.display = 'none'; }, 280);
        collapsed.style.display = 'flex';
        DataCore.setUI('sidebarOpen', false);
    } else {
        sidebar.style.display = '';
        sidebar.style.width = '';
        sidebar.style.minWidth = '';
        sidebar.style.padding = '';
        sidebar.style.overflow = '';
        sidebar.style.borderRight = '';
        collapsed.style.display = 'none';
        DataCore.setUI('sidebarOpen', true);
    }
}

function toggleAIPanel() {
    const aiPane = document.getElementById('aiPane');
    const btn = document.getElementById('aiToggleBtn');
    if (aiPane.style.display === 'none') {
        aiPane.style.display = '';
        btn.classList.add('active');
        DataCore.setUI('aiPanelOpen', true);
    } else {
        aiPane.style.display = 'none';
        btn.classList.remove('active');
        DataCore.setUI('aiPanelOpen', false);
    }
}

function toggleFocusMode() {
    const sidebar = document.getElementById('sidebar');
    const collapsed = document.getElementById('sidebarCollapsed');
    const aiPane = document.getElementById('aiPane');
    const btn = document.getElementById('focusModeBtn');
    const aiToggleBtn = document.getElementById('aiToggleBtn');
    const body = document.body;

    if (body.classList.contains('focus-mode')) {
        // 退出专注模式
        body.classList.remove('focus-mode');
        btn.classList.remove('active');
        btn.textContent = '🎯 专注模式';

        const sidebarOpen = DataCore.getUI('sidebarOpen') !== false;
        if (sidebarOpen) {
            sidebar.style.display = '';
            sidebar.style.width = '';
            sidebar.style.minWidth = '';
            sidebar.style.padding = '';
            sidebar.style.overflow = '';
            sidebar.style.borderRight = '';
            collapsed.style.display = 'none';
        } else {
            sidebar.style.display = 'none';
            sidebar.style.width = '0px';
            sidebar.style.minWidth = '0px';
            sidebar.style.padding = '0px';
            sidebar.style.overflow = 'hidden';
            sidebar.style.borderRight = 'none';
            collapsed.style.display = 'flex';
        }

        const aiPanelOpen = DataCore.getUI('aiPanelOpen') !== false;
        if (aiPanelOpen) {
            aiPane.style.display = '';
            if (aiToggleBtn) aiToggleBtn.classList.add('active');
        } else {
            aiPane.style.display = 'none';
            if (aiToggleBtn) aiToggleBtn.classList.remove('active');
        }

        DataCore.setUI('focusMode', false);
    } else {
        // 进入专注模式
        body.classList.add('focus-mode');
        btn.classList.add('active');
        btn.textContent = '🎯 退出专注';
        sidebar.style.display = 'none';
        sidebar.style.width = '0px';
        sidebar.style.minWidth = '0px';
        sidebar.style.padding = '0px';
        sidebar.style.overflow = 'hidden';
        sidebar.style.borderRight = 'none';
        collapsed.style.display = 'none';
        aiPane.style.display = 'none';
        if (aiToggleBtn) aiToggleBtn.classList.remove('active');
        DataCore.setUI('focusMode', true);
    }
}

// ====================================================================
// 四、深度思考开关
// ====================================================================
function toggleDeepThink() {
    const btn = document.getElementById('deepThinkBtn');
    const isDeepThink = DataCore.getUI('deepThink') !== true;
    currentModel = isDeepThink ? 'deepseek-reasoner' : 'deepseek-chat';
    DataCore.setUI('deepThink', isDeepThink);

    if (isDeepThink) {
        btn.classList.add('active');
        btn.textContent = '💭 深度思考 (开)';
    } else {
        btn.classList.remove('active');
        btn.textContent = '💭 深度思考';
    }
}

// ====================================================================
// 五、页面初始化
// ====================================================================
function initUIState() {
    // 恢复主题
    const savedTheme = DataCore.getUI('theme') || 'default';
    document.body.setAttribute('data-theme', savedTheme === 'default' ? '' : savedTheme);
    const selector = document.getElementById('theme-selector');
    if (selector) selector.value = savedTheme;

    // 恢复目录状态
    if (DataCore.getUI('sidebarOpen') === false) {
        const sidebar = document.getElementById('sidebar');
        const collapsed = document.getElementById('sidebarCollapsed');
        sidebar.style.display = 'none';
        sidebar.style.width = '0px';
        sidebar.style.minWidth = '0px';
        sidebar.style.padding = '0px';
        sidebar.style.overflow = 'hidden';
        sidebar.style.borderRight = 'none';
        collapsed.style.display = 'flex';
    }

    // 恢复 AI 面板状态
    if (DataCore.getUI('aiPanelOpen') === false) {
        document.getElementById('aiPane').style.display = 'none';
        document.getElementById('aiToggleBtn').classList.remove('active');
    }

    // 恢复专注模式
    if (DataCore.getUI('focusMode') === true) {
        toggleFocusMode();
    }

    // 恢复深度思考状态
    if (DataCore.getUI('deepThink') === true) {
        currentModel = 'deepseek-reasoner';
        const btn = document.getElementById('deepThinkBtn');
        if (btn) {
            btn.classList.add('active');
            btn.textContent = '💭 深度思考 (开)';
        }
    }
}

// ====================================================================
// 六、定稿面板切换
// ====================================================================
function toggleFinalizePanel() {
    const finalizePane = document.getElementById('finalizePane');
    const aiPane = document.getElementById('aiPane');
    const btn = document.getElementById('finalizeToggleBtn');
    if (!finalizePane || !aiPane) return;
    const isOpen = finalizePane.style.display !== 'none';
    if (isOpen) {
        finalizePane.style.display = 'none';
        if (btn) btn.classList.remove('active');
        if (DataCore.getUI('aiPanelOpen') !== false) aiPane.style.display = '';
    } else {
        finalizePane.style.display = '';
        if (btn) btn.classList.add('active');
        aiPane.style.display = 'none';
        saveDraft();
        updateFinalizeChapterBadge();
        if (typeof loadFinalizeData === 'function') loadFinalizeData();
        if (typeof refreshReportList === 'function') refreshReportList();
    }
}

function updateFinalizeChapterBadge() {
    const badge = document.getElementById('finalizeChapterBadge');
    if (!badge) return;
    const currentId = DataCore.getCurrentChapterId();
    if (currentId) {
        const node = findNode(currentId);
        badge.textContent = `当前：${node ? node.title : '未知章节'}`;
        badge.style.opacity = '1';
    } else {
        badge.textContent = '未选择章节';
        badge.style.opacity = '0.5';
    }
}

DataCore.on('chapter:switched', () => {
    updateFinalizeChapterBadge();
    if (typeof loadFinalizeData === 'function') loadFinalizeData();
    if (typeof refreshReportList === 'function') refreshReportList();
});

// ====================================================================
// 七、拖拽分隔条（干净版，无 DOM 残留）
// ====================================================================
function initResizeHandles() {
    const leftHandle = document.getElementById('resizeHandleLeft');
    const rightHandle = document.getElementById('resizeHandleRight');
    const sidebar = document.getElementById('sidebar');
    const aiPane = document.getElementById('aiPane');

    function restoreWidths() {
        const sw = DataCore.getUI('sidebarWidth');
        const aw = DataCore.getUI('aiPaneWidth');
        if (sw && sidebar) { sidebar.style.width = sw + 'px'; sidebar.style.minWidth = sw + 'px'; }
        if (aw && aiPane) { aiPane.style.width = aw + 'px'; aiPane.style.minWidth = aw + 'px'; }
    }
    restoreWidths();

    function createResize(handle, target, direction) {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = target.offsetWidth;
            document.body.classList.add('resizing');

            function onMouseMove(e) {
                const delta = direction === 'left' ? e.clientX - startX : startX - e.clientX;
                const newWidth = Math.max(160, Math.min(600, startWidth + delta));
                target.style.width = newWidth + 'px';
                target.style.minWidth = newWidth + 'px';
                target.style.flexShrink = '0';
            }

            function onMouseUp() {
                document.body.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                const finalWidth = target.offsetWidth;
                target.style.minWidth = finalWidth + 'px';
                if (direction === 'left') DataCore.setUI('sidebarWidth', finalWidth);
                else DataCore.setUI('aiPaneWidth', finalWidth);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    if (leftHandle && sidebar) createResize(leftHandle, sidebar, 'left');
    if (rightHandle && aiPane) createResize(rightHandle, aiPane, 'right');
}