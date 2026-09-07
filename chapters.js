/*
 * chapters.js — 落笔 目录树管理、章节读写、导入导出、拖拽排序
 * 架构：DataCore 完全适配版，统一数据流
 */

// ===================== 全局 UI 状态 =====================
let contextMenuNodeId = null;
let dragNodeId = null;

// ===================== 目录树加载与持久化 =====================

function loadToc() {
    let toc = DataCore.getToc();
    if (!toc || toc.length === 0) {
        const volId = generateId();
        toc = [{
            id: volId, type: 'volume', title: '第一卷',
            children: [
                { id: generateId(), type: 'chapter', title: '第一章', parentId: volId },
                { id: generateId(), type: 'chapter', title: '第二章', parentId: volId },
                { id: generateId(), type: 'chapter', title: '第三章', parentId: volId }
            ]
        }];
        DataCore.setToc(toc);
    }
}

// ===================== 章节内容读写 =====================

function loadContent(nodeId) { return DataCore.getChapterContent(nodeId); }
function saveContent(nodeId, content) { DataCore.setChapterContent(nodeId, content); }

// ===================== 目录节点查找工具 =====================

function findNode(id, list = DataCore.getToc()) {
    for (const node of list) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNode(id, node.children);
            if (found) return found;
        }
    }
    return null;
}

function findParent(id, list = DataCore.getToc()) {
    for (const node of list) {
        if (node.children) {
            if (node.children.some(c => c.id === id)) return node;
            const found = findParent(id, node.children);
            if (found) return found;
        }
    }
    return null;
}

function findFirstChapter(list = DataCore.getToc()) {
    for (const node of list) {
        if (node.type === 'chapter') return node;
        if (node.children) {
            const found = findFirstChapter(node.children);
            if (found) return found;
        }
    }
    return null;
}

function isDescendant(ancestorId, nodeId) {
    const node = findNode(nodeId);
    if (!node) return false;
    if (node.parentId === ancestorId) return true;
    if (node.parentId) return isDescendant(ancestorId, node.parentId);
    return false;
}

function removeNode(id, list) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) { list.splice(i, 1); return true; }
        if (list[i].children && removeNode(id, list[i].children)) return true;
    }
    return false;
}

// ===================== 渲染目录树 =====================

function renderToc() {
    const tocData = DataCore.getToc();
    const tree = document.getElementById('tocTree');
    if (!tree) return;
    tree.innerHTML = '';

    function renderNode(node) {
        const li = document.createElement('li');
        li.className = `toc-item ${node.type === 'volume' ? 'toc-volume' : 'toc-chapter'}`;
        if (node.type === 'volume' && node.expanded) li.classList.add('expanded');
        li.draggable = true;
        li.dataset.nodeId = node.id;
        if (node.id === DataCore.getCurrentChapterId()) li.classList.add('active');

        const icon = document.createElement('span');
        icon.className = 'toc-icon';
        icon.textContent = node.type === 'volume' ? (node.expanded ? '📂' : '📁') : '📄';
        li.appendChild(icon);

        const title = document.createElement('span');
        title.className = 'toc-title';
        title.innerHTML = node.title + (typeof getFinalizeBadge === 'function' ? getFinalizeBadge(node.id) : '');
        li.appendChild(title);

        // ★ 单击：卷则折叠/展开，章则打开
        li.addEventListener('click', (e) => {
            e.stopPropagation();
            if (node.type === 'volume') {
                node.expanded = !node.expanded;
                DataCore.setToc(tocData);
                renderToc();
            } else {
                openChapter(node.id);
            }
        });

        // 右键菜单
        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            contextMenuNodeId = node.id;
            updateContextMenu(node.type);
            const menu = document.getElementById('contextMenu');
            if (menu) {
                menu.style.display = 'block';
                menu.style.left = e.pageX + 'px';
                menu.style.top = e.pageY + 'px';
            }
        });

        // 双击重命名
        li.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            startRename(node.id);
        });

        tree.appendChild(li);

        if (node.type === 'volume' && node.expanded && node.children) {
            node.children.forEach(child => renderNode(child));
        }
    }

    tocData.forEach(node => renderNode(node));
}
/**
 * 根据节点类型动态显示/隐藏右键菜单项
 * @param {string} nodeType - 'volume' 或 'chapter'
 */
