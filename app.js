/**
 * 极简英文 · 读与记 (Minimal English Reader)
 * Pure, offline-first mobile web application
 */

// --- Default Seed Data ---
const DEFAULT_ARTICLE = {
  id: 'seed-article-1',
  title: 'Stay Hungry, Stay Foolish',
  content: `Your time is limited, so don't waste it living someone else's life. Don't be trapped by dogma — which is living with the results of other people's thinking. Don't let the noise of others' opinions drown out your own inner voice.

And most important, have the courage to follow your heart and intuition. They somehow already know what you truly want to become. Everything else is secondary.

Stay Hungry. Stay Foolish. I have always wished that for myself. And now, as you graduate to begin anew, I wish that for you.`,
  translation: `你的时间有限，所以不要浪费时间去过别人的生活。不要被教条所束缚——那意味着生活在别人思考的结果里。不要让其他人观点的杂音淹没你内心的声音。

最重要的是，要有勇气跟随你的心与直觉。它们早已在某种程度上知晓你真正渴望成为怎样的人。其余的一切都是次要的。

求知若饥，虚心若愚。我一直以此自勉。如今在你们毕业重新启程之际，我亦将此作为对你们的期许。`,
  createdAt: new Date().toISOString()
};

const DEFAULT_WORDS = [
  {
    id: 'seed-word-1',
    word: 'dogma',
    phonetic: '/ˈdɒɡ.mə/',
    translation: '教条，教义',
    contextSentence: "Don't be trapped by dogma — which is living with the results of other people's thinking.",
    articleId: 'seed-article-1',
    articleTitle: 'Stay Hungry, Stay Foolish',
    mastered: false,
    createdAt: new Date().toISOString()
  },
  {
    id: 'seed-word-2',
    word: 'intuition',
    phonetic: '/ˌɪn.tʃuːˈɪʃ.ən/',
    translation: '直觉，本能感知',
    contextSentence: "And most important, have the courage to follow your heart and intuition.",
    articleId: 'seed-article-1',
    articleTitle: 'Stay Hungry, Stay Foolish',
    mastered: false,
    createdAt: new Date().toISOString()
  }
];

const DEFAULT_SETTINGS = {
  theme: 'warm',
  fontFamily: 'serif',
  fontSize: 18,
  deepseekKey: ''
};

// --- State Management ---
class AppState {
  constructor() {
    this.articles = this.loadStorage('minimal_articles', [DEFAULT_ARTICLE]);
    this.words = this.loadStorage('minimal_words', DEFAULT_WORDS);
    this.settings = this.loadStorage('minimal_settings', DEFAULT_SETTINGS);
    this.cache = this.loadStorage('minimal_word_cache', {});
    this.currentArticleId = null;
    this.activeInspectorWord = null;
    this.showTranslation = false;
  }

  loadStorage(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.warn('Storage read failed:', e);
      return fallback;
    }
  }

  saveArticles() {
    localStorage.setItem('minimal_articles', JSON.stringify(this.articles));
  }

  saveWords() {
    localStorage.setItem('minimal_words', JSON.stringify(this.words));
  }

  saveSettings() {
    localStorage.setItem('minimal_settings', JSON.stringify(this.settings));
  }

  getCached(word, sentence) {
    const key = `${word.toLowerCase().trim()}:::${(sentence || '').slice(0, 50)}`;
    return this.cache[key] || null;
  }

  setCached(word, sentence, data) {
    const key = `${word.toLowerCase().trim()}:::${(sentence || '').slice(0, 50)}`;
    this.cache[key] = data;
    try {
      localStorage.setItem('minimal_word_cache', JSON.stringify(this.cache));
    } catch (e) {}
  }

  getWord(wordStr) {
    const norm = wordStr.toLowerCase().trim();
    return this.words.find(w => w.word.toLowerCase() === norm);
  }

  addOrUpdateWord(wordObj) {
    const index = this.words.findIndex(w => w.word.toLowerCase() === wordObj.word.toLowerCase());
    if (index >= 0) {
      this.words[index] = { ...this.words[index], ...wordObj };
    } else {
      this.words.unshift(wordObj);
    }
    this.saveWords();
  }

  removeWord(wordStr) {
    const norm = wordStr.toLowerCase().trim();
    this.words = this.words.filter(w => w.word.toLowerCase() !== norm);
    this.saveWords();
  }
}

const state = new AppState();

