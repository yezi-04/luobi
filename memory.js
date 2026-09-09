/*
 * memory.js — 落笔 长期记忆库
 * 定稿后自动提取人物状态、伏笔，并提供注入接口
 */

// ============ 记忆库读取 ============
function getMemory() { return DataCore.getMemory(); }
async function saveMemory(memory) { await DataCore.setMemory(memory); }

// ============ 自动提取（定稿后调用） ============
async function extractToMemory() {
    const id = DataCore.getCurrentChapterId();
    if (!id) return;
    const content = DataCore.getChapterContent(id) || '';
    if (!content.trim()) return;

    const chapterTitle = findNode(id)?.title || '未知章节';
    const apiKey = DataCore.getApiKey();
    if (!apiKey) return;

    const systemPrompt = `你是一个专业的文学记忆库提取器。请根据本章正文，提取以下结构化信息。严格按 JSON 格式输出，不要其他内容：

{
  "characters": {
    "角色名": {
      "status": "当前身体状态",
      "position": "当前位置"
    }
  },
  "foreshadows": [
    {
      "description": "新埋下的伏笔（30字以内）",
      "status": "open"
    }
  ],
  "resolvedForeshadows": [
    {
      "description": "本章回收的伏笔描述"
    }
  ]
}

如果没有新信息，对应字段留空数组或空对象。`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `章节名：${chapterTitle}\n\n正文：${content.substring(0, 8000)}` }
                ],
                stream: false
            })
        });

        const data = await response.json();
        const aiText = data.choices[0].message.content;
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);

        if (!jsonMatch) return;

        const extracted = JSON.parse(jsonMatch[0]);
        const memory = await getMemory();

        // 更新人物状态
        if (extracted.characters) {
            Object.entries(extracted.characters).forEach(([name, info]) => {
                memory.characters[name] = memory.characters[name] || {};
                Object.assign(memory.characters[name], info);
            });
        }

        // 添加新伏笔
        if (extracted.foreshadows?.length) {
            extracted.foreshadows.forEach(f => {
                memory.foreshadows.push({
                    ...f,
                    id: 'fs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                    chapterPlanted: chapterTitle
                });
            });
        }

        // 标记已回收伏笔
        if (extracted.resolvedForeshadows?.length) {
            extracted.resolvedForeshadows.forEach(rf => {
                const match = memory.foreshadows.find(f =>
                    f.description.includes(rf.description) || rf.description.includes(f.description)
                );
                if (match && match.status === 'open') {
                    match.status = 'resolved';
                    match.chapterResolved = chapterTitle;
                }
            });
        }

        await saveMemory(memory);
        console.log('[Memory] 记忆库已更新', memory);

    } catch (e) {
        console.warn('[Memory] 提取失败', e);
    }
}

// ============ 注入接口（供 askAI 调用） ============
async function getMemoryContext() {
    const memory = await getMemory();

    let context = '';

    // 人物状态
    const charKeys = Object.keys(memory.characters);
    if (charKeys.length > 0) {
        context += '【人物当前状态】\n';
        charKeys.forEach(name => {
            const info = memory.characters[name];
            context += `- ${name}：${JSON.stringify(info)}\n`;
        });
        context += '\n';
    }

    // 未回收伏笔
    const openForeshadows = memory.foreshadows.filter(f => f.status === 'open');
    if (openForeshadows.length > 0) {
        context += '【未回收伏笔（需在后续章节中回收）】\n';
        openForeshadows.forEach(f => {
            context += `- [第${f.chapterPlanted}章埋下] ${f.description}\n`;
        });
        context += '\n';
    }

    return context;
}