function updateContextMenu(nodeType) {
    const exportItem = document.getElementById('contextExport');
    if (exportItem) {
        // 仅章节显示「导出本章」，卷不显示
        exportItem.style.display = (nodeType === 'chapter') ? '' : 'none';
    }
    // 其他菜单项对卷和章节都显示，无需额外处理
}

document.addEventListener('click', () => {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
});

// ===================== 章节操作 =====================

function openChapter(nodeId) {
    const saveStatus = document.getElementById('saveStatus');
    if (saveStatus) {
        saveStatus.textContent = '';
        saveStatus.className = 'save-status';
    }
    const currentId = DataCore.getCurrentChapterId();
    if (currentId) saveContent(currentId, document.getElementById('editor').value);

    DataCore.setCurrentChapterId(nodeId);
    document.getElementById('editor').value = loadContent(nodeId) || '';
    document.getElementById('editor').readOnly = false;
    renderToc();

    if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
    if (typeof loadFinalizeData === 'function') loadFinalizeData();
}

function addVolume() {
    const tocData = DataCore.getToc();
    const volId = generateId();
    tocData.push({ id: volId, type: 'volume', title: '新卷', expanded: true, children: [] });
    DataCore.setToc(tocData);
    renderToc();
    setTimeout(() => startRename(volId), 100);
}

function addChapter() {
    const tocData = DataCore.getToc();
    let parentVolume = null;

    const currentId = DataCore.getCurrentChapterId();
    if (currentId) {
        const currentNode = findNode(currentId, tocData);
        if (currentNode) {
            parentVolume = currentNode.type === 'volume' ? currentNode : findParent(currentId, tocData);
        }
    }

    if (!parentVolume) {
        parentVolume = tocData.find(n => n.type === 'volume');
    }

    if (!parentVolume) {
        const volId = generateId();
        parentVolume = { id: volId, type: 'volume', title: '第一卷', expanded: true, children: [] };
        tocData.push(parentVolume);
    }

    if (!parentVolume.children) parentVolume.children = [];
    const chapterId = generateId();
    parentVolume.children.push({
        id: chapterId, type: 'chapter', title: '新章节', parentId: parentVolume.id
    });
    parentVolume.expanded = true;

    DataCore.setToc(tocData);
    renderToc();

    setTimeout(() => startRename(chapterId), 100);
}

function startRename(nodeId) {
    const tocData = DataCore.getToc();
    const node = findNode(nodeId, tocData);
    if (!node) return;

    const tryRename = () => {
        const li = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (!li) { setTimeout(tryRename, 50); return; }
        const titleSpan = li.querySelector('.toc-title');
        if (!titleSpan) { setTimeout(tryRename, 50); return; }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'toc-edit-input';
        input.value = node.title;
        titleSpan.replaceWith(input);
        input.focus();
        input.select();

        const finishRename = () => {
            const newTitle = input.value.trim() || node.title;
            node.title = newTitle;
            DataCore.setToc(tocData);
            renderToc();
        };

        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = node.title; input.blur(); }
        });
    };
    tryRename();
}

function renameNode() { if (contextMenuNodeId) startRename(contextMenuNodeId); }

