import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const typeLabels = { vocabulary: "単語", phrase: "フレーズ", grammar: "文法" };
const loginPanel = document.querySelector("#login-panel");
const loginStatus = document.querySelector("#login-status");
const googleSignInButton = document.querySelector("#google-sign-in-button");
const userMenu = document.querySelector("#user-menu");
const userPhoto = document.querySelector("#user-photo");
const userName = document.querySelector("#user-name");
const signOutButton = document.querySelector("#sign-out-button");
const itemsPanel = document.querySelector("#items-panel");
const languageFilter = document.querySelector("#language-filter");
const typeFilter = document.querySelector("#type-filter");
const refreshButton = document.querySelector("#refresh-button");
const importFile = document.querySelector("#import-file");
const downloadLegacyButton = document.querySelector("#download-legacy-button");
const downloadLegacyStatus = document.querySelector("#download-legacy-status");
const importSummary = document.querySelector("#import-summary");
const importButton = document.querySelector("#import-button");
const resultCount = document.querySelector("#result-count");
const status = document.querySelector("#status");
const itemList = document.querySelector("#item-list");
const itemTemplate = document.querySelector("#item-template");

let auth;
let currentUser;
let knownLanguages = new Set();
let selectedImportBundle;

function showLogin(message = "") {
  loginPanel.hidden = false;
  itemsPanel.hidden = true;
  userMenu.hidden = true;
  loginStatus.textContent = message;
}

function showItems(user) {
  loginPanel.hidden = true;
  itemsPanel.hidden = false;
  userMenu.hidden = false;
  userName.textContent = user.displayName || user.email || "ログイン中";
  if (user.photoURL) {
    userPhoto.src = user.photoURL;
    userPhoto.hidden = false;
  } else {
    userPhoto.hidden = true;
  }
}

function setStatus(message, kind = "") {
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

async function apiFetch(path, options = {}) {
  if (!currentUser) throw new Error("not_authenticated");
  const token = await currentUser.getIdToken();
  return fetch(path, {
    ...options,
    headers: { ...options.headers, authorization: `Bearer ${token}` },
  });
}

function updateLanguageOptions(items) {
  for (const item of items) knownLanguages.add(item.language);
  const selected = languageFilter.value;
  languageFilter.replaceChildren(new Option("すべて", ""));
  for (const language of [...knownLanguages].sort()) languageFilter.add(new Option(language, language));
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
  if (!currentUser) return;
  refreshButton.disabled = true;
  resultCount.textContent = "";
  itemList.replaceChildren();
  setStatus("読み込んでいます…", "loading");

  const params = new URLSearchParams({ limit: "200" });
  if (!discoverLanguages && languageFilter.value) params.set("language", languageFilter.value);
  if (typeFilter.value) params.set("type", typeFilter.value);

  try {
    const response = await apiFetch(`/learning-items?${params}`);
    if (response.status === 401) throw new Error("unauthorized");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = await response.json();
    updateLanguageOptions(items);
    renderItems(items);
  } catch (error) {
    console.error(error);
    setStatus("学習項目を取得できませんでした。再ログインしてお試しください。", "error");
  } finally {
    refreshButton.disabled = false;
  }
}

async function establishSession(user) {
  currentUser = user;
  showItems(user);
  const response = await apiFetch("/auth/session");
  if (!response.ok) throw new Error(`Session failed: ${response.status}`);
  await loadItems({ discoverLanguages: true });
}

async function initializeAuthentication() {
  try {
    const response = await fetch("/auth/config");
    if (!response.ok) throw new Error("Googleログインは現在準備中です。");
    const config = await response.json();
    auth = getAuth(initializeApp(config));
    await getRedirectResult(auth);
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        currentUser = undefined;
        showLogin();
        return;
      }
      try {
        await establishSession(user);
      } catch (error) {
        console.error(error);
        showLogin("ログイン情報を確認できませんでした。もう一度お試しください。");
      }
    });
  } catch (error) {
    console.error(error);
    showLogin(error.message || "Googleログインを初期化できませんでした。");
    googleSignInButton.disabled = true;
  }
}

googleSignInButton.addEventListener("click", async () => {
  googleSignInButton.disabled = true;
  loginStatus.textContent = "Googleを開いています…";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request") {
      await signInWithRedirect(auth, provider);
      return;
    }
    console.error(error);
    loginStatus.textContent = "ログインを完了できませんでした。もう一度お試しください。";
  } finally {
    googleSignInButton.disabled = false;
  }
});

signOutButton.addEventListener("click", () => signOut(auth));
languageFilter.addEventListener("change", () => loadItems());
typeFilter.addEventListener("change", () => loadItems());
refreshButton.addEventListener("click", () => loadItems());

downloadLegacyButton.addEventListener("click", async () => {
  downloadLegacyButton.disabled = true;
  downloadLegacyStatus.textContent = "バックアップを準備しています…";
  try {
    const response = await apiFetch("/exports/legacy");
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "study-karte-backup.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    downloadLegacyStatus.textContent = "保存しました。続けて下のファイル選択から読み込んでください。";
  } catch (error) {
    console.error(error);
    downloadLegacyStatus.textContent = "ダウンロードできませんでした。ログインアカウントを確認してください。";
  } finally {
    downloadLegacyButton.disabled = false;
  }
});

importFile.addEventListener("change", async () => {
  selectedImportBundle = undefined;
  importButton.disabled = true;
  const file = importFile.files?.[0];
  if (!file) {
    importSummary.textContent = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    importSummary.textContent = "ファイルが大きすぎます（上限2MB）。";
    return;
  }

  try {
    const bundle = JSON.parse(await file.text());
    if (
      bundle.format !== "study-karte-legacy-export" ||
      bundle.version !== 1 ||
      !Array.isArray(bundle.learning_items) ||
      !Array.isArray(bundle.review_events) ||
      typeof bundle.claim_token !== "string"
    ) {
      throw new Error("invalid_format");
    }
    selectedImportBundle = bundle;
    importSummary.textContent = `学習項目 ${bundle.learning_items.length}件、復習履歴 ${bundle.review_events.length}件をインポートします。`;
    importButton.disabled = false;
  } catch (error) {
    console.error(error);
    importSummary.textContent = "Study KarteのバックアップJSONではありません。";
  }
});

importButton.addEventListener("click", async () => {
  if (!selectedImportBundle) return;
  importButton.disabled = true;
  importSummary.textContent = "インポートしています…";
  try {
    const response = await apiFetch("/imports/legacy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selectedImportBundle),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    importSummary.textContent = result.already_imported
      ? "このバックアップはすでにインポート済みです。"
      : `学習項目 ${result.learning_items}件をインポートしました。`;
    await loadItems({ discoverLanguages: true });
  } catch (error) {
    console.error(error);
    importSummary.textContent = "インポートできませんでした。ファイルとログインアカウントを確認してください。";
    importButton.disabled = false;
  }
});

showLogin("ログインを準備しています…");
initializeAuthentication();
