require('@testing-library/jest-dom');

// Mock Tauri APIs
global.__TAURI__ = {
  core: {
    invoke: jest.fn()
  }
};

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-blob-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Blob
global.Blob = jest.fn().mockImplementation((content, options) => ({
  content,
  options,
  size: content[0].length,
  type: options?.type || ''
}));

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