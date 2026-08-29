/*
 * stats.js — 落笔 写作统计：字数、时速
 */

// ============ 速度追踪变量 ============
let inputHistory = [];           // [{ time, count }]  记录绝对字数快照
let isBaselineReady = false;    // 基准是否已设置
let speedTimer = null;          // 独立定时器，每 2 秒刷新时速

// ============ 字数统计工具 ============
/**
 * 统计混合文本字数（中文按字符数，英文按单词数）
 * 例如："看到了 AI 系统" → 中文字符4个 + 英文单词1个 = 5字
 */
function countWords(text) {
    if (!text || !text.trim()) return 0;

    let total = 0;
    const trimmed = text.trim();

    let i = 0;
    let currentSegment = '';
    let isChineseSegment = null;

    function flushSegment() {
        if (!currentSegment) return;
        if (isChineseSegment) {
            total += currentSegment.length;
        } else {
            const words = currentSegment.trim().split(/\s+/).filter(w => w.length > 0);
            total += words.length;
        }
        currentSegment = '';
        isChineseSegment = null;
    }

    for (; i < trimmed.length; i++) {
        const char = trimmed[i];
        const isChinese = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/.test(char);

        if (isChineseSegment === null) {
            isChineseSegment = isChinese;
            currentSegment = char;
        } else if (isChineseSegment === isChinese) {
            currentSegment += char;
        } else {
            flushSegment();
            isChineseSegment = isChinese;
            currentSegment = char;
        }
    }
    flushSegment();

    return total;
}

/**
 * 统计当前章节字数
 */
function getCurrentChapterWordCount() {
    const editor = document.getElementById('editor');
    return editor ? countWords(editor.value) : 0;
}

/**
 * 统计全书总字数（基于 DataCore）
 */
function getTotalWordCount() {
    let total = 0;
    total += getCurrentChapterWordCount();
    const toc = DataCore.getToc();
    const currentId = DataCore.getCurrentChapterId();

    function collect(node) {
        if (node.type === 'chapter' && node.id !== currentId) {
            const content = DataCore.getChapterContent(node.id) || '';
            total += countWords(content);
        }
        if (node.children) {
            node.children.forEach(collect);
        }
    }
    toc.forEach(collect);
    return total;
}

// ============ 速度计算（定时刷新 + 绝对字数快照） ============

/**
 * 记录当前字数快照（由定时器每 2 秒调用）
 */
function updateSpeed() {
    if (!isBaselineReady) return;

    const now = Date.now();
    const currentCount = getCurrentChapterWordCount();

    // 记录绝对字数快照
    inputHistory.push({ time: now, count: currentCount });

    // 只保留最近 3 分钟
    const threeMinutesAgo = now - 3 * 60 * 1000;
    inputHistory = inputHistory.filter(h => h.time >= threeMinutesAgo);
}

/**
 * 基于最近 2 分钟窗口计算时速
 */
function getPredictedHourlySpeed() {
    if (!isBaselineReady || inputHistory.length < 2) return null;

    const now = Date.now();
    const twoMinutesAgo = now - 2 * 60 * 1000;

    // 取最近 2 分钟内的记录
    const recentHistory = inputHistory.filter(h => h.time >= twoMinutesAgo);

    let first, last;
    if (recentHistory.length >= 2) {
        first = recentHistory[0];
        last = recentHistory[recentHistory.length - 1];
    } else {
        first = inputHistory[0];
        last = inputHistory[inputHistory.length - 1];
    }

    const elapsed = (last.time - first.time) / 60000; // 分钟
    if (elapsed < 0.05) return null;                   // 不足 3 秒不计算

    // 用绝对字数差：删字后差值变小甚至归零
    const wordsAdded = last.count - first.count;
    if (wordsAdded <= 0) return 0;                     // 明确归零

    return Math.round((wordsAdded / elapsed) * 60);
}

// ============ UI 更新 ============

/**
 * 更新字数显示（即时）
 */
function updateStatsDisplay() {
    const chapterEl = document.getElementById('statChapter');
    const totalEl = document.getElementById('statTotal');
    if (chapterEl) chapterEl.textContent = getCurrentChapterWordCount();
    if (totalEl) totalEl.textContent = getTotalWordCount();
}

/**
 * 更新时速显示（由定时器调用）
 */
function updateSpeedDisplay() {
    const speedEl = document.getElementById('statSpeed');
    if (!speedEl) return;
    const hourly = getPredictedHourlySpeed();
    if (hourly === null) {
        speedEl.textContent = '--';
    } else {
        speedEl.textContent = hourly;
    }
}

// ============ 初始化 ============
function initStats() {
    const editor = document.getElementById('editor');
    if (!editor) return;

    // 设置基准：取当前编辑器字数作为起点
    const initialCount = getCurrentChapterWordCount();
    inputHistory = [{ time: Date.now(), count: initialCount }];
    isBaselineReady = true;

    // 立即更新字数显示，时速初始为空
    updateStatsDisplay();
    const speedEl = document.getElementById('statSpeed');
    if (speedEl) speedEl.textContent = '--';

    // 启动独立定时器：每 2 秒记录快照 + 刷新时速
    clearInterval(speedTimer);
    speedTimer = setInterval(() => {
        updateSpeed();
        updateSpeedDisplay();
    }, 2000);

    // 订阅 DataCore 内容变化事件，作为保存后的兜底更新
    DataCore.on('chapter:contentChanged', updateStatsDisplay);

    // 专注模式进入时刷新
    const focusBtn = document.getElementById('focusModeBtn');
    if (focusBtn) {
        focusBtn.addEventListener('click', () => {
            setTimeout(() => {
                updateStatsDisplay();
                updateSpeedDisplay();
            }, 500);
        });
    }
}

// 页面初始化
window.addEventListener('DOMContentLoaded', () => {
    initStats();
});