/*
 * search.js — 查找与替换（最终稳定版）
 */

let searchResults = [];
let currentResultIndex = -1;
let searchBound = false;

// ============ 打开/关闭 ============
function openSearch(replaceMode) {
    const bar = document.getElementById('searchOverlay');
    if (!bar) return;
    bar.style.display = 'flex';
    const input = document.getElementById('searchInput');
    
    if (!searchBound) {
        input.addEventListener('input', doSearch);
        input.addEventListener('keydown', handleSearchKey);
        document.getElementById('replaceInput').addEventListener('keydown', handleReplaceKey);
        searchBound = true;
    }
    
    input.focus();
    if (replaceMode) {
        document.getElementById('replaceRow').style.display = '';
    } else {
        document.getElementById('replaceRow').style.display = 'none';
    }
}

function closeSearch() {
    document.getElementById('searchOverlay').style.display = 'none';
    clearHighlights();
    document.getElementById('editor').focus();
}

function toggleReplace() {
    const row = document.getElementById('replaceRow');
    row.style.display = row.style.display === 'none' ? '' : 'none';
}

// ============ 搜索 ============
function doSearch() {
    const editor = document.getElementById('editor');
    const query = document.getElementById('searchInput').value;
    searchResults = [];
    currentResultIndex = -1;
    if (!query) {
        document.getElementById('searchCount').textContent = '';
        return;
    }
    const text = editor.value;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let pos = 0;
    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
        searchResults.push(pos);
        pos += query.length;
    }
    document.getElementById('searchCount').textContent =
        searchResults.length > 0 ? `1/${searchResults.length}` : '无匹配';
    if (searchResults.length > 0) {
        currentResultIndex = 0;
        goToResult(0, false);  // 自动搜索：不抢焦点
    }
}

function goToResult(index, keepFocus = false) {
    const editor = document.getElementById('editor');
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value;
    if (!query || searchResults.length === 0) return;
    if (index < 0) index = searchResults.length - 1;
    if (index >= searchResults.length) index = 0;
    currentResultIndex = index;
    const pos = searchResults[index];

    // 选中匹配文本（编辑器需要临时获得焦点以显示选区）
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(pos, pos + query.length);

    // 精准滚动到匹配位置
    const textBefore = editor.value.substring(0, pos);
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `position:absolute;visibility:hidden;white-space:pre-wrap;width:${editor.clientWidth}px;font:${getComputedStyle(editor).font};line-height:${getComputedStyle(editor).lineHeight};padding:${getComputedStyle(editor).padding};box-sizing:border-box;`;
    tempDiv.textContent = textBefore;
    document.body.appendChild(tempDiv);
    const offsetHeight = tempDiv.offsetHeight;
    document.body.removeChild(tempDiv);
    const editorHeight = editor.clientHeight;
    const targetScroll = Math.max(0, offsetHeight - editorHeight / 3);
    editor.scrollTop = targetScroll;

    document.getElementById('searchCount').textContent = `${index + 1}/${searchResults.length}`;

    // 焦点策略：手动导航时保持编辑器焦点以显示高亮，自动搜索时焦点还给查找框
    if (keepFocus) {
        editor.focus();
    } else {
        searchInput.focus();
    }
}

function findNext() {
    if (searchResults.length) goToResult(currentResultIndex + 1, true);
}

function findPrev() {
    if (searchResults.length) goToResult(currentResultIndex - 1, true);
}

// ============ 替换 ============
function replaceOne() {
    const editor = document.getElementById('editor');
    const query = document.getElementById('searchInput').value;
    const replacement = document.getElementById('replaceInput').value;
    if (!query || searchResults.length === 0) return;
    const pos = searchResults[currentResultIndex];
    editor.value = editor.value.substring(0, pos) + replacement + editor.value.substring(pos + query.length);
    const delta = replacement.length - query.length;
    searchResults.splice(currentResultIndex, 1);
    for (let i = currentResultIndex; i < searchResults.length; i++) searchResults[i] += delta;
    if (searchResults.length) {
        if (currentResultIndex >= searchResults.length) currentResultIndex = 0;
        goToResult(currentResultIndex, true);
    } else {
        document.getElementById('searchCount').textContent = '无匹配';
    }
    editor.focus();
    autoSave();
}

function replaceAll() {
    const editor = document.getElementById('editor');
    const query = document.getElementById('searchInput').value;
    const replacement = document.getElementById('replaceInput').value;
    if (!query) return;
    const count = searchResults.length;
    for (let i = count - 1; i >= 0; i--) {
        const pos = searchResults[i];
        editor.value = editor.value.substring(0, pos) + replacement + editor.value.substring(pos + query.length);
    }
    searchResults = [];
    currentResultIndex = -1;
    document.getElementById('searchCount').textContent = `已替换${count}处`;
    editor.focus();
    autoSave();
}

function clearHighlights() {
    const editor = document.getElementById('editor');
    editor.setSelectionRange(0, 0);
    searchResults = [];
    currentResultIndex = -1;
}

function autoSave() {
    const id = DataCore.getCurrentChapterId();
    if (id) {
        DataCore.setChapterContent(id, document.getElementById('editor').value);
    }
}

// ============ 键盘事件 ============
function handleSearchKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? findPrev() : findNext(); }
    if (e.key === 'Escape') closeSearch();
}

function handleReplaceKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
    if (e.key === 'Escape') closeSearch();
}

// ============ 全局快捷键 ============
document.addEventListener('keydown', function(e) {
    const isCtrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const editor = document.getElementById('editor');
    const activeEl = document.activeElement;

    // 焦点在查找/替换框 → 只处理查找框内部事件，不处理全局快捷键
    if (activeEl && (activeEl.id === 'searchInput' || activeEl.id === 'replaceInput')) return;

    // 焦点在编辑器中，且还有搜索记录 → Enter 跳转
    if (key === 'enter' && activeEl === editor && searchResults.length > 0 && !e.shiftKey) {
        e.preventDefault();
        findNext();
        return;
    }

    if (isCtrl && key === 'f') { e.preventDefault(); openSearch(false); }
    if (isCtrl && key === 'h') { e.preventDefault(); openSearch(true); }
    if (isCtrl && key === 's' && activeEl === editor) {
        e.preventDefault();
        autoSave();
        showSaveTip();
    }
});

function showSaveTip() {
    const tip = document.createElement('div');
    tip.textContent = '✓ 已保存';
    tip.className = 'save-tip';
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 1200);
}

// ============ 订阅 DataCore 内容变化，实现动态查找 ============
DataCore.on('chapter:contentChanged', () => {
    const input = document.getElementById('searchInput');
    if (input && input.value) {
        doSearch();
    }
});