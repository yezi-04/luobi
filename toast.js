/*
 * toast.js — 落笔 顶部飘落通知系统
 * 用于非阻塞的用户反馈（成功/失败/提示）
 * 依赖：无
 */

/**
 * 显示一条 Toast 通知
 * @param {string} message - 通知内容
 * @param {string} type - 通知类型：'success' | 'error' | 'info'
 * @param {number} duration - 显示时长（毫秒），默认 3000
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // 触发进入动画
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // 自动移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);  // 等待退出动画结束
    }, duration);
}

/**
 * 成功通知
 */
function toastSuccess(message, duration) {
    showToast(message, 'success', duration);
}

/**
 * 错误通知
 */
function toastError(message, duration) {
    showToast(message, 'error', duration);
}

/**
 * 信息通知
 */
function toastInfo(message, duration) {
    showToast(message, 'info', duration);
}