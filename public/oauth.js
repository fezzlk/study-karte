import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { GoogleAuthProvider, getAuth, getRedirectResult, signInWithRedirect } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const button = document.querySelector("#oauth-sign-in");
const status = document.querySelector("#oauth-status");
const request = Object.fromEntries(new URLSearchParams(location.search));
let auth;
let completing = false;

async function complete(user) {
  if (completing) return;
  completing = true;
  status.textContent = "ChatGPTへ戻っています…";
  const response = await fetch("/oauth/authorize/complete", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, firebase_id_token: await user.getIdToken() }),
  });
  const result = await response.json();
  if (!response.ok || !result.redirect_to) throw new Error(result.error || `HTTP ${response.status}`);
  location.replace(result.redirect_to);
}

async function initialize() {
  try {
    const configResponse = await fetch("/auth/config");
    if (!configResponse.ok) throw new Error("認証設定を取得できませんでした");
    auth = getAuth(initializeApp(await configResponse.json()));
    const redirectResult = await getRedirectResult(auth);
    if (redirectResult?.user) await complete(redirectResult.user);
  } catch (error) { showError(error); }
}

function showError(error) {
  console.error(error);
  completing = false;
  button.disabled = false;
  status.textContent = "接続を完了できませんでした。もう一度お試しください。";
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Googleを開いています…";
  try { await signInWithRedirect(auth, new GoogleAuthProvider()); } catch (error) { showError(error); }
});

initialize();
