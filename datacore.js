/*
 * datacore.js — 落笔 统一数据核心
 * 数据持久化：IndexedDB 优先，localStorage fallback
 * 加载顺序：第一个（在 config.js 之前）
 */

const DataCore = (() => {
    'use strict';

    // ============ IndexedDB 封装 ============
    const DB_NAME = 'luobi-db';
    const DB_VERSION = 1;
    const DB_STORE = 'keyval';
    let db = null;
    let useIndexedDB = true;

    function openDB() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const d = e.target.result;
                if (!d.objectStoreNames.contains(DB_STORE)) {
                    d.createObjectStore(DB_STORE);
                }
            };

            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };

            request.onerror = (e) => {
                useIndexedDB = false;
                reject(e);
            };
        });
    }

    async function dbGet(key) {
        if (!useIndexedDB) return null;
        try {
            const d = await openDB();
            return new Promise((resolve, reject) => {
                const tx = d.transaction(DB_STORE, 'readonly');
                const store = tx.objectStore(DB_STORE);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = reject;
            });
        } catch (e) {
            useIndexedDB = false;
            return null;
        }
    }

    async function dbSet(key, value) {
        if (!useIndexedDB) return;
        try {
            const d = await openDB();
            return new Promise((resolve, reject) => {
                const tx = d.transaction(DB_STORE, 'readwrite');
                const store = tx.objectStore(DB_STORE);
                store.put(value, key);
                tx.oncomplete = resolve;
                tx.onerror = reject;
            });
        } catch (e) {
            useIndexedDB = false;
        }
    }

    async function dbDelete(key) {
        if (!useIndexedDB) return;
        try {
            const d = await openDB();
            return new Promise((resolve, reject) => {
                const tx = d.transaction(DB_STORE, 'readwrite');
                const store = tx.objectStore(DB_STORE);
                store.delete(key);
                tx.oncomplete = resolve;
                tx.onerror = reject;
            });
        } catch (e) {
            useIndexedDB = false;
        }
    }

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
            sidebarWidth: 240,
            aiPaneWidth: 340,
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

    // ============ 持久化（IndexedDB + localStorage fallback） ============

    async function _loadFromStorage() {
        let loadedMain = null;
        let loadedContent = null;
        let loadedMemory = null;

        if (useIndexedDB) {
            loadedMain = await dbGet('main');
            loadedContent = await dbGet('chapters-content');
            loadedMemory = await dbGet('memory');
        }

        // 如果 IndexedDB 没有数据，尝试从 localStorage 迁移
        if (!loadedMain) {
            const localMain = localStorage.getItem('luobi-datacore');
            const localContent = localStorage.getItem('luobi-chapters-content');
            if (localMain) {
                const legacyMain = JSON.parse(localMain);
                loadedMain = {
                    ...legacyMain,
                    chapters: {
                        ...(legacyMain.chapters || {}),
                        toc: legacyMain.chapters?.toc || legacyMain.toc || [],
                        currentChapterId: legacyMain.chapters?.currentChapterId || legacyMain.currentChapterId || null
                    }
                };
                loadedContent = localContent ? JSON.parse(localContent) : {};
                // 迁移到 IndexedDB
                if (useIndexedDB) {
                    await dbSet('main', loadedMain);
                    await dbSet('chapters-content', loadedContent);
                }
            }
        }

        if (!loadedMemory) {
            const localMemory = localStorage.getItem('luobi-memory');
            if (localMemory) {
                loadedMemory = JSON.parse(localMemory);
                if (useIndexedDB) {
                    await dbSet('memory', loadedMemory);
                }
            }
        }

        // 把加载的数据填入 _state
        if (loadedMain) {
            if (loadedMain.ui) _state.ui = { ..._state.ui, ...loadedMain.ui };
            if (loadedMain.sessions) _state.sessions = loadedMain.sessions;
            if (loadedMain.currentSessionId) _state.currentSessionId = loadedMain.currentSessionId;
            if (loadedMain.chapters && loadedMain.chapters.toc) _state.chapters.toc = loadedMain.chapters.toc;
            if (loadedMain.chapters && loadedMain.chapters.currentChapterId) _state.chapters.currentChapterId = loadedMain.chapters.currentChapterId;
            if (loadedMain.currentRole) _state.currentRole = loadedMain.currentRole;
            if (loadedMain.background) _state.background = loadedMain.background;
            if (loadedMain.finalize) _state.finalize = loadedMain.finalize;
            if (loadedMain.apiKey) _state.apiKey = loadedMain.apiKey;
        }

        if (loadedContent) {
            _state.chapters.content = loadedContent;
        } else {
            _state.chapters.content = {};
        }
    }

    async function _saveToStorage() {
        const toSave = {
            ui: _state.ui,
            sessions: _state.sessions,
            currentSessionId: _state.currentSessionId,
            chapters: {
                toc: _state.chapters.toc,
                currentChapterId: _state.chapters.currentChapterId
            },
            currentRole: _state.currentRole,
            background: _state.background,
            finalize: _state.finalize,
            apiKey: _state.apiKey
        };

        if (useIndexedDB) {
            await dbSet('main', toSave);
            await dbSet('chapters-content', _state.chapters.content);
        } else {
            // fallback
            localStorage.setItem('luobi-datacore', JSON.stringify(toSave));
            localStorage.setItem('luobi-chapters-content', JSON.stringify(_state.chapters.content));
        }
    }

    async function init() {
        try {
            await openDB();
            await _loadFromStorage();
        } catch (e) {
            useIndexedDB = false;
            await _loadFromStorage();
        }
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
        _saveToStorage();
        emit('role:switched', role);
    }

    // ---- 记忆库 ----
    async function getMemory() {
        if (useIndexedDB) {
            const mem = await dbGet('memory');
            if (mem) return mem;
        }
        const localMem = localStorage.getItem('luobi-memory');
        return localMem ? JSON.parse(localMem) : { characters: {}, foreshadows: [], settings: "" };
    }

    async function setMemory(memory) {
        if (useIndexedDB) {
            await dbSet('memory', memory);
        } else {
            localStorage.setItem('luobi-memory', JSON.stringify(memory));
        }
        emit('memory:updated', memory);
    }

    async function updateMemory(updates) {
        const memory = await getMemory();
        Object.assign(memory, updates);
        await setMemory(memory);
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
})();