// --- Speech Synthesis Helper ---
function speakWord(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

// --- Toast Notification ---
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toastMsg');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

// --- Word Lookup Service (DeepSeek AI & Fast Fallback) ---

async function fetchDeepSeekDefinition(word, sentence, apiKey) {
  const normWord = word.toLowerCase().trim();
  const cleanSentence = sentence ? sentence.trim() : '';

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的英语阅读与词典专家。请根据用户提供的英文单词和上下文句子，给出：\n1. phonetic: 国际音标（格式如 /ˈdɒɡmə/）\n2. contextMeaning: 结合上下文句子语境最精准贴切的中文含义（针对本文具体意思，简练准确）\n3. briefMeaning: 该单词常见词性及常规释义（如 n. 教条；信条）\n请严格只输出纯 JSON，必须包含这三个字段：{"phonetic":"...","contextMeaning":"...","briefMeaning":"..."}'
        },
        {
          role: 'user',
          content: `单词: ${normWord}\n上下文句子: ${cleanSentence || '无'}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 150
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const parsed = JSON.parse(data.choices[0]?.message?.content || '{}');
  return {
    word: normWord,
    phonetic: parsed.phonetic || '',
    contextMeaning: parsed.contextMeaning || '',
    translation: parsed.briefMeaning || parsed.contextMeaning || '',
    isAi: true
  };
}

async function fetchBaseDefinition(word) {
  const normWord = word.toLowerCase().trim();
  const result = {
    word: normWord,
    phonetic: '',
    meanings: [],
    translation: '',
    contextMeaning: '',
    isAi: false
  };

  try {
    const dictPromise = fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normWord)}`)
      .then(res => res.ok ? res.json() : null)
      .catch(() => null);

    // MyMemory with 3.5s timeout abort
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const transPromise = fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(normWord)}&langpair=en|zh-CN`, {
      signal: controller.signal
    })
      .then(res => res.ok ? res.json() : null)
      .catch(() => null)
      .finally(() => clearTimeout(timeoutId));

    const [dictData, transData] = await Promise.all([dictPromise, transPromise]);

    if (dictData && Array.isArray(dictData) && dictData.length > 0) {
      const entry = dictData[0];
      result.phonetic = entry.phonetic || (entry.phonetics && entry.phonetics.find(p => p.text)?.text) || '';
      if (entry.meanings) {
        result.meanings = entry.meanings.slice(0, 3).map(m => ({
          partOfSpeech: m.partOfSpeech,
          definition: m.definitions[0]?.definition || '',
          example: m.definitions[0]?.example || ''
        }));
      }
    }

    if (transData && transData.responseData && transData.responseData.translatedText) {
      const trans = transData.responseData.translatedText;
      if (!trans.toUpperCase().includes('QUERY LENGTH') && !trans.toUpperCase().includes('INVALID') && !trans.toUpperCase().includes('MYMEMORY')) {
        result.translation = trans;
      }
    }
  } catch (err) {
    console.warn('Base fetch error:', err);
  }

  return result;
}

// Quick validation ping for DeepSeek Key
async function testDeepSeekKey(apiKey) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 5
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return true;
}

// --- UI Rendering ---

// 1. Apply Settings
function applySettings() {
  document.body.setAttribute('data-theme', state.settings.theme);
  document.documentElement.style.setProperty(
    '--active-font',
    state.settings.fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)'
  );
  document.documentElement.style.setProperty('--article-font-size', `${state.settings.fontSize}px`);

  // Update settings pills
  document.querySelectorAll('.theme-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.themeVal === state.settings.theme);
  });
  document.querySelectorAll('.font-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.fontVal === state.settings.fontFamily);
  });

  const fontDisplay = document.getElementById('fontSizeDisplay');
  if (fontDisplay) fontDisplay.textContent = `${state.settings.fontSize}px`;
  const fontSlider = document.getElementById('fontSizeSlider');
  if (fontSlider) fontSlider.value = state.settings.fontSize;

  // DeepSeek UI state in Settings
  const keyInput = document.getElementById('inputDeepseekKey');
  const statusTag = document.getElementById('deepseekStatusTag');
  const btnClear = document.getElementById('btnClearDeepseekKey');

  if (keyInput && state.settings.deepseekKey) {
    keyInput.value = state.settings.deepseekKey;
    if (statusTag) {
      statusTag.textContent = '已开启 ✓';
      statusTag.style.backgroundColor = 'var(--success-light)';
      statusTag.style.color = 'var(--success)';
    }
    if (btnClear) btnClear.style.display = 'block';
  } else if (keyInput) {
    if (statusTag) {
      statusTag.textContent = '未开启';
      statusTag.style.backgroundColor = 'var(--accent-light)';
      statusTag.style.color = 'var(--accent)';
    }
    if (btnClear) btnClear.style.display = 'none';
  }
}

// 2. Render Article List
function renderArticleList() {
  const container = document.getElementById('articleListContainer');
  const countEl = document.getElementById('articleTotalCount');
  if (!container) return;

  countEl.textContent = `${state.articles.length} 篇`;

  if (state.articles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <h3>还没有文章</h3>
        <p>点击右上角「存文章」粘贴你的第一篇英语文章吧</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.articles.map(article => {
    const wordsCount = article.content.trim() ? article.content.trim().split(/\s+/).length : 0;
    const unknownWords = state.words.filter(w => w.articleId === article.id && !w.mastered);
    const dateStr = new Date(article.createdAt).toLocaleDateString();

    return `
      <div class="article-card" onclick="openReader('${article.id}')">
        <div class="article-card-header">
          <div class="article-card-title">${escapeHtml(article.title)}</div>
          <button class="btn-icon" style="width:28px; height:28px;" onclick="event.stopPropagation(); deleteArticle('${article.id}')" title="删除文章">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div class="article-card-snippet">${escapeHtml(article.content.substring(0, 140))}...</div>
        <div class="article-card-meta">
          <span>${wordsCount} 词</span>
          <span>•</span>
          <span>${dateStr}</span>
          ${unknownWords.length > 0 ? `<span class="badge-tag">🔖 ${unknownWords.length} 个生词</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// 3. Render Vocabulary List
function renderVocabList() {
  const container = document.getElementById('vocabListContainer');
  const countEl = document.getElementById('vocabTotalCount');
  const badgeEl = document.getElementById('vocabBadgeCount');
  const filterSelect = document.getElementById('vocabArticleFilter');
  const searchInput = document.getElementById('vocabSearchInput');

  if (!container) return;

  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const filterArticleId = filterSelect ? filterSelect.value : 'all';

  // Update article filter options
  if (filterSelect) {
    const currentVal = filterSelect.value;
    filterSelect.innerHTML = `<option value="all">所有文章</option>` +
      state.articles.map(a => `<option value="${a.id}">${escapeHtml(a.title)}</option>`).join('');
    filterSelect.value = currentVal || 'all';
  }

  // Filter words
  let filtered = state.words.filter(w => {
    const matchesArticle = filterArticleId === 'all' || w.articleId === filterArticleId;
    const matchesSearch = !searchTerm ||
      w.word.toLowerCase().includes(searchTerm) ||
      (w.translation && w.translation.toLowerCase().includes(searchTerm));
    return matchesArticle && matchesSearch;
  });

  const totalCount = state.words.filter(w => !w.mastered).length;
  countEl.textContent = `${totalCount} 个未掌握`;
  
  if (badgeEl) {
    if (totalCount > 0) {
      badgeEl.textContent = totalCount;
      badgeEl.style.display = 'block';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  const topBadge = document.getElementById('wordCountBadge');
  if (topBadge) topBadge.textContent = `${totalCount} 生词`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
        <h3>生词本是空的</h3>
        <p>在阅读文章时，轻点任意不会的单词即可一键存入生词本</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(w => {
    // Highlight word in context sentence
    let contextHtml = '';
    if (w.contextSentence) {
      const reg = new RegExp(`\\b(${escapeRegExp(w.word)})\\b`, 'gi');
      contextHtml = escapeHtml(w.contextSentence).replace(reg, '<mark>$1</mark>');
    }

    return `
      <div class="vocab-card" id="vocab-item-${escapeHtml(w.word)}">
        <div class="vocab-card-header">
          <div class="vocab-word-title">
            <span>${escapeHtml(w.word)}</span>
            ${w.phonetic ? `<span class="vocab-phonetic">${escapeHtml(w.phonetic)}</span>` : ''}
            <button class="btn-icon" style="width:28px; height:28px; color:var(--accent);" onclick="speakWord('${escapeJsString(w.word)}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
          </div>
          <div class="vocab-actions">
            <button class="btn-secondary" style="font-size:12px; padding:4px 8px;" onclick="toggleMastered('${escapeJsString(w.word)}')">
              ${w.mastered ? '重学' : '掌握 ✓'}
            </button>
            <button class="btn-icon" style="width:28px; height:28px; color:var(--text-muted);" onclick="deleteWord('${escapeJsString(w.word)}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="vocab-translation">${escapeHtml(w.translation || '暂无释义')}</div>

        ${contextHtml ? `<div class="vocab-context">“${contextHtml}”</div>` : ''}

        <div class="vocab-card-footer">
          ${w.articleId ? `
            <span class="vocab-source-link" onclick="openReader('${w.articleId}')">
              📖 来源: ${escapeHtml(w.articleTitle || '文章')}
            </span>
          ` : '<span>手动添加</span>'}
          <span>${new Date(w.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    `;
  }).join('');
}

// 4. Tokenize & Render Reader View
function openReader(articleId) {
  const article = state.articles.find(a => a.id === articleId);
  if (!article) return;

  state.currentArticleId = articleId;

  const readerContainer = document.getElementById('readerContainer');
  const titleEl = document.getElementById('readerArticleTitle');
  const headerTitleEl = document.getElementById('readerHeaderTitle');
  const wordsEl = document.getElementById('readerArticleWords');
  const savedWordsEl = document.getElementById('readerArticleSavedWords');
  const contentArea = document.getElementById('readerContentArea');

  titleEl.textContent = article.title;
  headerTitleEl.textContent = article.title;

  const totalWords = article.content.trim() ? article.content.trim().split(/\s+/).length : 0;
  const unknownInArticle = state.words.filter(w => w.articleId === articleId && !w.mastered);

  wordsEl.textContent = `${totalWords} 词`;
  savedWordsEl.textContent = `${unknownInArticle.length} 个生词已标记`;

  // Reset translation toggle state
  state.showTranslation = false;
  contentArea.classList.remove('show-translation');
  const btnTranslate = document.getElementById('btnToggleTranslate');
  if (btnTranslate) {
    btnTranslate.classList.remove('active', 'loading');
    const span = btnTranslate.querySelector('span');
    if (span) span.textContent = '译';
  }

  // Parse paragraphs and token words
  const paragraphs = article.content.split(/\n\s*\n/);
  const transParagraphs = article.translation ? article.translation.split(/\n\s*\n/) : [];
  
  contentArea.innerHTML = paragraphs.map((para, pIdx) => {
    // Regex splits by word boundaries while preserving whitespace and symbols
    const tokens = para.split(/([a-zA-Z]+(?:'[a-zA-Z]+)?)/g);

    const tokenHtml = tokens.map(token => {
      // If token is an English word
      if (/^[a-zA-Z]+(?:'[a-zA-Z]+)?$/.test(token)) {
        const norm = token.toLowerCase();
        const savedWord = state.getWord(norm);
        const isSaved = savedWord && !savedWord.mastered;

        return `<span class="word-token ${isSaved ? 'is-saved' : ''}" 
                      data-word="${escapeHtml(token)}" 
                      data-pidx="${pIdx}">${escapeHtml(token)}</span>`;
      } else {
        return escapeHtml(token);
      }
    }).join('');

    const transText = transParagraphs[pIdx] || '';
    return `<p data-p="${pIdx}">${tokenHtml}</p><div class="para-translation" data-p="${pIdx}">${escapeHtml(transText)}</div>`;
  }).join('');

  readerContainer.classList.add('active');
  window.scrollTo(0, 0);
}

function closeReader() {
  const readerContainer = document.getElementById('readerContainer');
  readerContainer.classList.remove('active');
  state.currentArticleId = null;
  state.showTranslation = false;
  renderArticleList();
  renderVocabList();
}

// 4.1 One-Click Full Article Translation (DeepSeek)
async function toggleArticleTranslation() {
  if (!state.currentArticleId) return;
  const article = state.articles.find(a => a.id === state.currentArticleId);
  if (!article) return;

  const btn = document.getElementById('btnToggleTranslate');
  const contentArea = document.getElementById('readerContentArea');
  const span = btn?.querySelector('span');

  // 1. If currently showing, hide it
  if (state.showTranslation) {
    state.showTranslation = false;
    contentArea.classList.remove('show-translation');
    btn?.classList.remove('active');
    showToast('已隐藏中文对照');
    return;
  }

  // 2. If article already has cached translation, show immediately (0ms)
  if (article.translation) {
    state.showTranslation = true;
    contentArea.classList.add('show-translation');
    btn?.classList.add('active');
    showToast('已开启中英对照');
    return;
  }

  // 3. Needs DeepSeek translation
  if (!state.settings.deepseekKey) {
    showToast('请先在【设置】中填入 DeepSeek API Key 即可一键全文翻译');
    return;
  }

  btn?.classList.add('loading');
  if (span) span.textContent = '...';
  showToast('🤖 DeepSeek 正在翻译全文，请稍候...');

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.settings.deepseekKey.trim()}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一位精通中英双语的文学级翻译专家。请将用户提供的英文文章翻译为通顺、地道、优雅的中文。\n【极其重要要求】：必须与原文的段落结构严格一一对应，每个段落之间用两个换行符(\\n\\n)分隔。不要输出任何额外的开场白、解说、标题或 Markdown 标记，只输出对应翻译后的中文段落。'
          },
          {
            role: 'user',
            content: article.content
          }
        ],
        temperature: 0.3
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const translatedText = data.choices[0]?.message?.content?.trim() || '';

    if (!translatedText) throw new Error('翻译结果为空');

    // Save translation into article
    article.translation = translatedText;
    state.saveArticles();

    // Attach translation to DOM
    const transParagraphs = translatedText.split(/\n\s*\n/);
    document.querySelectorAll('.para-translation').forEach((el, idx) => {
      el.textContent = transParagraphs[idx] || (idx === 0 ? translatedText : '');
    });

    state.showTranslation = true;
    contentArea.classList.add('show-translation');
    btn?.classList.add('active');
    showToast('✨ 全文翻译完成！已开启中英对照');
  } catch (err) {
    console.error('Full text translation error:', err);
    showToast(`全文翻译失败：${err.message || '网络错误'}`);
  } finally {
    btn?.classList.remove('loading');
    if (span) span.textContent = '译';
  }
}

// 5. Word Inspector Sheet
async function inspectWord(word, contextSentence) {
  const norm = word.toLowerCase().trim();
  const existing = state.getWord(norm);
  const article = state.articles.find(a => a.id === state.currentArticleId);

  state.activeInspectorWord = {
    word: norm,
    rawWord: word,
    contextSentence: contextSentence || '',
    articleId: state.currentArticleId,
    articleTitle: article ? article.title : '',
    phonetic: existing ? existing.phonetic : '',
    translation: existing ? existing.translation : '',
    mastered: existing ? existing.mastered : false
  };

  // UI elements
  const sheet = document.getElementById('wordBottomSheet');
  const backdrop = document.getElementById('sheetBackdrop');
  const sheetWord = document.getElementById('sheetWord');
  const sheetPhonetic = document.getElementById('sheetPhonetic');
  const sheetTransSourceLabel = document.getElementById('sheetTransSourceLabel');
  const sheetAiContextBox = document.getElementById('sheetAiContextBox');
  const sheetAiContextText = document.getElementById('sheetAiContextText');
  const sheetTransText = document.getElementById('sheetTranslationText');
  const sheetTransInput = document.getElementById('sheetTranslationInput');
  const sheetContextText = document.getElementById('sheetContextText');
  const sheetDefsContainer = document.getElementById('sheetDefinitionsContainer');

  sheetWord.textContent = word;
  sheetPhonetic.textContent = existing?.phonetic || '...';
  sheetTransInput.value = existing?.translation || '';
  sheetTransInput.style.display = 'none';
  sheetDefsContainer.innerHTML = '';
  sheetAiContextBox.style.display = 'none';

  // Context sentence with highlight
  if (contextSentence) {
    const reg = new RegExp(`\\b(${escapeRegExp(word)})\\b`, 'gi');
    sheetContextText.innerHTML = escapeHtml(contextSentence).replace(reg, '<mark>$1</mark>');
  } else {
    sheetContextText.textContent = '未提取到上下文原句';
  }

  // Update save button state
  updateInspectorSaveButton();

  // Show bottom sheet
  sheet.classList.add('active');
  backdrop.classList.add('active');

  // Automatically pronounce
  speakWord(word);

  // If already in vocabulary, display directly
  if (existing && existing.translation) {
    sheetTransSourceLabel.innerHTML = '已存生词笔记';
    sheetTransText.textContent = existing.translation;
    return;
  }

  // Check cache first (0ms instant response)
  const cached = state.getCached(norm, contextSentence);
  if (cached) {
    if (cached.phonetic) sheetPhonetic.textContent = cached.phonetic;
    state.activeInspectorWord.phonetic = cached.phonetic;
    state.activeInspectorWord.translation = cached.translation;
    sheetTransInput.value = cached.contextMeaning || cached.translation;

    if (cached.isAi && cached.contextMeaning) {
      sheetTransSourceLabel.innerHTML = '🤖 DeepSeek 语境分析 <span class="badge-ai">AI精准</span>';
      sheetAiContextBox.style.display = 'block';
      sheetAiContextText.textContent = cached.contextMeaning;
      sheetTransText.textContent = cached.translation ? `常规释义：${cached.translation}` : '';
    } else {
      sheetTransSourceLabel.innerHTML = '基础释义 <span style="font-size:10px; color:var(--text-muted);">(未开启AI)</span>';
      sheetTransText.textContent = cached.translation || '轻点此处手动输入中文释义';
    }
    return;
  }

  // If DeepSeek API Key is configured, use DeepSeek
  if (state.settings.deepseekKey) {
    sheetTransSourceLabel.innerHTML = '🤖 DeepSeek AI 正在分析...';
    sheetTransText.innerHTML = '<span style="color:var(--text-muted); font-size:13.5px;">结合上下文智能解析语境中...</span>';

    try {
      const aiData = await fetchDeepSeekDefinition(norm, contextSentence, state.settings.deepseekKey);
      if (state.activeInspectorWord && state.activeInspectorWord.word === norm) {
        if (aiData.phonetic) {
          state.activeInspectorWord.phonetic = aiData.phonetic;
          sheetPhonetic.textContent = aiData.phonetic;
        }

        sheetTransSourceLabel.innerHTML = '🤖 DeepSeek 语境分析 <span class="badge-ai">AI精准</span>';
        if (aiData.contextMeaning) {
          sheetAiContextBox.style.display = 'block';
          sheetAiContextText.textContent = aiData.contextMeaning;
        }
        sheetTransText.textContent = aiData.translation ? `常规释义：${aiData.translation}` : '';
        
        // Combine for saved default note
        const combinedTrans = aiData.contextMeaning 
          ? `${aiData.contextMeaning}${aiData.translation ? ` (常: ${aiData.translation})` : ''}`
          : aiData.translation;
        state.activeInspectorWord.translation = combinedTrans;
        sheetTransInput.value = combinedTrans;

        state.setCached(norm, contextSentence, aiData);
      }
      return;
    } catch (err) {
      console.warn('DeepSeek error, falling back:', err);
      showToast(`DeepSeek 暂不可用: ${err.message || '网络错误'}`);
    }
  }

  // Fallback to base lookup
  sheetTransSourceLabel.innerHTML = '基础简明释义 <span style="font-size:10px; color:var(--text-muted);">(未配置AI)</span>';
  sheetTransText.innerHTML = '<span style="color:var(--text-muted); font-size:13.5px;">正在查询释义...</span>';

  const fetched = await fetchBaseDefinition(norm);
  if (state.activeInspectorWord && state.activeInspectorWord.word === norm) {
    if (fetched.phonetic) {
      state.activeInspectorWord.phonetic = fetched.phonetic;
      sheetPhonetic.textContent = fetched.phonetic;
    }
    if (fetched.translation) {
      state.activeInspectorWord.translation = fetched.translation;
      sheetTransText.innerHTML = `${escapeHtml(fetched.translation)}<div style="margin-top:8px; font-size:11.5px; color:var(--accent); line-height:1.4;">💡 提示：在【设置】填入 DeepSeek Key，即可开启结合上下文的 100% 精准释义！</div>`;
      sheetTransInput.value = fetched.translation;
      state.setCached(norm, contextSentence, fetched);
    } else {
      sheetTransText.innerHTML = `<span style="color:var(--text-muted);">暂无简明中文释义</span><div style="margin-top:8px; font-size:11.5px; color:var(--accent); line-height:1.4;">💡 在【设置】中配置 DeepSeek Key 即可秒出高精准释义</div>`;
    }

    // English definitions
    if (fetched.meanings && fetched.meanings.length > 0) {
      sheetDefsContainer.innerHTML = `
        <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">英英简释</div>
        ${fetched.meanings.map(m => `
          <div class="def-item">
            <span class="def-pos">${escapeHtml(m.partOfSpeech)}</span>
            <span>${escapeHtml(m.definition)}</span>
          </div>
        `).join('')}
      `;
    }
  }
}

function updateInspectorSaveButton() {
  const btnSave = document.getElementById('btnToggleSaveWord');
  if (!state.activeInspectorWord) return;

  const existing = state.getWord(state.activeInspectorWord.word);
  if (existing && !existing.mastered) {
    btnSave.textContent = '✓ 已在生词本 · 标记掌握或移除';
    btnSave.style.backgroundColor = 'var(--text-secondary)';
  } else {
    btnSave.textContent = '+ 记入生词本';
    btnSave.style.backgroundColor = 'var(--accent)';
  }
}

function closeBottomSheet() {
  const sheet = document.getElementById('wordBottomSheet');
  const backdrop = document.getElementById('sheetBackdrop');
  sheet.classList.remove('active');
  backdrop.classList.remove('active');
  state.activeInspectorWord = null;
}

// 6. Article CRUD
function openNewArticleModal(editArticleId = null) {
  const modal = document.getElementById('articleModalBackdrop');
  const titleInput = document.getElementById('articleTitleInput');
  const contentInput = document.getElementById('articleContentInput');
  const modalTitle = document.getElementById('articleModalTitle');

  if (editArticleId) {
    const article = state.articles.find(a => a.id === editArticleId);
    if (!article) return;
    modalTitle.textContent = '编辑文章';
    titleInput.value = article.title;
    contentInput.value = article.content;
    modal.dataset.editId = editArticleId;
  } else {
    modalTitle.textContent = '存入新英语文章';
    titleInput.value = '';
    contentInput.value = '';
    delete modal.dataset.editId;
  }

  updateModalWordCount();
  modal.classList.add('active');
  titleInput.focus();
}

function closeArticleModal() {
  const modal = document.getElementById('articleModalBackdrop');
  modal.classList.remove('active');
}

function saveArticleFromModal() {
  const titleInput = document.getElementById('articleTitleInput');
  const contentInput = document.getElementById('articleContentInput');
  const modal = document.getElementById('articleModalBackdrop');

  const title = titleInput.value.trim() || '未命名英语文章';
  const content = contentInput.value.trim();

  if (!content) {
    showToast('请输入或粘贴英语正文');
    return;
  }

  const editId = modal.dataset.editId;
  if (editId) {
    const index = state.articles.findIndex(a => a.id === editId);
    if (index >= 0) {
      if (state.articles[index].content !== content) {
        delete state.articles[index].translation;
      }
      state.articles[index].title = title;
      state.articles[index].content = content;
      state.saveArticles();
      showToast('文章已更新');
      closeArticleModal();
      openReader(editId);
      return;
    }
  }

  const newArticle = {
    id: 'art-' + Date.now(),
    title: title,
    content: content,
    createdAt: new Date().toISOString()
  };

  state.articles.unshift(newArticle);
  state.saveArticles();
  showToast('文章已保存！');
  closeArticleModal();
  openReader(newArticle.id);
}

function deleteArticle(articleId) {
  if (!confirm('确定要删除这篇文章吗？（关联的生词本仍将保留）')) return;
  state.articles = state.articles.filter(a => a.id !== articleId);
  state.saveArticles();
  renderArticleList();
  showToast('文章已删除');
}

function deleteWord(wordStr) {
  state.removeWord(wordStr);
  renderVocabList();
  refreshReaderHighlights();
  showToast('已从生词本移除');
}

function toggleMastered(wordStr) {
  const wordObj = state.getWord(wordStr);
  if (!wordObj) return;
  wordObj.mastered = !wordObj.mastered;
  state.saveWords();
  renderVocabList();
  refreshReaderHighlights();
  showToast(wordObj.mastered ? '已标记为掌握！' : '已重置为待学习');
}

function refreshReaderHighlights() {
  if (!state.currentArticleId) return;
  document.querySelectorAll('.word-token').forEach(el => {
    const w = el.dataset.word.toLowerCase();
    const wordData = state.getWord(w);
    el.classList.toggle('is-saved', !!(wordData && !wordData.mastered));
  });

  const savedCountEl = document.getElementById('readerArticleSavedWords');
  if (savedCountEl) {
    const unknownInArticle = state.words.filter(w => w.articleId === state.currentArticleId && !w.mastered);
    savedCountEl.textContent = `${unknownInArticle.length} 个生词已标记`;
  }
}

function updateModalWordCount() {
  const contentInput = document.getElementById('articleContentInput');
  const countEl = document.getElementById('modalWordCount');
  if (!contentInput || !countEl) return;
  const count = contentInput.value.trim() ? contentInput.value.trim().split(/\s+/).length : 0;
  countEl.textContent = `${count} 词`;
}

// 7. Data Export & Import
function exportData() {
  const data = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    articles: state.articles,
    words: state.words,
    settings: state.settings
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `minimal-english-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('备份文件已下载');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data.articles)) state.articles = data.articles;
      if (Array.isArray(data.words)) state.words = data.words;
      if (data.settings) state.settings = { ...state.settings, ...data.settings };
      state.saveArticles();
      state.saveWords();
      state.saveSettings();
      applySettings();
      renderArticleList();
      renderVocabList();
      showToast('数据恢复成功！');
    } catch (err) {
      showToast('导入失败：文件格式不正确');
    }
  };
  reader.readAsText(file);
}

