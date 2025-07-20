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
  
  console.log('Navigating to:', url);
  showStatus('ページを読み込み中...');
  
  try {
    // プロキシ経由でページを取得
    console.log('Fetching via proxy...');
    const response = await invoke('fetch_url', { url: url });
    console.log('Proxy response received:', response.status);
    
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    // HTMLコンテンツを処理してiframeに表示
    const processedContent = processHtmlContent(response.content, url);
    const blob = new Blob([processedContent], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    
    console.log('Setting iframe src to blob URL');
    webview.src = blobUrl;
    urlInput.value = url;
    addToHistory(url);
    showStatus('ページ読み込み完了');
    
    // 外部ブラウザで開くオプションも提供
    addExternalButton(url);
    
  } catch (error) {
    console.error('Navigation failed:', error);
    showStatus(`エラー: ${error.message} - 外部ブラウザで開きます`);
    // エラー時は外部ブラウザで開く
    await openExternal(url);
  }
}

function showStatus(message) {
  // ステータス表示用の要素を作成または更新
  let statusEl = document.getElementById('status-display');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'status-display';
    statusEl.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1001;
    `;
    document.body.appendChild(statusEl);
  }
  statusEl.textContent = message;
  
  // 3秒後に自動消去
  clearTimeout(statusEl.timer);
  statusEl.timer = setTimeout(() => {
    if (statusEl.parentNode) {
      statusEl.parentNode.removeChild(statusEl);
    }
  }, 3000);
}

function addExternalButton(url) {
  document.getElementById('open-external-btn')?.remove();
  const externalBtn = document.createElement('button');
  externalBtn.id = 'open-external-btn';
  externalBtn.textContent = '外部ブラウザで開く';
  externalBtn.style.cssText = `
    position: fixed;
    top: 50px;
    right: 10px;
    background: #007acc;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    z-index: 1000;
  `;
  externalBtn.onclick = () => openExternal(url);
  document.body.appendChild(externalBtn);
}

function processHtmlContent(html, baseUrl) {
  console.log('Processing HTML content, length:', html.length);
  
  // 相対URLを絶対URLに変換
  const base = new URL(baseUrl);
  
  // X-Frame-Optionsやその他のセキュリティヘッダーを無効化するメタタグを追加
  const securityOverride = `
    <meta http-equiv="Content-Security-Policy" content="">
    <meta http-equiv="X-Frame-Options" content="">
    <base href="${baseUrl}">
    <style>
      /* iframe内でのスクロール改善 */
      html, body { 
        margin: 0; 
        padding: 0; 
        overflow-x: auto; 
        height: auto !important;
      }
    </style>
  `;
  
  let processedHtml = html
    // 相対URLを絶対URLに変換
    .replace(/href="([^"]*?)"/g, (match, url) => {
      try {
        if (url.startsWith('http') || url.startsWith('//') || url.startsWith('#') || url.startsWith('javascript:')) return match;
        const absoluteUrl = new URL(url, base).href;
        return `href="${absoluteUrl}"`;
      } catch (e) {
        console.warn('Failed to process href:', url, e);
        return match;
      }
    })
    .replace(/src="([^"]*?)"/g, (match, url) => {
      try {
        if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:')) return match;
        const absoluteUrl = new URL(url, base).href;
        return `src="${absoluteUrl}"`;
      } catch (e) {
        console.warn('Failed to process src:', url, e);
        return match;
      }
    })
    // アクション属性も絶対URLに変換
    .replace(/action="([^"]*?)"/g, (match, url) => {
      try {
        if (url.startsWith('http') || url.startsWith('//')) return match;
        const absoluteUrl = new URL(url, base).href;
        return `action="${absoluteUrl}"`;
      } catch (e) {
        console.warn('Failed to process action:', url, e);
        return match;
      }
    });
  
  // headタグにセキュリティオーバーライドを挿入
  if (processedHtml.includes('<head>')) {
    processedHtml = processedHtml.replace(/<head>/i, `<head>${securityOverride}`);
  } else if (processedHtml.includes('<html>')) {
    processedHtml = processedHtml.replace(/<html([^>]*)>/i, `<html$1><head>${securityOverride}</head>`);
  } else {
    processedHtml = `<head>${securityOverride}</head>${processedHtml}`;
  }
  
  console.log('HTML processing complete, new length:', processedHtml.length);
  return processedHtml;
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
