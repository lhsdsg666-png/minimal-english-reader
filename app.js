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
  fontSize: 18
};

// --- State Management ---
class AppState {
  constructor() {
    this.articles = this.loadStorage('minimal_articles', [DEFAULT_ARTICLE]);
    this.words = this.loadStorage('minimal_words', DEFAULT_WORDS);
    this.settings = this.loadStorage('minimal_settings', DEFAULT_SETTINGS);
    this.currentArticleId = null;
    this.activeInspectorWord = null;
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

// --- Dictionary API Lookup ---
async function fetchWordDefinition(word) {
  const normWord = word.toLowerCase().trim();
  const result = {
    word: normWord,
    phonetic: '',
    meanings: [],
    translation: ''
  };

  try {
    // 1. Fetch from Free Dictionary API (English definitions and phonetics)
    const dictPromise = fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normWord)}`)
      .then(res => res.ok ? res.json() : null)
      .catch(() => null);

    // 2. Fetch Chinese Translation from MyMemory
    const transPromise = fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(normWord)}&langpair=en|zh-CN`)
      .then(res => res.ok ? res.json() : null)
      .catch(() => null);

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
      // Filter out auto-translation error garbage if any
      if (!trans.toUpperCase().includes('QUERY LENGTH') && !trans.toUpperCase().includes('INVALID')) {
        result.translation = trans;
      }
    }
  } catch (err) {
    console.warn('Word fetch error:', err);
  }

  return result;
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

  // Parse paragraphs and token words
  const paragraphs = article.content.split(/\n\s*\n/);
  
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

    return `<p data-p="${pIdx}">${tokenHtml}</p>`;
  }).join('');

  readerContainer.classList.add('active');
  window.scrollTo(0, 0);
}

function closeReader() {
  const readerContainer = document.getElementById('readerContainer');
  readerContainer.classList.remove('active');
  state.currentArticleId = null;
  renderArticleList();
  renderVocabList();
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
  const sheetTransText = document.getElementById('sheetTranslationText');
  const sheetTransInput = document.getElementById('sheetTranslationInput');
  const sheetContextText = document.getElementById('sheetContextText');
  const sheetDefsContainer = document.getElementById('sheetDefinitionsContainer');
  const btnSave = document.getElementById('btnToggleSaveWord');

  sheetWord.textContent = word;
  sheetPhonetic.textContent = existing?.phonetic || '...';
  sheetTransText.textContent = existing?.translation || '正在查询释义...';
  sheetTransInput.value = existing?.translation || '';
  sheetTransInput.style.display = 'none';
  sheetDefsContainer.innerHTML = '';

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

  // If not in wordbook or missing translation, fetch from API
  if (!existing || !existing.translation) {
    const fetched = await fetchWordDefinition(norm);
    if (state.activeInspectorWord && state.activeInspectorWord.word === norm) {
      if (fetched.phonetic) {
        state.activeInspectorWord.phonetic = fetched.phonetic;
        sheetPhonetic.textContent = fetched.phonetic;
      }
      if (fetched.translation) {
        state.activeInspectorWord.translation = fetched.translation;
        sheetTransText.textContent = fetched.translation;
        sheetTransInput.value = fetched.translation;
      } else if (!existing) {
        sheetTransText.textContent = '轻点此处手动输入中文释义';
      }

      // Render English definitions
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
