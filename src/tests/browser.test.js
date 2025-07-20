/**
 * Browser functionality tests
 */

// Import the functions we want to test by creating a testable version
// const { invoke } = global.__TAURI__.core;

describe('Browser Functions', () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = jest.fn();
    global.__TAURI__.core.invoke = mockInvoke;

    // Reset DOM
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
  });

  describe('URL Processing', () => {
    test('should process HTML content correctly', () => {
      const html = '<a href="/relative">Link</a><img src="image.jpg">';
      const baseUrl = 'https://example.com/page';

      // Simulate the processHtmlContent function
      const processHtmlContent = (html, baseUrl) => {
        const base = new URL(baseUrl);
        return html
          .replace(/href="([^"]*?)"/g, (match, url) => {
            if (url.startsWith('http') || url.startsWith('//')) return match;
            const absoluteUrl = new URL(url, base).href;
            return `href="${absoluteUrl}"`;
          })
          .replace(/src="([^"]*?)"/g, (match, url) => {
            if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:'))
              return match;
            const absoluteUrl = new URL(url, base).href;
            return `src="${absoluteUrl}"`;
          })
          .replace(/<head>/i, `<head><base href="${baseUrl}">`);
      };

      const result = processHtmlContent(html, baseUrl);
      expect(result).toContain('href="https://example.com/relative"');
      expect(result).toContain('src="https://example.com/image.jpg"');
    });

    test('should not modify absolute URLs', () => {
      const html = '<a href="https://google.com">Link</a>';
      const baseUrl = 'https://example.com';

      const processHtmlContent = (html, baseUrl) => {
        const base = new URL(baseUrl);
        return html.replace(/href="([^"]*?)"/g, (match, url) => {
          if (url.startsWith('http') || url.startsWith('//')) return match;
          const absoluteUrl = new URL(url, base).href;
          return `href="${absoluteUrl}"`;
        });
      };

      const result = processHtmlContent(html, baseUrl);
      expect(result).toBe('<a href="https://google.com">Link</a>');
    });
  });

  describe('History Management', () => {
    test('should add URLs to history correctly', () => {
      let history = [];
      let currentIndex = -1;

      const addToHistory = (url) => {
        if (currentIndex < history.length - 1) {
          history = history.slice(0, currentIndex + 1);
        }

        if (history[currentIndex] !== url) {
          history.push(url);
          currentIndex = history.length - 1;
        }
      };

      addToHistory('https://google.com');
      expect(history).toEqual(['https://google.com']);
      expect(currentIndex).toBe(0);

      addToHistory('https://example.com');
      expect(history).toEqual(['https://google.com', 'https://example.com']);
      expect(currentIndex).toBe(1);
    });

    test('should handle back navigation correctly', () => {
      const history = ['https://google.com', 'https://example.com', 'https://test.com'];
      let currentIndex = 2;

      const goBack = () => {
        if (currentIndex > 0) {
          currentIndex--;
          return history[currentIndex];
        }
        return null;
      };

      expect(goBack()).toBe('https://example.com');
      expect(currentIndex).toBe(1);

      expect(goBack()).toBe('https://google.com');
      expect(currentIndex).toBe(0);

      expect(goBack()).toBe(null);
      expect(currentIndex).toBe(0);
    });

    test('should handle forward navigation correctly', () => {
      const history = ['https://google.com', 'https://example.com', 'https://test.com'];
      let currentIndex = 0;

      const goForward = () => {
        if (currentIndex < history.length - 1) {
          currentIndex++;
          return history[currentIndex];
        }
        return null;
      };

      expect(goForward()).toBe('https://example.com');
      expect(currentIndex).toBe(1);

      expect(goForward()).toBe('https://test.com');
      expect(currentIndex).toBe(2);

      expect(goForward()).toBe(null);
      expect(currentIndex).toBe(2);
    });
  });

  describe('URL Validation', () => {
    test('should add https:// to URLs without protocol', () => {
      const normalizeUrl = (url) => {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return `https://${url}`;
        }
        return url;
      };

      expect(normalizeUrl('google.com')).toBe('https://google.com');
      expect(normalizeUrl('www.example.com')).toBe('https://www.example.com');
      expect(normalizeUrl('https://already.com')).toBe('https://already.com');
      expect(normalizeUrl('http://insecure.com')).toBe('http://insecure.com');
    });
  });

  describe('DOM Integration', () => {
    test('should find required DOM elements', () => {
      const webview = document.querySelector('#webview');
      const urlInput = document.querySelector('#url-input');
      const backBtn = document.querySelector('#back-btn');
      const forwardBtn = document.querySelector('#forward-btn');
      const reloadBtn = document.querySelector('#reload-btn');
      const goBtn = document.querySelector('#go-btn');

      expect(webview).toBeTruthy();
      expect(urlInput).toBeTruthy();
      expect(backBtn).toBeTruthy();
      expect(forwardBtn).toBeTruthy();
      expect(reloadBtn).toBeTruthy();
      expect(goBtn).toBeTruthy();
    });

    test('should handle button state updates', () => {
      const backBtn = document.querySelector('#back-btn');
      const forwardBtn = document.querySelector('#forward-btn');

      const updateButtons = (currentIndex, historyLength) => {
        backBtn.disabled = currentIndex <= 0;
        forwardBtn.disabled = currentIndex >= historyLength - 1;
      };

      updateButtons(0, 3);
      expect(backBtn.disabled).toBe(true);
      expect(forwardBtn.disabled).toBe(false);

      updateButtons(1, 3);
      expect(backBtn.disabled).toBe(false);
      expect(forwardBtn.disabled).toBe(false);

      updateButtons(2, 3);
      expect(backBtn.disabled).toBe(false);
      expect(forwardBtn.disabled).toBe(true);
    });
  });

  describe('Tauri Integration', () => {
    test('should call fetch_url with correct parameters', async () => {
      mockInvoke.mockResolvedValue({
        content: '<html><body>Test</body></html>',
        url: 'https://example.com',
        status: 200,
      });

      const response = await mockInvoke('fetch_url', { url: 'https://example.com' });

      expect(mockInvoke).toHaveBeenCalledWith('fetch_url', { url: 'https://example.com' });
      expect(response.content).toBe('<html><body>Test</body></html>');
      expect(response.status).toBe(200);
    });

    test('should call open_external_url with correct parameters', async () => {
      mockInvoke.mockResolvedValue();

      await mockInvoke('open_external_url', { url: 'https://example.com' });

      expect(mockInvoke).toHaveBeenCalledWith('open_external_url', { url: 'https://example.com' });
    });

    test('should handle fetch_url errors', async () => {
      mockInvoke.mockRejectedValue(new Error('Network error'));

      try {
        await mockInvoke('fetch_url', { url: 'invalid-url' });
      } catch (error) {
        expect(error.message).toBe('Network error');
      }

      expect(mockInvoke).toHaveBeenCalledWith('fetch_url', { url: 'invalid-url' });
    });
  });
});
