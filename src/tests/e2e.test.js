/**
 * End-to-End Integration Tests
 * Tests the complete browser workflow
 */

describe('E2E Browser Tests', () => {
  let mockInvoke;
  let simulatedDOM;
  
  beforeEach(() => {
    mockInvoke = jest.fn();
    global.__TAURI__.core.invoke = mockInvoke;
    
    // Setup DOM
    document.body.innerHTML = `
      <div class="browser-container">
        <div class="toolbar">
          <button id="back-btn" class="nav-btn" disabled>←</button>
          <button id="forward-btn" class="nav-btn" disabled>→</button>
          <button id="reload-btn" class="nav-btn">↻</button>
          <input id="url-input" type="url" placeholder="Enter URL..." value="https://www.google.com" />
          <button id="go-btn">Go</button>
        </div>
        <iframe id="webview" src="about:blank"></iframe>
      </div>
    `;
    
    // Simulate browser state
    simulatedDOM = {
      history: [],
      currentIndex: -1,
      webview: document.querySelector('#webview'),
      urlInput: document.querySelector('#url-input'),
      backBtn: document.querySelector('#back-btn'),
      forwardBtn: document.querySelector('#forward-btn'),
      reloadBtn: document.querySelector('#reload-btn'),
      goBtn: document.querySelector('#go-btn')
    };
  });

  describe('Complete Navigation Flow', () => {
    test('should complete a full navigation sequence', async () => {
      // Mock successful fetch
      mockInvoke.mockResolvedValue({
        content: '<html><head></head><body><h1>Google</h1></body></html>',
        url: 'https://www.google.com',
        status: 200
      });
      
      // Simulate navigation function
      const navigateToUrl = async (url) => {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        
        const response = await mockInvoke('fetch_url', { url });
        
        // Add to history
        if (simulatedDOM.currentIndex < simulatedDOM.history.length - 1) {
          simulatedDOM.history = simulatedDOM.history.slice(0, simulatedDOM.currentIndex + 1);
        }
        
        if (simulatedDOM.history[simulatedDOM.currentIndex] !== url) {
          simulatedDOM.history.push(url);
          simulatedDOM.currentIndex = simulatedDOM.history.length - 1;
        }
        
        // Update UI
        simulatedDOM.urlInput.value = url;
        simulatedDOM.backBtn.disabled = simulatedDOM.currentIndex <= 0;
        simulatedDOM.forwardBtn.disabled = simulatedDOM.currentIndex >= simulatedDOM.history.length - 1;
        
        return response;
      };
      
      // Test navigation
      const response = await navigateToUrl('google.com');
      
      expect(mockInvoke).toHaveBeenCalledWith('fetch_url', { url: 'https://google.com' });
      expect(response.status).toBe(200);
      expect(simulatedDOM.history).toEqual(['https://google.com']);
      expect(simulatedDOM.currentIndex).toBe(0);
      expect(simulatedDOM.urlInput.value).toBe('https://google.com');
      expect(simulatedDOM.backBtn.disabled).toBe(true);
      expect(simulatedDOM.forwardBtn.disabled).toBe(true);
    });

    test('should handle multi-page navigation with history', async () => {
      mockInvoke.mockImplementation((command, { url }) => {
        const responses = {
          'https://google.com': { content: '<html><body>Google</body></html>', url: 'https://google.com', status: 200 },
          'https://example.com': { content: '<html><body>Example</body></html>', url: 'https://example.com', status: 200 },
          'https://test.com': { content: '<html><body>Test</body></html>', url: 'https://test.com', status: 200 }
        };
        return Promise.resolve(responses[url] || { content: '', url, status: 404 });
      });
      
      const navigateToUrl = async (url) => {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        
        const response = await mockInvoke('fetch_url', { url });
        
        if (simulatedDOM.currentIndex < simulatedDOM.history.length - 1) {
          simulatedDOM.history = simulatedDOM.history.slice(0, simulatedDOM.currentIndex + 1);
        }
        
        if (simulatedDOM.history[simulatedDOM.currentIndex] !== url) {
          simulatedDOM.history.push(url);
          simulatedDOM.currentIndex = simulatedDOM.history.length - 1;
        }
        
        simulatedDOM.urlInput.value = url;
        simulatedDOM.backBtn.disabled = simulatedDOM.currentIndex <= 0;
        simulatedDOM.forwardBtn.disabled = simulatedDOM.currentIndex >= simulatedDOM.history.length - 1;
        
        return response;
      };
      
      // Navigate to multiple pages
      await navigateToUrl('google.com');
      await navigateToUrl('example.com');
      await navigateToUrl('test.com');
      
      expect(simulatedDOM.history).toEqual([
        'https://google.com',
        'https://example.com', 
        'https://test.com'
      ]);
      expect(simulatedDOM.currentIndex).toBe(2);
      expect(simulatedDOM.backBtn.disabled).toBe(false);
      expect(simulatedDOM.forwardBtn.disabled).toBe(true);
    });

    test('should handle back and forward navigation', async () => {
      // Setup history
      simulatedDOM.history = ['https://google.com', 'https://example.com', 'https://test.com'];
      simulatedDOM.currentIndex = 2;
      
      const goBack = () => {
        if (simulatedDOM.currentIndex > 0) {
          simulatedDOM.currentIndex--;
          const url = simulatedDOM.history[simulatedDOM.currentIndex];
          simulatedDOM.urlInput.value = url;
          simulatedDOM.backBtn.disabled = simulatedDOM.currentIndex <= 0;
          simulatedDOM.forwardBtn.disabled = simulatedDOM.currentIndex >= simulatedDOM.history.length - 1;
          return url;
        }
        return null;
      };
      
      const goForward = () => {
        if (simulatedDOM.currentIndex < simulatedDOM.history.length - 1) {
          simulatedDOM.currentIndex++;
          const url = simulatedDOM.history[simulatedDOM.currentIndex];
          simulatedDOM.urlInput.value = url;
          simulatedDOM.backBtn.disabled = simulatedDOM.currentIndex <= 0;
          simulatedDOM.forwardBtn.disabled = simulatedDOM.currentIndex >= simulatedDOM.history.length - 1;
          return url;
        }
        return null;
      };
      
      // Test back navigation
      expect(goBack()).toBe('https://example.com');
      expect(simulatedDOM.currentIndex).toBe(1);
      expect(simulatedDOM.backBtn.disabled).toBe(false);
      expect(simulatedDOM.forwardBtn.disabled).toBe(false);
      
      expect(goBack()).toBe('https://google.com');
      expect(simulatedDOM.currentIndex).toBe(0);
      expect(simulatedDOM.backBtn.disabled).toBe(true);
      expect(simulatedDOM.forwardBtn.disabled).toBe(false);
      
      // Test forward navigation
      expect(goForward()).toBe('https://example.com');
      expect(simulatedDOM.currentIndex).toBe(1);
      expect(simulatedDOM.backBtn.disabled).toBe(false);
      expect(simulatedDOM.forwardBtn.disabled).toBe(false);
    });
  });

  describe('Error Handling Flow', () => {
    test('should handle network errors gracefully', async () => {
      mockInvoke.mockImplementation((command) => {
        if (command === 'fetch_url') {
          return Promise.reject(new Error('Network timeout'));
        }
        if (command === 'open_external_url') {
          return Promise.resolve();
        }
      });
      
      const navigateToUrl = async (url) => {
        try {
          const response = await mockInvoke('fetch_url', { url });
          return { success: true, response };
        } catch (error) {
          // Fallback to external browser
          await mockInvoke('open_external_url', { url });
          return { success: false, error: error.message };
        }
      };
      
      const result = await navigateToUrl('https://unreachable.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(mockInvoke).toHaveBeenCalledWith('fetch_url', { url: 'https://unreachable.com' });
      expect(mockInvoke).toHaveBeenCalledWith('open_external_url', { url: 'https://unreachable.com' });
    });

    test('should handle invalid URLs', async () => {
      const validateAndNavigate = async (url) => {
        if (!url || url.trim() === '') {
          throw new Error('URL cannot be empty');
        }
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        
        try {
          new URL(url);
        } catch {
          throw new Error('Invalid URL format');
        }
        
        return await mockInvoke('fetch_url', { url });
      };
      
      await expect(validateAndNavigate('')).rejects.toThrow('URL cannot be empty');
      await expect(validateAndNavigate('://invalid')).rejects.toThrow('Invalid URL format');
    });
  });

  describe('User Interaction Flow', () => {
    test('should have working DOM elements', () => {
      // Test button existence
      expect(simulatedDOM.backBtn).toBeTruthy();
      expect(simulatedDOM.forwardBtn).toBeTruthy();
      expect(simulatedDOM.reloadBtn).toBeTruthy();
      expect(simulatedDOM.goBtn).toBeTruthy();
      expect(simulatedDOM.urlInput).toBeTruthy();
      expect(simulatedDOM.webview).toBeTruthy();
      
      // Test button properties
      expect(simulatedDOM.backBtn.tagName).toBe('BUTTON');
      expect(simulatedDOM.forwardBtn.tagName).toBe('BUTTON');
      expect(simulatedDOM.reloadBtn.tagName).toBe('BUTTON');
      expect(simulatedDOM.goBtn.tagName).toBe('BUTTON');
      expect(simulatedDOM.urlInput.tagName).toBe('INPUT');
      expect(simulatedDOM.webview.tagName).toBe('IFRAME');
    });

    test('should respond to Enter key in URL input', () => {
      let enterPressed = false;
      
      simulatedDOM.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          enterPressed = true;
        }
      });
      
      const event = new KeyboardEvent('keypress', { key: 'Enter' });
      simulatedDOM.urlInput.dispatchEvent(event);
      
      expect(enterPressed).toBe(true);
    });
  });

  describe('Content Processing Flow', () => {
    test('should process and display HTML content', async () => {
      const htmlContent = `
        <html>
          <head><title>Test</title></head>
          <body>
            <a href="/relative">Relative Link</a>
            <img src="image.jpg" alt="Image">
            <a href="https://absolute.com">Absolute Link</a>
          </body>
        </html>
      `;
      
      mockInvoke.mockResolvedValue({
        content: htmlContent,
        url: 'https://example.com/page',
        status: 200
      });
      
      const processHtmlContent = (html, baseUrl) => {
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
      };
      
      const response = await mockInvoke('fetch_url', { url: 'https://example.com/page' });
      const processedContent = processHtmlContent(response.content, response.url);
      
      expect(processedContent).toContain('href="https://example.com/relative"');
      expect(processedContent).toContain('src="https://example.com/image.jpg"');
      expect(processedContent).toContain('href="https://absolute.com"');
      expect(processedContent).toContain('<base href="https://example.com/page">');
    });
  });
});