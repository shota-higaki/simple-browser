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
    url = `https://${url}`;
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

    try {
      // 前のblobURLがあれば解放
      if (webview.src?.startsWith('blob:')) {
        URL.revokeObjectURL(webview.src);
      }

      const blob = new Blob([processedContent], {
        type: 'text/html;charset=utf-8',
      });
      const blobUrl = URL.createObjectURL(blob);

      console.log('Setting iframe src to blob URL');
      webview.src = blobUrl;

      // 5秒後にblobURLを解放（メモリリーク防止）
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 5000);
    } catch (blobError) {
      console.error('Blob creation failed:', blobError);
      // フォールバック: data URIを使用
      const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(processedContent)}`;
      webview.src = dataUri;
    }
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

  // X-Frame-Options無効化とAjax/Fetch要求の抑制
  const securityOverride = `
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
    <script>
      // Ajax/Fetch要求を完全に無効化してCORSエラーを防止
      if (typeof XMLHttpRequest !== 'undefined') {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
          // .mapファイルへのリクエストを完全にブロック
          if (url && (url.includes('.map') || url.includes('sourceMappingURL'))) {
            console.log('Source map request blocked:', url);
            return;
          }
          return originalOpen.call(this, method, url, async, user, password);
        };
        
        XMLHttpRequest.prototype.send = function() {
          console.log('XMLHttpRequest blocked for CORS prevention');
          return;
        };
      }
      if (typeof fetch !== 'undefined') {
        const originalFetch = window.fetch;
        window.fetch = function(input, options) {
          // .mapファイルへのリクエストを完全にブロック
          const url = typeof input === 'string' ? input : input.url;
          if (url && (url.includes('.map') || url.includes('sourceMappingURL'))) {
            console.log('Source map fetch blocked:', url);
            return Promise.reject(new Error('Source map fetch blocked'));
          }
          console.log('Fetch API blocked for CORS prevention');
          return Promise.reject(new Error('Fetch blocked for CORS prevention'));
        };
      }
      
      // ソースマップローダーを無効化
      if (typeof window.SourceMap !== 'undefined') {
        window.SourceMap = undefined;
      }
      if (typeof window.sourceMap !== 'undefined') {
        window.sourceMap = undefined;
      }
      
      // history.replaceState エラーを防止
      if (typeof history !== 'undefined' && history.replaceState) {
        history.replaceState = function() {
          console.log('history.replaceState blocked to prevent SecurityError');
          return;
        };
        history.pushState = function() {
          console.log('history.pushState blocked to prevent SecurityError');
          return;
        };
      }
      
      // フォーム送信をインターセプトしてプロキシ経由で処理
      document.addEventListener('submit', function(e) {
        console.log('Form submit event captured:', e.target);
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const form = e.target;
        const formData = new FormData(form);
        const action = form.action || window.location.href;
        
        try {
          const url = new URL(action);
          const params = new URLSearchParams();
          for (const [key, value] of formData.entries()) {
            params.append(key, value);
          }
          
          const finalUrl = url.origin + url.pathname + '?' + params.toString();
          console.log('Form submission intercepted, navigating to:', finalUrl);
          
          // 親ウィンドウ（ブラウザアプリ）に新しいURLでのナビゲーションを要求
          if (window.parent !== window) {
            // postMessageでより安全に通信
            window.parent.postMessage({
              type: 'navigate',
              url: finalUrl
            }, '*');
          } else {
            // フォールバック: 現在のページで処理
            window.location.href = finalUrl;
          }
        } catch (error) {
          console.warn('Form submission failed:', error);
        }
        
        return false;
      }, true);
      
      // より積極的なフォーム要素のハイジャック
      window.addEventListener('DOMContentLoaded', function() {
        // 全てのフォームにonsubmitを直接設定
        document.querySelectorAll('form').forEach(function(form) {
          form.onsubmit = function(e) {
            console.log('Form onsubmit triggered:', this);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            const formData = new FormData(this);
            const action = this.getAttribute('data-original-action') || this.action || window.location.href;
            
            try {
              const url = new URL(action, window.location.href);
              const params = new URLSearchParams();
              for (const [key, value] of formData.entries()) {
                params.append(key, value);
              }
              
              const finalUrl = url.origin + url.pathname + '?' + params.toString();
              console.log('Form onsubmit intercepted, navigating to:', finalUrl);
              
              if (window.parent !== window) {
                window.parent.postMessage({
                  type: 'navigate',
                  url: finalUrl
                }, '*');
              }
            } catch (error) {
              console.warn('Form onsubmit failed:', error);
            }
            
            return false;
          };
          
          // submitボタンのclickイベントも直接処理
          const submitBtns = form.querySelectorAll('button[type="submit"], input[type="submit"]');
          submitBtns.forEach(function(btn) {
            btn.onclick = function(e) {
              console.log('Submit button clicked, triggering form submission');
              e.preventDefault();
              e.stopPropagation();
              form.onsubmit(e);
              return false;
            };
          });
        });
      });
      
      // MutationObserverで動的に追加されるフォームも監視
      const formObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1) {
              if (node.tagName === 'FORM') {
                node.onsubmit = function(e) {
                  e.preventDefault();
                  console.log('Dynamic form submission intercepted');
                  // フォーム処理ロジック
                  return false;
                };
              }
              // フォームの子要素も確認
              const forms = node.querySelectorAll && node.querySelectorAll('form');
              if (forms) {
                forms.forEach(function(form) {
                  form.onsubmit = function(e) {
                    e.preventDefault();
                    console.log('Nested dynamic form submission intercepted');
                    return false;
                  };
                });
              }
            }
          });
        });
      });
      formObserver.observe(document, { childList: true, subtree: true });
      
      // エラーハンドラーでCORSエラーを無視
      window.addEventListener('error', function(e) {
        if (e.message.includes('CORS') || e.message.includes('Origin') || e.message.includes('Access-Control') || 
            e.message.includes('X-Frame-Options') || e.message.includes('404') || e.message.includes('Not Found') ||
            e.message.includes('.map') || e.message.includes('sourceMappingURL') || 
            e.message.includes('WebKitBlobResource') || e.message.includes('blob:') ||
            (e.target && (e.target.src || e.target.href) && (e.target.src.includes('.map') || e.target.href.includes('.map')))) {
          console.log('Error suppressed:', e.message);
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }, true);
      
      // リソース読み込みエラーも個別にハンドリング
      window.addEventListener('load', function() {
        // 全てのリンクとスクリプトタグの404エラーを監視
        document.querySelectorAll('link[href*=".map"], script[src*=".map"]').forEach(function(element) {
          element.remove(); // 完全に削除
          console.log('Map file element removed to prevent 404');
        });
        
        // 動的に追加される.mapファイルの監視
        const observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
              if (node.nodeType === 1) { // Element node
                if ((node.tagName === 'LINK' && node.href && node.href.includes('.map')) ||
                    (node.tagName === 'SCRIPT' && node.src && node.src.includes('.map'))) {
                  node.remove();
                  console.log('Dynamically added map file element removed');
                }
              }
            });
          });
        });
        observer.observe(document, { childList: true, subtree: true });
        
        // 即座に既存の.map要素も削除
        setTimeout(function() {
          document.querySelectorAll('link[href*=".map"], script[src*=".map"]').forEach(function(element) {
            element.remove();
            console.log('Existing map file element removed');
          });
        }, 100);
      }, true);
      
      // unhandledrejection でFetchエラーを無視
      window.addEventListener('unhandledrejection', function(e) {
        if (e.reason && (e.reason.message.includes('CORS') || e.reason.message.includes('Fetch blocked'))) {
          e.preventDefault();
          return false;
        }
      }, true);
    </script>
  `;

  let processedHtml = html
    // 相対URLを絶対URLに変換
    .replace(/href="([^"]*?)"/g, (match, url) => {
      try {
        if (
          url.startsWith('http') ||
          url.startsWith('//') ||
          url.startsWith('#') ||
          url.startsWith('javascript:')
        )
          return match;
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
    })
    // フォームのtarget属性を除去（新しいタブでなく同じタブで開く）
    .replace(/target\s*=\s*["']?[^"'>\s]*["']?/gi, '')
    // フォームのaction属性を一時的に無効化してJavaScriptで完全制御
    .replace(
      /<form([^>]*?)action\s*=\s*["']([^"']*?)["']([^>]*?)>/gi,
      '<form$1data-original-action="$2"$3 onsubmit="return false;">',
    )
    .replace(/<form([^>]*?)>/gi, '<form$1 onsubmit="return false;">')
    // 動的に読み込まれるJavaScriptを無効化
    .replace(
      /<script[^>]*src="([^"]*?)"[^>]*>/gi,
      '<!-- Script disabled for CORS prevention: $1 -->',
    )
    // 外部CSSも無効化（基本的なスタイルは保持）
    .replace(
      /<link[^>]*rel="stylesheet"[^>]*href="([^"]*?)"[^>]*>/gi,
      '<!-- CSS disabled for CORS prevention: $1 -->',
    )
    // インラインCSSからもソースマップ参照を除去
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_match, cssContent) => {
      const cleanedCss = cssContent
        .replace(/\/\*#\s*sourceMappingURL=[^*]*\*\//gi, '')
        .replace(/\/\*\s*#\s*sourceMappingURL=[^*]*\*\//gi, '')
        .replace(/sourceMappingURL=[^;\s\r\n)]+/gi, '');
      return `<style>${cleanedCss}</style>`;
    })
    // インラインJavaScriptからもソースマップ参照を除去
    .replace(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi, (_match, jsContent) => {
      const cleanedJs = jsContent
        .replace(/\/\/# sourceMappingURL=[^\r\n]*/gi, '')
        .replace(/\/\/#sourceMappingURL=[^\r\n]*/gi, '')
        .replace(/\/\/\s*# sourceMappingURL=[^\r\n]*/gi, '');
      return `<script>${cleanedJs}</script>`;
    })
    // .mapファイルへのリンクを完全に除去
    .replace(/<link[^>]*href="[^"]*\.map[^"]*"[^>]*>/gi, '<!-- Map file link removed -->')
    .replace(/<script[^>]*src="[^"]*\.map[^"]*"[^>]*>/gi, '<!-- Map file script removed -->')
    // CSSソースマップファイルの参照を除去（404エラー防止）
    .replace(/\/\*#\s*sourceMappingURL=[^*]+\*\//gi, '')
    .replace(/\/\*# sourceMappingURL=[^*]*\*\//gi, '')
    .replace(/\/\*\s*#\s*sourceMappingURL=[^*]*\*\//gi, '')
    // JSソースマップファイルの参照を除去
    .replace(/\/\/# sourceMappingURL=[^\r\n]*/gi, '')
    .replace(/\/\/#sourceMappingURL=[^\r\n]*/gi, '')
    .replace(/\/\/\s*# sourceMappingURL=[^\r\n]*/gi, '')
    // CSS内でのマップファイル参照も除去
    .replace(/sourceMappingURL=[^;\s\r\n)]+/gi, '')
    // より積極的に.mapファイル名を含む文字列を除去
    .replace(/[^"'\s]*\.css\.map[^"'\s]*/gi, '')
    .replace(/[^"'\s]*\.js\.map[^"'\s]*/gi, '')
    // suggestion_group.css.mapを特に対象として除去
    .replace(/suggestion_group\.css\.map/gi, '')
    // X-Frame-Optionsヘッダーを除去/上書き
    .replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');

  // HTMLの構文チェックと修正
  try {
    // 基本的なHTML構文チェック
    if (!processedHtml.includes('</html>')) {
      processedHtml += '</html>';
    }
    if (!processedHtml.includes('</body>') && processedHtml.includes('<body')) {
      processedHtml = processedHtml.replace(/<\/html>/i, '</body></html>');
    }
    if (!processedHtml.includes('</head>') && processedHtml.includes('<head')) {
      processedHtml = processedHtml.replace(/<body/i, '</head><body');
    }
  } catch (htmlError) {
    console.warn('HTML structure fix failed:', htmlError);
  }

  // headタグにセキュリティオーバーライドを挿入
  if (processedHtml.includes('<head>')) {
    processedHtml = processedHtml.replace(/<head>/i, `<head>${securityOverride}`);
  } else if (processedHtml.includes('<html>')) {
    processedHtml = processedHtml.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${securityOverride}</head>`,
    );
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

// グローバルにナビゲーション関数を公開（iframe内からアクセス可能にするため）
window.navigateToUrl = navigateToUrl;

// iframe内からのpostMessageを受信してナビゲーション処理
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'navigate' && event.data.url) {
    console.log('Received navigation request from iframe:', event.data.url);
    navigateToUrl(event.data.url);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  webview = document.querySelector('#webview');
  urlInput = document.querySelector('#url-input');
  backBtn = document.querySelector('#back-btn');
  forwardBtn = document.querySelector('#forward-btn');
  reloadBtn = document.querySelector('#reload-btn');
  goBtn = document.querySelector('#go-btn');

  backBtn.addEventListener('click', goBack);
  forwardBtn.addEventListener('click', goForward);
  reloadBtn.addEventListener('click', reload);

  goBtn.addEventListener('click', () => {
    navigateToUrl(urlInput.value);
  });

  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      navigateToUrl(urlInput.value);
    }
  });

  updateButtons();
});