// --- Utilities ---
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Navigation tabs
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(targetTab);
      if (panel) panel.classList.add('active');

      if (targetTab === 'viewVocab') renderVocabList();
      if (targetTab === 'viewArticles') renderArticleList();
    });
  });

  // Top header buttons
  document.getElementById('btnNewArticle')?.addEventListener('click', () => openNewArticleModal());
  document.getElementById('btnQuickTheme')?.addEventListener('click', () => {
    const themes = ['warm', 'light', 'dark'];
    const curIdx = themes.indexOf(state.settings.theme);
    state.settings.theme = themes[(curIdx + 1) % themes.length];
    state.saveSettings();
    applySettings();
  });

  // Reader interactions
  document.getElementById('btnReaderBack')?.addEventListener('click', closeReader);
  document.getElementById('btnToggleTranslate')?.addEventListener('click', toggleArticleTranslation);
  document.getElementById('btnReaderEdit')?.addEventListener('click', () => {
    if (state.currentArticleId) openNewArticleModal(state.currentArticleId);
  });
  document.getElementById('btnReaderOptions')?.addEventListener('click', () => {
    const box = document.getElementById('readerTypographyBox');
    box.style.display = box.style.display === 'none' ? 'flex' : 'none';
  });
  document.getElementById('btnCloseReaderTypo')?.addEventListener('click', () => {
    document.getElementById('readerTypographyBox').style.display = 'none';
  });

  // Reader content word click delegation
  document.getElementById('readerContentArea')?.addEventListener('click', (e) => {
    const target = e.target.closest('.word-token');
    if (!target) return;
    const word = target.dataset.word;
    
    // Find context sentence
    const paragraph = target.closest('p');
    let sentence = '';
    if (paragraph) {
      const fullText = paragraph.innerText;
      // Simple sentence regex
      const sentences = fullText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [fullText];
      sentence = sentences.find(s => s.toLowerCase().includes(word.toLowerCase())) || fullText;
    }
    inspectWord(word, sentence.trim());
  });

  // Sheet Pronounce button
  document.getElementById('btnPronounceWord')?.addEventListener('click', () => {
    if (state.activeInspectorWord) {
      speakWord(state.activeInspectorWord.word);
    }
  });

  // Sheet Edit translation
  const btnEditDef = document.getElementById('btnToggleEditDef');
  const transInput = document.getElementById('sheetTranslationInput');
  const transText = document.getElementById('sheetTranslationText');
  btnEditDef?.addEventListener('click', () => {
    if (transInput.style.display === 'none') {
      transInput.style.display = 'block';
      transInput.focus();
    } else {
      transInput.style.display = 'none';
      if (transInput.value.trim() && state.activeInspectorWord) {
        state.activeInspectorWord.translation = transInput.value.trim();
        transText.textContent = transInput.value.trim();
        const existing = state.getWord(state.activeInspectorWord.word);
        if (existing) {
          existing.translation = transInput.value.trim();
          state.saveWords();
        }
      }
    }
  });

  // Sheet Save / Toggle Unknown Word
  document.getElementById('btnToggleSaveWord')?.addEventListener('click', () => {
    if (!state.activeInspectorWord) return;

    const existing = state.getWord(state.activeInspectorWord.word);
    if (existing && !existing.mastered) {
      // Remove or mark mastered
      state.removeWord(state.activeInspectorWord.word);
      showToast(`已将「${state.activeInspectorWord.word}」移出生词本`);
    } else {
      // Add to vocabulary
      const trans = transInput.value.trim() || state.activeInspectorWord.translation || '自定义生词';
      const wordObj = {
        id: 'w-' + Date.now(),
        word: state.activeInspectorWord.word,
        phonetic: state.activeInspectorWord.phonetic,
        translation: trans,
        contextSentence: state.activeInspectorWord.contextSentence,
        articleId: state.activeInspectorWord.articleId,
        articleTitle: state.activeInspectorWord.articleTitle,
        mastered: false,
        createdAt: new Date().toISOString()
      };
      state.addOrUpdateWord(wordObj);
      showToast(`已加入生词本：「${state.activeInspectorWord.word}」`);
    }

    refreshReaderHighlights();
    updateInspectorSaveButton();
    closeBottomSheet();
  });

  // Sheet Backdrop dismiss
  document.getElementById('sheetBackdrop')?.addEventListener('click', closeBottomSheet);

  // Article Modal
  document.getElementById('btnCloseArticleModal')?.addEventListener('click', closeArticleModal);
  document.getElementById('btnCancelArticleModal')?.addEventListener('click', closeArticleModal);
  document.getElementById('btnSaveArticle')?.addEventListener('click', saveArticleFromModal);
  document.getElementById('articleContentInput')?.addEventListener('input', updateModalWordCount);

  // Vocabulary search & filter
  document.getElementById('vocabSearchInput')?.addEventListener('input', renderVocabList);
  document.getElementById('vocabArticleFilter')?.addEventListener('change', renderVocabList);

  // Settings: Theme & Font pills
  document.querySelectorAll('.theme-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      state.settings.theme = pill.dataset.themeVal;
      state.saveSettings();
      applySettings();
    });
  });

  document.querySelectorAll('.font-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      state.settings.fontFamily = pill.dataset.fontVal;
      state.saveSettings();
      applySettings();
    });
  });

  // Settings: Font size
  const fontSlider = document.getElementById('fontSizeSlider');
  fontSlider?.addEventListener('input', (e) => {
    state.settings.fontSize = parseInt(e.target.value, 10);
    state.saveSettings();
    applySettings();
  });

  document.getElementById('btnFontSmaller')?.addEventListener('click', () => {
    if (state.settings.fontSize > 14) {
      state.settings.fontSize -= 1;
      state.saveSettings();
      applySettings();
    }
  });

  document.getElementById('btnFontBigger')?.addEventListener('click', () => {
    if (state.settings.fontSize < 26) {
      state.settings.fontSize += 1;
      state.saveSettings();
      applySettings();
    }
  });

  // DeepSeek Key Management
  const inputKey = document.getElementById('inputDeepseekKey');
  const btnToggleKey = document.getElementById('btnToggleKeyVisibility');
  const btnSaveKey = document.getElementById('btnSaveDeepseekKey');
  const btnClearKey = document.getElementById('btnClearDeepseekKey');
  const testResult = document.getElementById('deepseekTestResult');

  btnToggleKey?.addEventListener('click', () => {
    if (inputKey.type === 'password') {
      inputKey.type = 'text';
      btnToggleKey.textContent = '🔒';
    } else {
      inputKey.type = 'password';
      btnToggleKey.textContent = '👁️';
    }
  });

  btnSaveKey?.addEventListener('click', async () => {
    const key = inputKey ? inputKey.value.trim() : '';
    if (!key) {
      showToast('请输入有效的 DeepSeek API Key');
      return;
    }

    btnSaveKey.disabled = true;
    btnSaveKey.textContent = '测试连接中...';
    if (testResult) {
      testResult.style.display = 'block';
      testResult.style.color = 'var(--text-muted)';
      testResult.textContent = '⏳ 正在验证 API Key 连通性...';
    }

    try {
      await testDeepSeekKey(key);
      state.settings.deepseekKey = key;
      state.saveSettings();
      // Clear old cached lookups so fresh accurate AI definitions are fetched
      state.cache = {};
      try { localStorage.removeItem('minimal_word_cache'); } catch(e) {}

      applySettings();
      showToast('DeepSeek 连接成功！已开启 AI 语境查词');
      if (testResult) {
        testResult.style.color = 'var(--success)';
        testResult.innerHTML = '✅ <strong>连接成功！</strong> DeepSeek AI 已就绪。返回文章轻点任意单词，即可享受结合上下文的精准释义。';
      }
    } catch (err) {
      if (testResult) {
        testResult.style.color = 'var(--danger)';
        testResult.innerHTML = `❌ <strong>连接失败</strong>：${escapeHtml(err.message || '请检查网络或Key是否正确')}`;
      }
      showToast('API Key 验证失败');
    } finally {
      btnSaveKey.disabled = false;
      btnSaveKey.textContent = '保存并测试连接';
    }
  });

  btnClearKey?.addEventListener('click', () => {
    if (!confirm('确定清除 DeepSeek API Key 吗？将恢复为基础离线查词。')) return;
    state.settings.deepseekKey = '';
    state.saveSettings();
    if (inputKey) inputKey.value = '';
    if (testResult) testResult.style.display = 'none';
    applySettings();
    showToast('已清除 DeepSeek Key');
  });

  // Backup: Export & Import
  document.getElementById('btnExportData')?.addEventListener('click', exportData);
  const fileImportInput = document.getElementById('fileImportInput');
  document.getElementById('btnImportData')?.addEventListener('click', () => {
    fileImportInput.click();
  });
  fileImportInput?.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      importData(e.target.files[0]);
    }
  });
}

// --- PWA Service Worker Registration ---
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('ServiceWorker registered'))
      .catch((err) => console.log('ServiceWorker registration skipped:', err));
  }
}

// --- App Initialization ---
window.addEventListener('DOMContentLoaded', () => {
  applySettings();
  renderArticleList();
  renderVocabList();
  setupEventListeners();
  registerServiceWorker();
});
