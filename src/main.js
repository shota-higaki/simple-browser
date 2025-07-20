const { invoke } = window.__TAURI__.core;

let webview;
let urlInput;
let backBtn;
let forwardBtn;
let reloadBtn;
let goBtn;

let history = [];
let currentIndex = -1;

function updateButtons() {
  backBtn.disabled = currentIndex <= 0;
  forwardBtn.disabled = currentIndex >= history.length - 1;
}

function addToHistory(url) {
  if (currentIndex < history.length - 1) {
    history = history.slice(0, currentIndex + 1);
  }
  
  if (history[currentIndex] !== url) {
    history.push(url);
    currentIndex = history.length - 1;
  }
  
  updateButtons();
}

async function navigateToUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  try {
    // プロキシ経由でページを取得
    const response = await invoke('fetch_url', { url: url });
    
    // HTMLコンテンツを処理してiframeに表示
    const processedContent = processHtmlContent(response.content, url);
    const blob = new Blob([processedContent], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    
    webview.src = blobUrl;
    urlInput.value = url;
    addToHistory(url);
    
    // 外部ブラウザで開くオプションも提供
    document.getElementById('open-external-btn')?.remove();
    const externalBtn = document.createElement('button');
    externalBtn.id = 'open-external-btn';
    externalBtn.textContent = '外部ブラウザで開く';
    externalBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; z-index: 1000;';
    externalBtn.onclick = () => openExternal(url);
    document.body.appendChild(externalBtn);
    
  } catch (error) {
    console.error('Navigation failed:', error);
    // エラー時は外部ブラウザで開く
    await openExternal(url);
  }
}

function processHtmlContent(html, baseUrl) {
  // 相対URLを絶対URLに変換
  const base = new URL(baseUrl);
  
  return html
    .replace(/href="([^"]*?)"/g, (match, url) => {
      if (url.startsWith('http') || url.startsWith('//')) return match;
      const absoluteUrl = new URL(url, base).href;
      return `href="${absoluteUrl}"`;
    })
    .replace(/src="([^"]*?)"/g, (match, url) => {
      if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:')) return match;
      const absoluteUrl = new URL(url, base).href;
      return `src="${absoluteUrl}"`;
    })
    .replace(/<head>/i, `<head><base href="${baseUrl}">`);
}

async function openExternal(url) {
  try {
    await invoke('open_external_url', { url: url });
  } catch (error) {
    console.error('Failed to open external URL:', error);
  }
}

function goBack() {
  if (currentIndex > 0) {
    currentIndex--;
    const url = history[currentIndex];
    navigateToUrl(url);
  }
}

function goForward() {
  if (currentIndex < history.length - 1) {
    currentIndex++;
    const url = history[currentIndex];
    navigateToUrl(url);
  }
}

function reload() {
  if (history[currentIndex]) {
    navigateToUrl(history[currentIndex]);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  webview = document.querySelector("#webview");
  urlInput = document.querySelector("#url-input");
  backBtn = document.querySelector("#back-btn");
  forwardBtn = document.querySelector("#forward-btn");
  reloadBtn = document.querySelector("#reload-btn");
  goBtn = document.querySelector("#go-btn");

  backBtn.addEventListener("click", goBack);
  forwardBtn.addEventListener("click", goForward);
  reloadBtn.addEventListener("click", reload);
  
  goBtn.addEventListener("click", () => {
    navigateToUrl(urlInput.value);
  });

  urlInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      navigateToUrl(urlInput.value);
    }
  });

  updateButtons();
});