function deleteNode() {
    if (!contextMenuNodeId) return;
    const tocData = DataCore.getToc();
    const node = findNode(contextMenuNodeId, tocData);
    if (!node) return;

    const label = node.type === 'volume' ? `卷「${node.title}」及其所有章节` : `章节「${node.title}」`;
    if (!confirm(`确定要删除 ${label} 吗？`)) return;

    if (contextMenuNodeId === DataCore.getCurrentChapterId()) {
        DataCore.setCurrentChapterId(null);
        document.getElementById('editor').value = '';
    }

    const deleteContentRecursive = (id) => {
        DataCore.setChapterContent(id, null);
        const n = findNode(id, tocData);
        if (n && n.children) n.children.forEach(c => deleteContentRecursive(c.id));
    };
    deleteContentRecursive(contextMenuNodeId);

    removeNode(contextMenuNodeId, tocData);
    DataCore.setToc(tocData);
    renderToc();
    contextMenuNodeId = null;
}

// ===================== 导入导出 =====================

function exportCurrentChapter() {
    const currentId = DataCore.getCurrentChapterId();
    if (!currentId) return alert('请先打开一个章节');
    const node = findNode(currentId);
    if (!node || node.type !== 'chapter') return alert('当前选中的不是章节');
    downloadTextFile(getChapterPath(currentId) + '.txt', loadContent(currentId) || '');
}

function exportAllChapters() {
    const tocData = DataCore.getToc();
    let output = '';
    function collect(node, depth) {
        if (node.type === 'volume') {
            output += '# '.repeat(depth) + node.title + '\n\n';
            if (node.children) node.children.forEach(c => collect(c, depth + 1));
        } else {
            output += '## '.repeat(depth) + node.title + '\n\n' + (loadContent(node.id) || '') + '\n\n---\n\n';
        }
    }
    tocData.forEach(node => collect(node, 0));
    downloadTextFile('落笔_全部章节_' + new Date().toISOString().slice(0, 10) + '.md', output);
}

function getChapterPath(nodeId) {
    const parts = [];
    let node = findNode(nodeId);
    while (node) { parts.unshift(node.title); node = findParent(node.id); }
    return parts.join('_');
}

function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(a.href);
}

function importFile(event) {
    const files = event.target.files;
    if (!files.length) return;
    const tocData = DataCore.getToc();

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const title = file.name.replace(/\.\w+$/, '');
            let parentVolume = tocData.find(n => n.type === 'volume');
            if (!parentVolume) { const volId = generateId(); parentVolume = { id: volId, type: 'volume', title: '导入', expanded: true, children: [] }; tocData.push(parentVolume); }
            const chapterId = generateId();
            parentVolume.children.push({ id: chapterId, type: 'chapter', title, parentId: parentVolume.id });
            parentVolume.expanded = true;
            saveContent(chapterId, content);
            DataCore.setToc(tocData);
            renderToc();
        };
        reader.readAsText(file);
    });
    event.target.value = '';
}

// ===================== 拖拽排序 =====================

function initDragSort() {
    const tree = document.getElementById('tocTree');
    if (!tree) return;

    tree.addEventListener('dragstart', (e) => {
        const li = e.target.closest('.toc-item');
        if (!li) return;
        dragNodeId = li.dataset.nodeId;
        li.classList.add('dragging');
    });

    tree.addEventListener('dragend', (e) => {
        const li = e.target.closest('.toc-item');
        if (li) li.classList.remove('dragging');
        dragNodeId = null;
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    tree.addEventListener('dragover', (e) => {
        e.preventDefault();
        const targetLi = e.target.closest('.toc-item');
        if (!targetLi || !dragNodeId) return;
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        if (targetLi.dataset.nodeId === dragNodeId) return;
        if (findNode(dragNodeId)?.type === 'volume' && isDescendant(dragNodeId, targetLi.dataset.nodeId)) return;
        targetLi.classList.add('drag-over');
    });

    tree.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetLi = e.target.closest('.toc-item');
        if (!targetLi || !dragNodeId) return;
        targetLi.classList.remove('drag-over');
        if (targetLi.dataset.nodeId === dragNodeId) return;

        const tocData = DataCore.getToc();
        const dragNode = findNode(dragNodeId, tocData);
        const targetNode = findNode(targetLi.dataset.nodeId, tocData);
        if (!dragNode || !targetNode) return;
        if (dragNode.type === 'volume' && isDescendant(dragNodeId, targetLi.dataset.nodeId)) return;

        removeNode(dragNodeId, tocData);

        if (targetNode.type === 'volume') {
            if (!targetNode.children) targetNode.children = [];
            targetNode.children.push(dragNode);
            dragNode.parentId = targetLi.dataset.nodeId;
        } else {
            const parent = findParent(targetLi.dataset.nodeId, tocData) || { children: tocData };
            const list = parent.children || tocData;
            const targetIndex = list.findIndex(n => n.id === targetLi.dataset.nodeId);
            list.splice(targetIndex >= 0 ? targetIndex + 1 : list.length, 0, dragNode);
            dragNode.parentId = targetNode.parentId || null;
        }

        DataCore.setToc(tocData);
        renderToc();
    });
}

