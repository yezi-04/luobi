/*
 * diff.js — 落笔 文本差异比较引擎
 * 
 * 核心算法：基于 LCS（最长公共子序列）的动态规划实现
 * 提供行级和字符级两种粒度的文本差异比较
 * 
 * 依赖：无（纯原生 JS，不依赖任何第三方库）
 */

// ===================== 核心算法：LCS 计算 =====================

/**
 * 计算两个数组的最长公共子序列（LCS）
 * 算法：标准动态规划，时间复杂度 O(m×n)，空间复杂度 O(m×n)
 * @param {Array} a - 第一个数组
 * @param {Array} b - 第二个数组
 * @returns {Array} 最长公共子序列
 */
function computeLCS(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return [];
    const m = a.length, n = b.length;
    if (m === 0 || n === 0) return [];

    // 构建 DP 表
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // 回溯构建 LCS
    const lcs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            lcs.unshift(a[i - 1]); i--; j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    return lcs;
}

// ===================== 行级差异比对 =====================

/**
 * 计算两份文本的结构化差异（行级）
 * @param {string} oldText - 旧文本
 * @param {string} newText - 新文本
 * @returns {Array} 差异数组
 */
function computeDiff(oldText, newText) {
    if (typeof oldText !== 'string' || typeof newText !== 'string') return [];
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const lcs = computeLCS(oldLines, newLines);
    
    const result = [];
    let oi = 0, ni = 0, li = 0;
    while (oi < oldLines.length || ni < newLines.length) {
        if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li] &&
            ni < newLines.length && newLines[ni] === lcs[li]) {
            result.push({ type: 'unchanged', content: lcs[li] }); oi++; ni++; li++;
        } else {
            if (oi < oldLines.length && (li >= lcs.length || oldLines[oi] !== lcs[li])) {
                result.push({ type: 'removed', content: oldLines[oi] }); oi++;
            }
            if (ni < newLines.length && (li >= lcs.length || newLines[ni] !== lcs[li])) {
                result.push({ type: 'added', content: newLines[ni] }); ni++;
            }
        }
    }
    return result;
}

// ===================== 字符级差异比对 =====================

/**
 * 字符级差异比对（用于段落内精细比对）
 * @param {string} oldText - 旧文本
 * @param {string} newText - 新文本
 * @returns {Array} 每个字符的差异标记
 */
function computeCharDiff(oldText, newText) {
    if (typeof oldText !== 'string' || typeof newText !== 'string') return [];
    const oldChars = [...oldText];
    const newChars = [...newText];
    const lcs = computeLCS(oldChars, newChars);
    
    const result = [];
    let oi = 0, ni = 0, li = 0;
    while (oi < oldChars.length || ni < newChars.length) {
        if (li < lcs.length && oi < oldChars.length && oldChars[oi] === lcs[li] &&
            ni < newChars.length && newChars[ni] === lcs[li]) {
            result.push({ char: lcs[li], type: 'unchanged' }); oi++; ni++; li++;
        } else {
            if (oi < oldChars.length && (li >= lcs.length || oldChars[oi] !== lcs[li])) {
                result.push({ char: oldChars[oi], type: 'removed' }); oi++;
            }
            if (ni < newChars.length && (li >= lcs.length || newChars[ni] !== lcs[li])) {
                result.push({ char: newChars[ni], type: 'added' }); ni++;
            }
        }
    }
    return result;
}

// ===================== HTML 渲染 =====================

/**
 * 行级差异渲染为 HTML
 * @param {Array} diffResult - computeDiff() 的返回结果
 * @returns {string} HTML 字符串
 */
function renderDiffToHTML(diffResult) {
    if (!Array.isArray(diffResult) || diffResult.length === 0) {
        return '<p>两份文本完全相同，无差异。</p>';
    }
    let html = '<div class="diff-container">';
    diffResult.forEach(line => {
        switch (line.type) {
            case 'unchanged': html += `<div class="diff-line diff-unchanged">${escapeHTML(line.content)}</div>`; break;
            case 'added': html += `<div class="diff-line diff-added"><span class="diff-marker">+</span>${escapeHTML(line.content)}</div>`; break;
            case 'removed': html += `<div class="diff-line diff-removed"><span class="diff-marker">-</span>${escapeHTML(line.content)}</div>`; break;
        }
    });
    html += '</div>';
    return html;
}

/**
 * 字符级差异渲染为内联 HTML
 * @param {Array} charDiffResult - computeCharDiff() 的返回结果
 * @returns {string} HTML 字符串
 */
/**
 * 字符级差异渲染为内联 HTML（智能合并微小修改块）
 * @param {Array} charDiffResult - computeCharDiff() 的返回结果
 * @returns {string} HTML 字符串
 */
function renderCharDiffToHTML(charDiffResult) {
    if (!Array.isArray(charDiffResult) || charDiffResult.length === 0) return '';

    // 将差异数组分割成“块”，每个块是同类型的连续字符
    const blocks = [];
    let currentType = charDiffResult[0].type;
    let currentChars = [];
    
    charDiffResult.forEach(item => {
        if (item.type === currentType) {
            currentChars.push(item.char);
        } else {
            blocks.push({ type: currentType, text: currentChars.join('') });
            currentType = item.type;
            currentChars = [item.char];
        }
    });
    blocks.push({ type: currentType, text: currentChars.join('') });

    // 智能合并：如果遇到“删除+新增”连续交替的微小修改块，合并为一个“修改”块
    const mergedBlocks = [];
    let i = 0;
    while (i < blocks.length) {
        // 收集连续的 removed/added 块
        const temp = [];
        while (i < blocks.length && (blocks[i].type === 'removed' || blocks[i].type === 'added')) {
            temp.push(blocks[i]);
            i++;
        }

        if (temp.length > 0) {
            // 计算这些修改块的总长度
            const totalLen = temp.reduce((sum, b) => sum + b.text.length, 0);
            // 阈值：小于等于 15 个字符视为微修改，合并
            if (totalLen <= 15) {
                const oldText = temp.filter(b => b.type === 'removed').map(b => b.text).join('');
                const newText = temp.filter(b => b.type === 'added').map(b => b.text).join('');
                mergedBlocks.push({
                    type: 'modified',
                    oldText: oldText,
                    newText: newText,
                    text: newText // 显示新文本
                });
            } else {
                // 大段修改，保持原样
                mergedBlocks.push(...temp);
            }
        }

        // 添加非修改块（unchanged）
        if (i < blocks.length && blocks[i].type === 'unchanged') {
            mergedBlocks.push(blocks[i]);
            i++;
        }
    }

    // 渲染 HTML
    let html = '';
    mergedBlocks.forEach(block => {
        switch (block.type) {
            case 'unchanged':
                html += escapeHTML(block.text);
                break;
            case 'removed':
                html += `<span class="diff-char-removed">${escapeHTML(block.text)}</span>`;
                break;
            case 'added':
                html += `<span class="diff-char-added">${escapeHTML(block.text)}</span>`;
                break;
            case 'modified':
                const tooltip = `修改前：${block.oldText} → 修改后：${block.newText}`;
                html += `<span class="diff-char-modified" title="${escapeHTML(tooltip)}">${escapeHTML(block.text)}</span>`;
                break;
        }
    });

    return html;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===================== 未来扩展接口 =====================
async function computeSemanticDiff(oldText, newText) {
    throw new Error('[Diff] computeSemanticDiff 尚未实现');
}