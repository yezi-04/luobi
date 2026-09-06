<<<<<<< HEAD
/*
 * datacore.js — 落笔 统一数据核心
 * 所有模块通过 DataCore 读写数据，禁止直接操作 localStorage
 * 加载顺序：第一个（在 config.js 之前）
 */

const DataCore = (() => {
    'use strict';

    // ============ 私有数据 ============
    const _state = {
        chapters: {
            toc: [],
            currentChapterId: null,
            content: {}
        },
        sessions: {},
        currentSessionId: {},
        currentRole: 'style',
        rules: null,
        ui: {
            theme: 'default',
            sidebarOpen: true,
            aiPanelOpen: true,
            focusMode: false,
            deepThink: false,
            editorFontSize: 18,
            chatFontSize: 14,
            sidebarWidth: 240,     // ★ 新增
            aiPaneWidth: 340,      // ★ 新增
            rightPaneTab: 'ai'
        },
        background: {
            full: '',
            summary: ''
        },
        finalize: {},
        apiKey: ''
    };

    // ============ 事件系统 ============
    const _listeners = {};

    function on(event, callback) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(callback);
        return () => off(event, callback);
    }

    function off(event, callback) {
        if (!_listeners[event]) return;
        _listeners[event] = _listeners[event].filter(cb => cb !== callback);
    }

    function emit(event, data) {
        if (!_listeners[event]) return;
        _listeners[event].forEach(cb => {
            try { cb(data); } catch (e) { console.error(`[DataCore] 事件 ${event} 处理出错:`, e); }
        });
    }

    // ============ 持久化 ============
    function _loadFromStorage() {
        try {
            const saved = localStorage.getItem('luobi-datacore');
            if (saved) {
                const data = JSON.parse(saved);
                _state.ui = { ..._state.ui, ...(data.ui || {}) };
                _state.sessions = data.sessions || {};
                _state.currentSessionId = data.currentSessionId || {};
                _state.chapters.toc = data.toc || [];
                _state.chapters.currentChapterId = data.currentChapterId || null;
                _state.currentRole = data.currentRole || 'style';   // ★ 修复：恢复当前角色
                _state.background = data.background || { full: '', summary: '' };
                _state.finalize = data.finalize || {};
                _state.apiKey = data.apiKey || '';
            }
            const content = localStorage.getItem('luobi-chapters-content');
            if (content) {
                try {
                    _state.chapters.content = JSON.parse(content);
                } catch (e) {
                    console.error('[DataCore] 章节内容解析失败，重置为空', e);
                    _state.chapters.content = {};
                }
            } else {
                _state.chapters.content = {};
            }
        } catch (e) {
            console.error('[DataCore] 数据加载失败，使用默认值', e);
        }
    }

    function _saveToStorage() {
        try {
            const toSave = {
                ui: _state.ui,
                sessions: _state.sessions,
                currentSessionId: _state.currentSessionId,
                currentRole: _state.currentRole,   // ★ 新增：持久化当前角色
                toc: _state.chapters.toc,
                currentChapterId: _state.chapters.currentChapterId,
                background: _state.background,
                finalize: _state.finalize,
                apiKey: _state.apiKey
            };
            localStorage.setItem('luobi-datacore', JSON.stringify(toSave));
            localStorage.setItem('luobi-chapters-content', JSON.stringify(_state.chapters.content));
        } catch (e) {
            console.error('[DataCore] 数据保存失败', e);
        }
    }

    function init() {
        _loadFromStorage();
        if (typeof ruleConfig !== 'undefined') {
            _state.rules = JSON.parse(JSON.stringify(ruleConfig));
        }
        emit('core:initialized', _state);
    }

    // ============ 公共 API ============
    function getState() {
        return JSON.parse(JSON.stringify(_state));
    }

    // ---- 章节 ----
    function getChapterContent(nodeId) {
        return _state.chapters.content[nodeId] || '';
    }

    function setChapterContent(nodeId, content) {
        if (_state.chapters.content[nodeId] === content) return;
        _state.chapters.content[nodeId] = content;
        _saveToStorage();
        emit('chapter:contentChanged', { nodeId, content });
    }

    function getCurrentChapterId() {
        return _state.chapters.currentChapterId;
    }

    function setCurrentChapterId(nodeId) {
        const oldId = _state.chapters.currentChapterId;
        _state.chapters.currentChapterId = nodeId;
        _saveToStorage();
        emit('chapter:switched', { from: oldId, to: nodeId });
    }

    function getToc() {
        return JSON.parse(JSON.stringify(_state.chapters.toc));
    }

    function setToc(toc) {
        _state.chapters.toc = JSON.parse(JSON.stringify(toc));
        _saveToStorage();
        emit('toc:changed', _state.chapters.toc);
    }

    // ---- UI ----
    function getUI(key) {
        return _state.ui[key];
    }

    function setUI(key, value) {
        if (_state.ui[key] === value) return;
        _state.ui[key] = value;
        _saveToStorage();
        emit('ui:changed', { key, value });
    }

    // ---- 会话 ----
    function getSessions(role) {
        return role ? (_state.sessions[role] || []) : { ..._state.sessions };
    }

    function setSessions(role, sessions) {
        _state.sessions[role] = sessions;
        _saveToStorage();
        emit('sessions:changed', { role, sessions });
    }

    function getCurrentSessionId(role) {
        return _state.currentSessionId[role] || null;
    }

    function setCurrentSessionId(role, sessionId) {
        _state.currentSessionId[role] = sessionId;
        _saveToStorage();
    }

    // ---- 规则 ----
    function getRules() {
        return _state.rules;
    }

    function setRules(rules) {
        _state.rules = rules;
        if (typeof saveRuleConfig === 'function') saveRuleConfig();
    }

    // ---- 背景 ----
    function getBackground() {
        return _state.background.full || '';
    }

    function setBackground(text) {
        _state.background.full = text;
        _saveToStorage();
    }

    function getSettingSummary() {
        return _state.background.summary || '';
    }

    function setSettingSummary(text) {
        _state.background.summary = text;
        _saveToStorage();
    }

    // ---- 定稿 ----
    function getFinalizeData(chapterId) {
        return _state.finalize[chapterId] || null;
    }

    function setFinalizeData(chapterId, data) {
        _state.finalize[chapterId] = data;
        _saveToStorage();
        emit('finalize:changed', { chapterId, data });
    }

    // ---- API Key ----
    function getApiKey() {
        return _state.apiKey || '';
    }

    function setApiKey(key) {
        _state.apiKey = key.trim();
        _saveToStorage();
    }

    // ---- 角色 ----
    function getCurrentRole() {
        return _state.currentRole;
    }

    function setCurrentRole(role) {
        _state.currentRole = role;
        _saveToStorage();   // ★ 新增：切换角色时持久化
        emit('role:switched', role);
    }

    // ---- 记忆库 ----
    function getMemory() {
        try {
            const saved = localStorage.getItem('luobi-memory');
            return saved ? JSON.parse(saved) : {
                characters: {},
                foreshadows: [],
                settings: ""
            };
        } catch (e) {
            return { characters: {}, foreshadows: [], settings: "" };
        }
    }

    function setMemory(memory) {
        localStorage.setItem('luobi-memory', JSON.stringify(memory));
        emit('memory:updated', memory);
    }

    function updateMemory(updates) {
        const memory = getMemory();
        Object.assign(memory, updates);
        setMemory(memory);
    }

    // ============ 公开接口 ============
    return {
        init,
        on,
        off,
        emit,
        getState,

        getChapterContent,
        setChapterContent,
        getCurrentChapterId,
        setCurrentChapterId,
        getToc,
        setToc,

        getUI,
        setUI,

        getSessions,
        setSessions,
        getCurrentSessionId,
        setCurrentSessionId,

        getRules,
        setRules,

        getBackground,
        setBackground,
        getSettingSummary,
        setSettingSummary,

        getFinalizeData,
        setFinalizeData,

        getApiKey,
        setApiKey,

        getCurrentRole,
        setCurrentRole,

        getMemory,
        setMemory,
        updateMemory
    };
=======
/*
 * datacore.js — 落笔 统一数据核心
 * 所有模块通过 DataCore 读写数据，禁止直接操作 localStorage
 * 加载顺序：第一个（在 config.js 之前）
 */

const DataCore = (() => {
    'use strict';

    // ============ 私有数据 ============
    const _state = {
        chapters: {
            toc: [],
            currentChapterId: null,
            content: {}
        },
        sessions: {},
        currentSessionId: {},
        currentRole: 'style',
        rules: null,
        ui: {
            theme: 'default',
            sidebarOpen: true,
            aiPanelOpen: true,
            focusMode: false,
            deepThink: false,
            editorFontSize: 18,
            chatFontSize: 14,
            sidebarWidth: 240,     // ★ 新增
            aiPaneWidth: 340       // ★ 新增
        },
        background: {
            full: '',
            summary: ''
        },
        finalize: {},
        apiKey: ''
    };

    // ============ 事件系统 ============
    const _listeners = {};

    function on(event, callback) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(callback);
        return () => off(event, callback);
    }

    function off(event, callback) {
        if (!_listeners[event]) return;
        _listeners[event] = _listeners[event].filter(cb => cb !== callback);
    }

    function emit(event, data) {
        if (!_listeners[event]) return;
        _listeners[event].forEach(cb => {
            try { cb(data); } catch (e) { console.error(`[DataCore] 事件 ${event} 处理出错:`, e); }
        });
    }

    // ============ 持久化 ============
    function _loadFromStorage() {
        try {
            const saved = localStorage.getItem('luobi-datacore');
            if (saved) {
                const data = JSON.parse(saved);
                _state.ui = { ..._state.ui, ...(data.ui || {}) };
                _state.sessions = data.sessions || {};
                _state.currentSessionId = data.currentSessionId || {};
                _state.chapters.toc = data.toc || [];
                _state.chapters.currentChapterId = data.currentChapterId || null;
                _state.currentRole = data.currentRole || 'style';   // ★ 修复：恢复当前角色
                _state.background = data.background || { full: '', summary: '' };
                _state.finalize = data.finalize || {};
                _state.apiKey = data.apiKey || '';
            }
            const content = localStorage.getItem('luobi-chapters-content');
            if (content) {
                try {
                    _state.chapters.content = JSON.parse(content);
                } catch (e) {
                    console.error('[DataCore] 章节内容解析失败，重置为空', e);
                    _state.chapters.content = {};
                }
            } else {
                _state.chapters.content = {};
            }
        } catch (e) {
            console.error('[DataCore] 数据加载失败，使用默认值', e);
        }
    }

    function _saveToStorage() {
        try {
            const toSave = {
                ui: _state.ui,
                sessions: _state.sessions,
                currentSessionId: _state.currentSessionId,
                currentRole: _state.currentRole,   // ★ 新增：持久化当前角色
                toc: _state.chapters.toc,
                currentChapterId: _state.chapters.currentChapterId,
                background: _state.background,
                finalize: _state.finalize,
                apiKey: _state.apiKey
            };
            localStorage.setItem('luobi-datacore', JSON.stringify(toSave));
            localStorage.setItem('luobi-chapters-content', JSON.stringify(_state.chapters.content));
        } catch (e) {
            console.error('[DataCore] 数据保存失败', e);
        }
    }

    function init() {
        _loadFromStorage();
        if (typeof ruleConfig !== 'undefined') {
            _state.rules = JSON.parse(JSON.stringify(ruleConfig));
        }
        emit('core:initialized', _state);
    }

    // ============ 公共 API ============
    function getState() {
        return JSON.parse(JSON.stringify(_state));
    }

    // ---- 章节 ----
    function getChapterContent(nodeId) {
        return _state.chapters.content[nodeId] || '';
    }

    function setChapterContent(nodeId, content) {
        if (_state.chapters.content[nodeId] === content) return;
        _state.chapters.content[nodeId] = content;
        _saveToStorage();
        emit('chapter:contentChanged', { nodeId, content });
    }

    function getCurrentChapterId() {
        return _state.chapters.currentChapterId;
    }

    function setCurrentChapterId(nodeId) {
        const oldId = _state.chapters.currentChapterId;
        _state.chapters.currentChapterId = nodeId;
        _saveToStorage();
        emit('chapter:switched', { from: oldId, to: nodeId });
    }

    function getToc() {
        return JSON.parse(JSON.stringify(_state.chapters.toc));
    }

    function setToc(toc) {
        _state.chapters.toc = JSON.parse(JSON.stringify(toc));
        _saveToStorage();
        emit('toc:changed', _state.chapters.toc);
    }

    // ---- UI ----
    function getUI(key) {
        return _state.ui[key];
    }

    function setUI(key, value) {
        if (_state.ui[key] === value) return;
        _state.ui[key] = value;
        _saveToStorage();
        emit('ui:changed', { key, value });
    }

    // ---- 会话 ----
    function getSessions(role) {
        return role ? (_state.sessions[role] || []) : { ..._state.sessions };
    }

    function setSessions(role, sessions) {
        _state.sessions[role] = sessions;
        _saveToStorage();
        emit('sessions:changed', { role, sessions });
    }

    function getCurrentSessionId(role) {
        return _state.currentSessionId[role] || null;
    }

    function setCurrentSessionId(role, sessionId) {
        _state.currentSessionId[role] = sessionId;
        _saveToStorage();
    }

    // ---- 规则 ----
    function getRules() {
        return _state.rules;
    }

    function setRules(rules) {
        _state.rules = rules;
        if (typeof saveRuleConfig === 'function') saveRuleConfig();
    }

    // ---- 背景 ----
    function getBackground() {
        return _state.background.full || '';
    }

    function setBackground(text) {
        _state.background.full = text;
        _saveToStorage();
    }

    function getSettingSummary() {
        return _state.background.summary || '';
    }

    function setSettingSummary(text) {
        _state.background.summary = text;
        _saveToStorage();
    }

    // ---- 定稿 ----
    function getFinalizeData(chapterId) {
        return _state.finalize[chapterId] || null;
    }

    function setFinalizeData(chapterId, data) {
        _state.finalize[chapterId] = data;
        _saveToStorage();
        emit('finalize:changed', { chapterId, data });
    }

    // ---- API Key ----
    function getApiKey() {
        return _state.apiKey || '';
    }

    function setApiKey(key) {
        _state.apiKey = key.trim();
        _saveToStorage();
    }

    // ---- 角色 ----
    function getCurrentRole() {
        return _state.currentRole;
    }

    function setCurrentRole(role) {
        _state.currentRole = role;
        _saveToStorage();   // ★ 新增：切换角色时持久化
        emit('role:switched', role);
    }

    // ---- 记忆库 ----
    function getMemory() {
        try {
            const saved = localStorage.getItem('luobi-memory');
            return saved ? JSON.parse(saved) : {
                characters: {},
                foreshadows: [],
                settings: ""
            };
        } catch (e) {
            return { characters: {}, foreshadows: [], settings: "" };
        }
    }

    function setMemory(memory) {
        localStorage.setItem('luobi-memory', JSON.stringify(memory));
        emit('memory:updated', memory);
    }

    function updateMemory(updates) {
        const memory = getMemory();
        Object.assign(memory, updates);
        setMemory(memory);
    }

    // ============ 公开接口 ============
    return {
        init,
        on,
        off,
        emit,
        getState,

        getChapterContent,
        setChapterContent,
        getCurrentChapterId,
        setCurrentChapterId,
        getToc,
        setToc,

        getUI,
        setUI,

        getSessions,
        setSessions,
        getCurrentSessionId,
        setCurrentSessionId,

        getRules,
        setRules,

        getBackground,
        setBackground,
        getSettingSummary,
        setSettingSummary,

        getFinalizeData,
        setFinalizeData,

        getApiKey,
        setApiKey,

        getCurrentRole,
        setCurrentRole,

        getMemory,
        setMemory,
        updateMemory
    };
>>>>>>> 52d0b07cdba6ab31d13c22fa4808849409491158
})();