// ===================== 自动保存 =====================

function initAutoSave() {
    const editor = document.getElementById('editor');
    const saveStatus = document.getElementById('saveStatus');
    let saveTimer;

    function setSaveStatus(text, className) {
        if (!saveStatus) return;
        saveStatus.textContent = text;
        saveStatus.className = 'save-status' + (className ? ' ' + className : '');
    }

    function doSave() {
        const currentId = DataCore.getCurrentChapterId();
        if (!currentId) return;

        setSaveStatus('保存中…', 'saving');

        try {
            saveContent(currentId, editor.value);
            setSaveStatus('✓ 已保存', 'saved');

            setTimeout(() => {
                setSaveStatus('', '');
            }, 2000);
        } catch (e) {
            setSaveStatus('⚠ 保存失败', 'error');
            console.error('自动保存失败:', e);
        }
    }

    editor.addEventListener('input', () => {
        clearTimeout(saveTimer);
        setSaveStatus('…', 'saving');
        saveTimer = setTimeout(doSave, 2000);
    });

    // 初始隐藏状态
    setSaveStatus('', '');
}
// ============ 右键菜单操作 ============

/**
 * 隐藏右键菜单
 */
function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
}

/**
 * 右键：新建章节
 * 基于当前右键选中的节点定位父卷
 */
function contextNewChapter() {
    const nodeId = contextMenuNodeId;
    if (!nodeId) return;

    // 临时将当前章节设置为右键节点，以便 addChapter 定位父卷
    const originalCurrentId = DataCore.getCurrentChapterId();
    DataCore.setCurrentChapterId(nodeId);
    addChapter();
    DataCore.setCurrentChapterId(originalCurrentId);

    hideContextMenu();
}

/**
 * 右键：新建卷
 */
function contextNewVolume() {
    addVolume();
    hideContextMenu();
}

/**
 * 右键：导入文件
 * 触发文件选择器，导入后的文件会挂载到当前卷或章节所属卷下（当前 importFile 逻辑为第一个卷，后续可优化）
 */
function contextImport() {
    const fileInput = document.getElementById('importFile');
    if (fileInput) {
        fileInput.click();
    }
    hideContextMenu();
}

/**
 * 右键：导出本章
 */
function contextExport() {
    const nodeId = contextMenuNodeId;
    if (nodeId && findNode(nodeId)?.type === 'chapter') {
        // 临时设置当前章节为所选章节，然后导出
        const originalCurrentId = DataCore.getCurrentChapterId();
        DataCore.setCurrentChapterId(nodeId);
        exportCurrentChapter();
        DataCore.setCurrentChapterId(originalCurrentId);
    }
    hideContextMenu();
}

// ===================== 初始化 =====================

function initChapters() {
    loadToc();
    renderToc();

    const currentId = DataCore.getCurrentChapterId();
    if (currentId) {
        document.getElementById('editor').value = loadContent(currentId) || '';
        renderToc();
    } else {
        const firstChapter = findFirstChapter();
        if (firstChapter) openChapter(firstChapter.id);
    }

    initDragSort();
    initAutoSave();
}