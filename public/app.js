const API_KEY_STORAGE = "study-karte-api-key";
const typeLabels = { vocabulary: "単語", phrase: "フレーズ", grammar: "文法" };

const connectionPanel = document.querySelector("#connection-panel");
const itemsPanel = document.querySelector("#items-panel");
const apiKeyForm = document.querySelector("#api-key-form");
const apiKeyInput = document.querySelector("#api-key");
const settingsButton = document.querySelector("#settings-button");
const languageFilter = document.querySelector("#language-filter");
const typeFilter = document.querySelector("#type-filter");
const refreshButton = document.querySelector("#refresh-button");
const resultCount = document.querySelector("#result-count");
const status = document.querySelector("#status");
const itemList = document.querySelector("#item-list");
const itemTemplate = document.querySelector("#item-template");

let apiKey = localStorage.getItem(API_KEY_STORAGE) ?? "";
let knownLanguages = new Set();

function showConnection() {
  connectionPanel.hidden = false;
  itemsPanel.hidden = true;
  settingsButton.textContent = "一覧に戻る";
  apiKeyInput.value = apiKey;
  apiKeyInput.focus();
}

function showItems() {
  connectionPanel.hidden = true;
  itemsPanel.hidden = false;
  settingsButton.textContent = "接続設定";
}

function setStatus(message, kind = "") {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

function updateLanguageOptions(items) {
  for (const item of items) knownLanguages.add(item.language);
  const selected = languageFilter.value;
  languageFilter.replaceChildren(new Option("すべて", ""));
  for (const language of [...knownLanguages].sort()) {
    languageFilter.add(new Option(language, language));
  }
  languageFilter.value = selected;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

function renderItems(items) {
  itemList.replaceChildren();
  resultCount.textContent = `${items.length}件`;

  if (items.length === 0) {
    setStatus("該当する学習項目はまだありません。", "empty");
    return;
  }

  setStatus("");
  for (const item of items) {
    const fragment = itemTemplate.content.cloneNode(true);
    fragment.querySelector(".type-badge").textContent = typeLabels[item.type] ?? item.type;
    fragment.querySelector(".created-at").textContent = formatDate(item.created_at);
    fragment.querySelector(".surface").textContent = item.surface;

    const reading = fragment.querySelector(".reading");
    reading.textContent = item.reading ?? "";
    reading.hidden = !item.reading;

    fragment.querySelector(".meaning").textContent = item.meaning;
    const note = fragment.querySelector(".note");
    note.textContent = item.note ?? "";
    note.hidden = !item.note;

    const mastery = Math.max(0, Math.min(100, Number(item.mastery) || 0));
    fragment.querySelector(".mastery-bar").style.width = `${mastery}%`;
    fragment.querySelector(".mastery-value").textContent = `${mastery}%`;
    itemList.append(fragment);
  }
}

async function loadItems({ discoverLanguages = false } = {}) {
  if (!apiKey) {
    showConnection();
    return;
  }

  showItems();
  refreshButton.disabled = true;
  resultCount.textContent = "";
  itemList.replaceChildren();
  setStatus("読み込んでいます…", "loading");

  const params = new URLSearchParams({ limit: "200" });
  if (!discoverLanguages && languageFilter.value) params.set("language", languageFilter.value);
  if (typeFilter.value) params.set("type", typeFilter.value);

  try {
    const response = await fetch(`/learning-items?${params}`, { headers: { "x-api-key": apiKey } });
    if (response.status === 401) {
      setStatus("APIキーを確認してください。", "error");
      showConnection();
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const items = await response.json();
    updateLanguageOptions(items);
    renderItems(items);
  } catch (error) {
    console.error(error);
    setStatus("学習項目を取得できませんでした。通信状態を確認して再度お試しください。", "error");
  } finally {
    refreshButton.disabled = false;
  }
}

apiKeyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  apiKey = apiKeyInput.value.trim();
  localStorage.setItem(API_KEY_STORAGE, apiKey);
  loadItems({ discoverLanguages: true });
});

settingsButton.addEventListener("click", () => {
  if (connectionPanel.hidden) showConnection();
  else loadItems();
});

languageFilter.addEventListener("change", () => loadItems());
typeFilter.addEventListener("change", () => loadItems());
refreshButton.addEventListener("click", () => loadItems());

if (apiKey) loadItems({ discoverLanguages: true });
else showConnection();
