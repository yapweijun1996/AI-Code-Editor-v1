document.addEventListener('DOMContentLoaded', () => {
  // --- Editor and File Tree Elements ---
  const fileTreeContainer = document.getElementById('file-tree');
  const editorContainer = document.getElementById('editor');
  const tabBarContainer = document.getElementById('tab-bar');
  const chatPanel = document.getElementById('chat-panel');
  const openDirectoryButton = document.createElement('button');
  openDirectoryButton.textContent = 'Open Project Folder';
  fileTreeContainer.before(openDirectoryButton);
  let editor;
  let rootDirectoryHandle = null;

  // --- Chat Elements ---
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSendButton = document.getElementById('chat-send-button');
  const chatCancelButton = document.getElementById('chat-cancel-button');
  const modelSelector = document.getElementById('model-selector');
  const agentModeSelector = document.getElementById('agent-mode-selector');
  const apiKeysTextarea = document.getElementById('api-keys-textarea');
  const saveKeysButton = document.getElementById('save-keys-button');
  const thinkingIndicator = document.getElementById('thinking-indicator');
  const toggleFilesButton = document.getElementById('toggle-files-button');
  const imageUploadButton = document.getElementById('image-upload-button');
  const imageInput = document.getElementById('image-input');
  const imagePreviewContainer = document.getElementById(
    'image-preview-container',
  );

  // --- State for multimodal input ---
  let uploadedImage = null; // Will store { name, type, data }

  // --- Context Management Elements ---
  const viewContextButton = document.getElementById('view-context-button');
  const condenseContextButton = document.getElementById(
    'condense-context-button',
  );
  const clearContextButton = document.getElementById('clear-context-button');
  const contextModal = document.getElementById('context-modal');
  const contextDisplay = document.getElementById('context-display');
  const closeModalButton = contextModal.querySelector('.close-button');

  // --- Monaco Editor Initialization ---
  require.config({
    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' },
  });
  require(['vs/editor/editor.main'], () => {
    editor = monaco.editor.create(editorContainer, {
      value: ['// Click "Open Project Folder" to start'].join('\n'),
      language: 'javascript',
      theme: 'vs-dark',
      readOnly: true,
    });
  });

  // --- Prettier Worker ---
  const prettierWorker = new Worker('prettier.worker.js');
  // === IndexedDB Manager for API Keys                            ===
  // =================================================================
  const DbManager = {
    db: null,
    dbName: 'CodeEditorDB',
    stores: {
      keys: 'apiKeys',
      handles: 'fileHandles',
      codeIndex: 'codeIndex',
    },
    async openDb() {
      return new Promise((resolve, reject) => {
        if (this.db) return resolve(this.db);
        const request = indexedDB.open(this.dbName, 3); // Version 3 for new store
        request.onerror = () => reject('Error opening IndexedDB.');
        request.onsuccess = (event) => {
          this.db = event.target.result;
          resolve(this.db);
        };
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(this.stores.keys)) {
            db.createObjectStore(this.stores.keys, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(this.stores.handles)) {
            db.createObjectStore(this.stores.handles, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(this.stores.codeIndex)) {
            db.createObjectStore(this.stores.codeIndex, { keyPath: 'id' });
          }
        };
      });
    },
    async getKeys() {
      const db = await this.openDb();
      return new Promise((resolve) => {
        const request = db
          .transaction(this.stores.keys, 'readonly')
          .objectStore(this.stores.keys)
          .get('userApiKeys');
        request.onerror = () => resolve('');
        request.onsuccess = () =>
          resolve(request.result ? request.result.keys : '');
      });
    },
    async saveKeys(keysString) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const request = db
          .transaction(this.stores.keys, 'readwrite')
          .objectStore(this.stores.keys)
          .put({ id: 'userApiKeys', keys: keysString });
        request.onerror = () => reject('Error saving keys.');
        request.onsuccess = () => resolve();
      });
    },
    async saveDirectoryHandle(handle) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const request = db
          .transaction(this.stores.handles, 'readwrite')
          .objectStore(this.stores.handles)
          .put({ id: 'rootDirectory', handle });
        request.onerror = () => reject('Error saving directory handle.');
        request.onsuccess = () => resolve();
      });
    },
    async getDirectoryHandle() {
      const db = await this.openDb();
      return new Promise((resolve) => {
        const request = db
          .transaction(this.stores.handles, 'readonly')
          .objectStore(this.stores.handles)
          .get('rootDirectory');
        request.onerror = () => resolve(null);
        request.onsuccess = () =>
          resolve(request.result ? request.result.handle : null);
      });
    },
    async clearDirectoryHandle() {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const request = db
          .transaction(this.stores.handles, 'readwrite')
          .objectStore(this.stores.handles)
          .delete('rootDirectory');
        request.onerror = () => reject('Error clearing directory handle.');
        request.onsuccess = () => resolve();
      });
    },
    async saveCodeIndex(index) {
      const db = await this.openDb();
      return new Promise((resolve, reject) => {
        const request = db
          .transaction(this.stores.codeIndex, 'readwrite')
          .objectStore(this.stores.codeIndex)
          .put({ id: 'fullCodeIndex', index });
        request.onerror = () => reject('Error saving code index.');
        request.onsuccess = () => resolve();
      });
    },
    async getCodeIndex() {
      const db = await this.openDb();
      return new Promise((resolve) => {
        const request = db
          .transaction(this.stores.codeIndex, 'readonly')
          .objectStore(this.stores.codeIndex)
          .get('fullCodeIndex');
        request.onerror = () => resolve(null);
        request.onsuccess = () =>
          resolve(request.result ? request.result.index : null);
      });
    },
  };

  // =================================================================
  // === API Key Manager (Handles DB and Rotation)                 ===
  // =================================================================
  const ApiKeyManager = {
    keys: [],
    currentIndex: 0,
    async loadKeys() {
      const keysString = await DbManager.getKeys();
      this.keys = keysString.split('\n').filter((k) => k.trim() !== '');
      apiKeysTextarea.value = keysString;
      this.currentIndex = 0;
    },
    async saveKeys() {
      await DbManager.saveKeys(apiKeysTextarea.value);
      await this.loadKeys();
      alert(`Saved ${this.keys.length} API key(s) to IndexedDB.`);
    },
    getCurrentKey() {
      return this.keys.length > 0 ? this.keys[this.currentIndex] : null;
    },
    rotateKey() {
      if (this.keys.length > 0)
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    },
  };

  // =================================================================
  // === Codebase Intelligence and Indexing                        ===
  // =================================================================
  const CodebaseIndexer = {
    async buildIndex(dirHandle) {
      const index = { files: {} };
      await this.traverseAndIndex(dirHandle, '', index);
      return index;
    },

    async traverseAndIndex(dirHandle, currentPath, index) {
      const ignoreDirs = ['.git', 'node_modules', 'dist', 'build'];
      if (ignoreDirs.includes(dirHandle.name)) return;

      for await (const entry of dirHandle.values()) {
        const newPath = currentPath
          ? `${currentPath}/${entry.name}`
          : entry.name;
        if (
          entry.kind === 'file' &&
          entry.name.match(/\.(js|html|css|md|json|py|java|ts)$/)
        ) {
          try {
            const file = await entry.getFile();
            const content = await file.text();
            index.files[newPath] = this.parseFileContent(content);
          } catch (e) {
            console.warn(`Could not index file: ${newPath}`, e);
          }
        } else if (entry.kind === 'directory') {
          await this.traverseAndIndex(entry, newPath, index);
        }
      }
    },

    parseFileContent(content) {
      const definitions = [];
      const functionRegex1 = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
      const functionRegex2 =
        /const\s+([a-zA-Z0-9_]+)\s*=\s*(\(.*\)|async\s*\(.*\))\s*=>/g;
      const classRegex = /class\s+([a-zA-Z0-9_]+)/g;
      const todoRegex = /\/\/\s*TODO:(.*)/g;

      let match;
      while ((match = functionRegex1.exec(content)) !== null) {
        definitions.push({ type: 'function', name: match[1] });
      }
      while ((match = functionRegex2.exec(content)) !== null) {
        definitions.push({ type: 'function', name: match[1] });
      }
      while ((match = classRegex.exec(content)) !== null) {
        definitions.push({ type: 'class', name: match[1] });
      }
      while ((match = todoRegex.exec(content)) !== null) {
        definitions.push({ type: 'todo', content: match[1].trim() });
      }
      return definitions;
    },

    async queryIndex(index, query) {
      const results = [];
      const lowerCaseQuery = query.toLowerCase();
      for (const filePath in index.files) {
        for (const def of index.files[filePath]) {
          if (
            (def.name && def.name.toLowerCase().includes(lowerCaseQuery)) ||
            (def.content && def.content.toLowerCase().includes(lowerCaseQuery))
          ) {
            results.push({
              file: filePath,
              type: def.type,
              name: def.name || def.content,
            });
          }
        }
      }
      return results;
    },
  };

  // =================================================================
  // === Diff Application Logic                                      ===
  // =================================================================
  function applyDiff(originalContent, diff) {
    // Normalize line endings for both original content and diff to \n
    const normalizeLineEndings = (s) => s.replace(/\r\n/g, '\n');
    originalContent = normalizeLineEndings(originalContent);
    diff = normalizeLineEndings(diff);

    // Decode common HTML entities (handles cases like <, >, &#x3C;)
    function htmlDecode(str) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = str;
      return textarea.value;
    }
    diff = htmlDecode(diff);

    // Replace any hexadecimal escapes (e.g., \x3C) with their character equivalents
    diff = diff.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );

    // Simple debug log: show first 10 lines for both original and diff
    console.log(
      '[applyDiff] --- ORIGINAL ---\\n' +
        originalContent.split('\n').slice(0, 10).join('\n'),
    );
    console.log(
      '[applyDiff] --- DIFF ---\\n' + diff.split('\n').slice(0, 10).join('\n'),
    );

    const patchedContent = Diff.applyPatch(originalContent, diff);
    if (patchedContent === false) {
      console.error('[applyDiff] PATCH FAILED');
      throw new Error(
        'Failed to apply patch. The diff may be invalid or not apply to the file.',
      );
    }
    return patchedContent;
  }

  // =================================================================
  // === Gemini Agentic Chat Manager with Official Tool Calling    ===
  // =================================================================
  const GeminiChat = {
    isSending: false,
    isCancelled: false,
    abortController: null,
    chatSession: null,

    initialize() {
      // This will be called to start a new chat session
    },

    async startOrRestartChatSession() {
      const apiKey = ApiKeyManager.getCurrentKey();
      if (!apiKey) {
        this.appendMessage(
          'Error: No API key provided. Please add one in the settings.',
          'ai',
        );
        return;
      }

      const genAI = new window.GoogleGenerativeAI(apiKey);
      const selectedMode = agentModeSelector.value;

      // Define base tools available in all modes
      const baseTools = {
        functionDeclarations: [
          // ... (keep all tool definitions as they are)
          {
            name: 'create_file',
            description:
              "Creates a new file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. Always use get_project_structure first to check for existing files.",
            parameters: {
              type: 'OBJECT',
              properties: {
                filename: { type: 'STRING' },
                content: { type: 'STRING' },
              },
              required: ['filename', 'content'],
            },
          },
          {
            name: 'delete_file',
            description:
              "Deletes a file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. CRITICAL: Use get_project_structure first to ensure the file exists.",
            parameters: {
              type: 'OBJECT',
              properties: { filename: { type: 'STRING' } },
              required: ['filename'],
            },
          },
          {
            name: 'read_file',
            description:
              "Reads the content of an existing file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. Always use get_project_structure first to get the correct file path.",
            parameters: {
              type: 'OBJECT',
              properties: { filename: { type: 'STRING' } },
              required: ['filename'],
            },
          },
          {
            name: 'get_open_file_content',
            description:
              'Gets the content of the currently open file in the editor.',
          },
          {
            name: 'get_selected_text',
            description:
              'Gets the text currently selected by the user in the editor.',
          },
          {
            name: 'replace_selected_text',
            description:
              'Replaces the currently selected text in the editor with new text.',
            parameters: {
              type: 'OBJECT',
              properties: { new_text: { type: 'STRING' } },
              required: ['new_text'],
            },
          },
          {
            name: 'get_project_structure',
            description:
              'Gets the entire file and folder structure of the project. CRITICAL: Always use this tool before attempting to read or create a file to ensure you have the correct file path.',
          },
          {
            name: 'search_code',
            description:
              'Searches for a specific string in all files in the project (like grep).',
            parameters: {
              type: 'OBJECT',
              properties: { search_term: { type: 'STRING' } },
              required: ['search_term'],
            },
          },
          {
            name: 'run_terminal_command',
            description:
              'Executes a shell command on the backend and returns the output.',
            parameters: {
              type: 'OBJECT',
              properties: { command: { type: 'STRING' } },
              required: ['command'],
            },
          },
          {
            name: 'build_or_update_codebase_index',
            description:
              'Scans the entire codebase to build a searchable index. Slow, run once per session.',
          },
          {
            name: 'query_codebase',
            description: 'Searches the pre-built codebase index.',
            parameters: {
              type: 'OBJECT',
              properties: { query: { type: 'STRING' } },
              required: ['query'],
            },
          },
          {
            name: 'get_file_history',
            description:
              'Retrieves the git commit history for a specific file.',
            parameters: {
              type: 'OBJECT',
              properties: { filename: { type: 'STRING' } },
              required: ['filename'],
            },
          },
          {
            name: 'rewrite_file',
            description: 'Rewrites a file with new content. Overwrites the entire existing file content. IMPORTANT: Use for all file modifications instead of apply_diff.',
            parameters: {
              type: 'OBJECT',
              properties: {
                filename: { type: 'STRING' },
                content: { type: 'STRING' },
              },
              required: ['filename', 'content'],
            },
          },
          {
            name: 'format_code',
            description: 'Formats a specific file using Prettier.',
            parameters: {
              type: 'OBJECT',
              properties: {
                filename: { type: 'STRING' },
              },
              required: ['filename'],
            },
          },
        ],
      };

      let allTools = [baseTools];
      let systemInstructionText = '';

      const now = new Date();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const timeString = now.toLocaleString();

      const baseCodePrompt = `You are an expert AI programmer named Gemini. Your goal is to help users with their coding tasks. You have access to a file system, a terminal, and other tools to help you. Be concise and efficient. When asked to write code, just write the code without too much explanation unless asked. When you need to modify a file, use the 'rewrite_file' tool to overwrite the entire file content. Always format your responses using Markdown. For code, use language-specific code blocks.`;
      const basePlanPrompt = `You are a senior software architect named Gemini. Your goal is to help users plan their projects. When asked for a plan, break down the problem into clear, actionable steps. You can use mermaid syntax to create diagrams. Do not write implementation code unless specifically asked. Always format your responses using Markdown.`;
      const baseSearchPrompt = `You are a research assistant AI. Your primary function is to use the Google Search tool to find the most accurate and up-to-date information for any user query.

**CRITICAL INSTRUCTION: You MUST use the Google Search tool for ANY query that requires external information. Do not rely on your internal knowledge. First, search, then answer.**

Current user context:
- Current Time: ${timeString}
- Timezone: ${timeZone}

Always format your responses using Markdown, and cite your sources.`;

      if (selectedMode === 'search') {
        allTools.push({ googleSearch: {} });
        systemInstructionText = baseSearchPrompt;
      } else if (selectedMode === 'plan') {
        systemInstructionText = basePlanPrompt;
      } else {
        systemInstructionText = baseCodePrompt;
      }

      const modelConfig = {
        model: modelSelector.value,
        systemInstruction: {
          parts: [{ text: systemInstructionText }],
        },
        tools: allTools,
      };

      const model = genAI.getGenerativeModel(modelConfig);

      this.chatSession = model.startChat({
        history: [],
        // The safety settings are optional, but recommended
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
        ],
      });

      console.log(
        'New chat session started with model:',
        modelSelector.value,
        'and mode:',
        agentModeSelector.value,
      );
    },

    appendMessage(text, sender, isStreaming = false) {
      let messageDiv;
      if (isStreaming) {
        const lastMessage = chatMessages.lastElementChild;
        if (lastMessage && lastMessage.classList.contains('ai-streaming')) {
          messageDiv = lastMessage;
        }
      }

      if (!messageDiv) {
        messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}`;
        if (isStreaming) {
          messageDiv.classList.add('ai-streaming');
        }
        chatMessages.appendChild(messageDiv);
      }

      if (sender === 'ai') {
        messageDiv.innerHTML = DOMPurify.sanitize(marked.parse(text));
      } else {
        messageDiv.textContent = text;
      }
      chatMessages.scrollTop = chatMessages.scrollHeight;
    },

    async executeTool(toolCall) {
      const toolName = toolCall.name;
      const parameters = toolCall.args;
      this.appendMessage(
        `AI is using tool: ${toolName} with parameters: ${JSON.stringify(parameters)}`,
        'ai',
      );
      console.log(`[Frontend] Tool Call: ${toolName}`, parameters);

      let result;
      try {
        if (
          !rootDirectoryHandle &&
          [
            'create_file',
            'read_file',
            'search_code',
            'get_project_structure',
            'delete_file',
            'build_or_update_codebase_index',
            'query_codebase',
          ].includes(toolName)
        ) {
          throw new Error(
            "No project folder is open. You must ask the user to click the 'Open Project Folder' button and then try the operation again.",
          );
        }

        switch (toolName) {
          case 'get_project_structure': {
            const tree = await buildTree(rootDirectoryHandle, true);
            const structure_string = formatTreeToString(tree);
            result = { status: 'Success', structure: structure_string };
            break;
          }
          case 'read_file': {
            const fileHandle = await getFileHandleFromPath(
              rootDirectoryHandle,
              parameters.filename,
            );
            const file = await fileHandle.getFile();
            const content = await file.text();
            result = { status: 'Success', content: content };
            break;
          }
          case 'create_file': {
            const fileHandle = await getFileHandleFromPath(
              rootDirectoryHandle,
              parameters.filename,
              { create: true },
            );
            const writable = await fileHandle.createWritable();
            await writable.write(parameters.content);
            await writable.close();
            await refreshFileTree();
            result = {
              status: 'Success',
              message: `File '${parameters.filename}' created successfully.`,
            };
            break;
          }
          case 'delete_file': {
            const { parentHandle, fileNameToDelete } =
              await getParentDirectoryHandle(
                rootDirectoryHandle,
                parameters.filename,
              );
            await parentHandle.removeEntry(fileNameToDelete);
            let handleToDelete = null;
            for (const handle of openFiles.keys()) {
              if (handle.name === fileNameToDelete) {
                handleToDelete = handle;
                break;
              }
            }
            if (handleToDelete) closeTab(handleToDelete);
            await refreshFileTree();
            result = {
              status: 'Success',
              message: `File '${parameters.filename}' deleted successfully.`,
            };
            break;
          }
          case 'search_code': {
            const searchResults = [];
            await searchInDirectory(
              rootDirectoryHandle,
              parameters.search_term,
              '',
              searchResults,
            );
            result = { status: 'Success', results: searchResults };
            break;
          }
          case 'get_open_file_content': {
            if (!activeFileHandle) {
              result = {
                status: 'Error',
                message: 'No file is currently open in the editor.',
              };
            } else {
              const fileData = openFiles.get(activeFileHandle);
              result = {
                status: 'Success',
                filename: fileData.name,
                content: fileData.model.getValue(),
              };
            }
            break;
          }
          case 'get_selected_text': {
            const selection = editor.getSelection();
            if (!selection || selection.isEmpty()) {
              result = {
                status: 'Error',
                message: 'No text is currently selected.',
              };
            } else {
              result = {
                status: 'Success',
                selected_text: editor.getModel().getValueInRange(selection),
              };
            }
            break;
          }
          case 'replace_selected_text': {
            const selection = editor.getSelection();
            if (!selection || selection.isEmpty()) {
              result = {
                status: 'Error',
                message: 'No text is currently selected to be replaced.',
              };
            } else {
              editor.executeEdits('ai-agent', [
                { range: selection, text: parameters.new_text },
              ]);
              result = {
                status: 'Success',
                message: 'Replaced the selected text.',
              };
            }
            break;
          }
          case 'run_terminal_command': {
            const response = await fetch('/api/execute-tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                toolName: 'run_terminal_command',
                parameters: parameters,
              }),
            });
            result = await response.json();
            break;
          }
          case 'build_or_update_codebase_index': {
            this.appendMessage(
              'Building codebase index... This may take a moment.',
              'ai',
            );
            const index = await CodebaseIndexer.buildIndex(rootDirectoryHandle);
            await DbManager.saveCodeIndex(index);
            result = {
              status: 'Success',
              message: 'Codebase index built successfully.',
            };
            break;
          }
          case 'query_codebase': {
            const index = await DbManager.getCodeIndex();
            if (!index) {
              result = {
                status: 'Error',
                message:
                  "No codebase index. Please run 'build_or_update_codebase_index'.",
              };
            } else {
              const queryResults = await CodebaseIndexer.queryIndex(
                index,
                parameters.query,
              );
              result = { status: 'Success', results: queryResults };
            }
            break;
          }
          case 'get_file_history': {
            const command = `git log --pretty=format:"%h - %an, %ar : %s" -- ${parameters.filename}`;
            const response = await fetch('/api/execute-tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                toolName: 'run_terminal_command',
                parameters: { command },
              }),
            });
            result = await response.json();
            break;
          }
          case 'rewrite_file': {
            const fileHandle = await getFileHandleFromPath(
              rootDirectoryHandle,
              parameters.filename,
            );
            const writable = await fileHandle.createWritable();
            await writable.write(parameters.content);
            await writable.close();

            // Update the model in the editor if the file is open
            if (activeFileHandle && activeFileHandle.name === fileHandle.name) {
              const fileData = openFiles.get(activeFileHandle);
              if (fileData) {
                fileData.model.setValue(parameters.content);
              }
            }

            result = {
              status: 'Success',
              message: `File '${parameters.filename}' rewritten successfully.`,
            };
            break;
          }
          case 'format_code': {
            const fileHandle = await getFileHandleFromPath(
              rootDirectoryHandle,
              parameters.filename,
            );
            const file = await fileHandle.getFile();
            const originalContent = await file.text();
            const parser = getPrettierParser(parameters.filename);

            prettierWorker.postMessage({ code: originalContent, parser });

            result = {
              status: 'Success',
              message: `Formatting request for '${parameters.filename}' sent to the worker.`,
            };
            break;
          }
          default:
            result = {
              status: 'Error',
              message: `Unknown tool '${toolName}'.`,
            };
            break;
        }
      } catch (error) {
        result = {
          status: 'Error',
          message: `Error executing tool '${toolName}': ${error.message}`,
        };
      }
      console.log(`[Frontend] Tool Result: ${toolName}`, result);
      this.appendMessage(`Tool ${toolName} finished.`, 'ai');
      return { toolResponse: { name: toolName, response: result } };
    },

    async sendMessage() {
      const userPrompt = chatInput.value.trim();
      if ((!userPrompt && !uploadedImage) || this.isSending) return;

      if (!this.chatSession) {
        await this.startOrRestartChatSession();
        if (!this.chatSession) return;
      }

      this.isSending = true;
      this.isCancelled = false;
      chatSendButton.style.display = 'none';
      chatCancelButton.style.display = 'inline-block';
      thinkingIndicator.style.display = 'block';

      // Prepare initial user message and display it
      let displayMessage = userPrompt;
      const initialParts = [];
      if (userPrompt) initialParts.push({ text: userPrompt });
      if (uploadedImage) {
        displayMessage += `\n📷 Attached: ${uploadedImage.name}`;
        initialParts.push({
          inlineData: {
            mimeType: uploadedImage.type,
            data: uploadedImage.data,
          },
        });
      }
      this.appendMessage(displayMessage.trim(), 'user');
      chatInput.value = '';
      clearImagePreview();

      try {
        let promptParts = initialParts;
        let running = true;

        // Loop to handle potential multi-turn tool calls
        while (running && !this.isCancelled) {
          console.log(
            '[DEBUG] Sending parts to model:',
            JSON.stringify(promptParts, null, 2),
          );
          const result = await this.chatSession.sendMessageStream(promptParts);

          let fullResponseText = '';
          let functionCalls = [];

          // Process the stream for text and function calls
          console.log('[DEBUG] Waiting for stream to process...');
          for await (const chunk of result.stream) {
            if (this.isCancelled) break;

            // Aggregate text
            const chunkText = chunk.text();
            if (chunkText) {
              fullResponseText += chunkText;
              this.appendMessage(fullResponseText, 'ai', true);
            }

            // Aggregate function calls
            const chunkFunctionCalls = chunk.functionCalls();
            if (chunkFunctionCalls) {
              functionCalls.push(...chunkFunctionCalls);
            }
          }
          console.log('[DEBUG] Stream finished.');

          if (this.isCancelled) break;

          if (functionCalls.length > 0) {
            console.log('[DEBUG] Function calls detected:', functionCalls);
            this.appendMessage('AI is using tools...', 'ai');

            const toolPromises = functionCalls.map((call) =>
              this.executeTool(call),
            );
            const toolResults = await Promise.all(toolPromises);

            console.log('[DEBUG] Tool execution results:', toolResults);

            // Prepare the next message with tool results
            promptParts = toolResults.map((toolResult) => ({
              functionResponse: {
                name: toolResult.toolResponse.name,
                response: toolResult.toolResponse.response,
              },
            }));
          } else {
            console.log(
              '[DEBUG] No function calls. Conversation is over for this turn.',
            );
            running = false; // No more tool calls, exit the loop
          }
        }

        if (this.isCancelled) {
          this.appendMessage('Cancelled by user.', 'ai');
        }
      } catch (error) {
        this.appendMessage(`An error occurred: ${error.message}`, 'ai');
        console.error('Chat Error:', error);
      } finally {
        this.isSending = false;
        chatSendButton.style.display = 'inline-block';
        chatCancelButton.style.display = 'none';
        thinkingIndicator.style.display = 'none';
      }
    },

    cancelMessage() {
      if (this.isSending) {
        this.isCancelled = true;
        // The SDK doesn't have a direct abort controller,
        // but we can stop processing the stream.
      }
    },

    async clearHistory() {
      chatMessages.innerHTML = '';
      this.appendMessage('Conversation history cleared.', 'ai');
      await this.startOrRestartChatSession(); // Start a fresh session
    },

    async condenseHistory() {
      if (!this.chatSession) {
        this.appendMessage('No active session to condense.', 'ai');
        return;
      }

      this.appendMessage(
        'Condensing history... This will start a new session.',
        'ai',
      );
      const history = await this.chatSession.getHistory();
      if (history.length === 0) {
        this.appendMessage('History is already empty.', 'ai');
        return;
      }

      const condensationPrompt =
        "Please summarize our conversation so far in a concise way. Include all critical decisions, file modifications, and key insights. The goal is to reduce the context size while retaining the essential information for our ongoing task. Start the summary with 'Here is a summary of our conversation so far:'.";

      const result = await this.chatSession.sendMessage(condensationPrompt);
      const summaryText = result.response.text();

      chatMessages.innerHTML = '';
      this.appendMessage(
        'Original conversation history has been condensed.',
        'ai',
      );
      this.appendMessage(summaryText, 'ai');

      await this.startOrRestartChatSession();
      // The new session will start fresh. For a more advanced implementation,
      // we could inject the summary into the new session's history.
    },

    async viewHistory() {
      if (!this.chatSession) {
        return '[]';
      }
      const history = await this.chatSession.getHistory();
      return JSON.stringify(history, null, 2);
    },
  };

  // =================================================================
  // === File System Access API Logic (Editor)                     ===
  // =================================================================
  async function refreshFileTree() {
    if (rootDirectoryHandle) {
      fileTreeContainer.innerHTML = '';
      const tree = await buildTree(rootDirectoryHandle);
      renderTree(tree, fileTreeContainer);
      openDirectoryButton.style.display = 'none';
      forgetFolderButton.style.display = 'block';
      reconnectButton.style.display = 'none';
    }
  }

  openDirectoryButton.addEventListener('click', async () => {
    try {
      rootDirectoryHandle = await window.showDirectoryPicker();
      await DbManager.saveDirectoryHandle(rootDirectoryHandle);
      await refreshFileTree();
    } catch (error) {
      console.error('Error opening directory:', error);
    }
  });

  const buildTree = async (dirHandle, omitHandles = false) => {
    const tree = { name: dirHandle.name, kind: dirHandle.kind, children: [] };
    if (!omitHandles) {
      tree.handle = dirHandle;
    }
    for await (const entry of dirHandle.values()) {
      tree.children.push(
        entry.kind === 'directory'
          ? await buildTree(entry, omitHandles)
          : {
              name: entry.name,
              kind: entry.kind,
              handle: omitHandles ? undefined : entry,
            },
      );
    }
    return tree;
  };

  const renderTree = (node, element) => {
    const ul = document.createElement('ul');
    node.children
      ?.sort((a, b) => {
        if (a.kind === 'directory' && b.kind !== 'directory') return -1;
        if (a.kind !== 'directory' && b.kind === 'directory') return 1;
        return a.name.localeCompare(b.name);
      })
      .forEach((child) => {
        if (child.kind === 'directory') {
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = child.name;
          details.appendChild(summary);
          renderTree(child, details);
          element.appendChild(details);
        } else {
          const li = document.createElement('li');
          li.textContent = child.name;
          li.classList.add('file');
          li.addEventListener('click', (e) => {
            e.stopPropagation();
            openFile(child.handle);
          });
          ul.appendChild(li);
        }
      });
    if (ul.hasChildNodes()) element.appendChild(ul);
  };

  let openFiles = new Map();
  let activeFileHandle = null;

  const openFile = async (fileHandle) => {
    if (openFiles.has(fileHandle)) {
      await switchTab(fileHandle);
      return;
    }

    try {
      const file = await fileHandle.getFile();
      const content = await file.text();

      openFiles.set(fileHandle, {
        name: file.name,
        content: content,
        model: monaco.editor.createModel(
          content,
          getLanguageFromExtension(file.name.split('.').pop()),
        ),
        viewState: null,
      });

      await switchTab(fileHandle);
      renderTabs();
    } catch (error) {
      console.error(`Failed to open file ${fileHandle.name}:`, error);
    }
  };

  const switchTab = async (fileHandle) => {
    if (activeFileHandle && openFiles.has(activeFileHandle)) {
      openFiles.get(activeFileHandle).viewState = editor.saveViewState();
    }

    activeFileHandle = fileHandle;
    const fileData = openFiles.get(fileHandle);

    editor.setModel(fileData.model);
    if (fileData.viewState) {
      editor.restoreViewState(fileData.viewState);
    }
    editor.focus();
    editor.updateOptions({ readOnly: false });
    renderTabs();
  };

  const closeTab = (fileHandle) => {
    const fileData = openFiles.get(fileHandle);
    if (fileData && fileData.model) {
      fileData.model.dispose();
    }
    openFiles.delete(fileHandle);

    if (activeFileHandle === fileHandle) {
      activeFileHandle = null;
      const nextFile = openFiles.keys().next().value;
      if (nextFile) {
        switchTab(nextFile);
      } else {
        clearEditor();
      }
    }
    renderTabs();
  };

  const renderTabs = () => {
    tabBarContainer.innerHTML = '';
    openFiles.forEach((fileData, fileHandle) => {
      const tab = document.createElement('div');
      tab.className =
        'tab' + (fileHandle === activeFileHandle ? ' active' : '');
      tab.textContent = fileData.name;
      tab.onclick = () => switchTab(fileHandle);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.innerHTML = '&times;';
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeTab(fileHandle);
      };

      tab.appendChild(closeBtn);
      tabBarContainer.appendChild(tab);
    });
  };

  const clearEditor = () => {
    editor.setModel(
      monaco.editor.createModel(
        '// Select a file to view its content',
        'plaintext',
      ),
    );
    editor.updateOptions({ readOnly: true });
    activeFileHandle = null;
    openFiles = new Map();
    renderTabs();
  };

  const saveFile = async () => {
    if (!activeFileHandle) return;
    try {
      const fileData = openFiles.get(activeFileHandle);
      const writable = await activeFileHandle.createWritable();
      await writable.write(fileData.model.getValue());
      await writable.close();
      console.log(`File '${fileData.name}' saved successfully`);
    } catch (error) {
      console.error(`Failed to save file:`, error);
    }
  };

  const getLanguageFromExtension = (ext) =>
    ({
      js: 'javascript',
      ts: 'typescript',
      java: 'java',
      py: 'python',
      html: 'html',
      css: 'css',
      json: 'json',
      md: 'markdown',
    })[ext] || 'plaintext';
    
    function getPrettierParser(filename) {
      const extension = filename.split('.').pop();
      switch (extension) {
        case 'js':
        case 'ts':
        case 'jsx':
        case 'tsx':
          return 'babel';
        case 'html':
          return 'html';
        case 'css':
        case 'scss':
        case 'less':
          return 'css';
        case 'json':
          return 'json';
        case 'md':
          return 'markdown';
        default:
          return 'babel';
      }
    }

  const formatTreeToString = (node, prefix = '') => {
    let result = prefix ? `${prefix}${node.name}\n` : `${node.name}\n`;
    const children = node.children || [];
    children.forEach((child, index) => {
      const isLast = index === children.length - 1;
      const newPrefix =
        prefix +
        (prefix ? (isLast ? '    ' : '│   ') : isLast ? '└── ' : '├── ');
      const childPrefix = prefix + (isLast ? '└── ' : '├── ');
      if (child.kind === 'directory') {
        result += formatTreeToString(child, childPrefix);
      } else {
        result += `${childPrefix}${child.name}\n`;
      }
    });
    return result;
  };

  async function getFileHandleFromPath(dirHandle, path, options = {}) {
    const parts = path.split('/').filter((p) => p);
    let currentHandle = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }
    if (options.create) {
      return await currentHandle.getFileHandle(parts[parts.length - 1], {
        create: true,
      });
    }
    return await currentHandle.getFileHandle(parts[parts.length - 1]);
  }

  async function getParentDirectoryHandle(rootDirHandle, path) {
    const parts = path.split('/').filter((p) => p);
    if (parts.length === 0) {
      throw new Error('Invalid file path provided.');
    }

    let currentHandle = rootDirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }

    const fileNameToDelete = parts[parts.length - 1];
    return { parentHandle: currentHandle, fileNameToDelete };
  }

  async function searchInDirectory(
    dirHandle,
    searchTerm,
    currentPath,
    results,
  ) {
    for await (const entry of dirHandle.values()) {
      const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile();
          const content = await file.text();
          const lines = content.split('\n');
          const fileMatches = [];
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(searchTerm.toLowerCase())) {
              fileMatches.push({
                line_number: i + 1,
                line_content: lines[i].trim(),
              });
            }
          }
          if (fileMatches.length > 0) {
            results.push({
              file: newPath,
              matches: fileMatches,
            });
          }
        } catch (readError) {
          console.warn(`Could not read file ${newPath}:`, readError);
        }
      } else if (entry.kind === 'directory') {
        await searchInDirectory(entry, searchTerm, newPath, results);
      }
    }
  }

  // --- Initial Load & Event Listeners ---
  const reconnectButton = document.createElement('button');
  reconnectButton.textContent = 'Reconnect Project';
  reconnectButton.style.display = 'none';
  fileTreeContainer.before(reconnectButton);

  const forgetFolderButton = document.createElement('button');
  forgetFolderButton.textContent = 'Forget This Folder';
  forgetFolderButton.style.display = 'none';
  fileTreeContainer.before(forgetFolderButton);

  forgetFolderButton.addEventListener('click', async () => {
    await DbManager.clearDirectoryHandle();
    rootDirectoryHandle = null;
    fileTreeContainer.innerHTML = '';
    forgetFolderButton.style.display = 'none';
    openDirectoryButton.style.display = 'block';
    reconnectButton.style.display = 'none';
    clearEditor();
  });

  reconnectButton.addEventListener('click', async () => {
    let savedHandle = await DbManager.getDirectoryHandle();
    if (savedHandle) {
      try {
        if (
          (await savedHandle.requestPermission({ mode: 'readwrite' })) ===
          'granted'
        ) {
          rootDirectoryHandle = savedHandle;
          await refreshFileTree();
        } else {
          alert('Permission to access the folder was denied.');
        }
      } catch (error) {
        console.error('Error requesting permission:', error);
        alert('There was an error reconnecting to the project folder.');
      }
    }
  });

  async function tryRestoreDirectory() {
    const savedHandle = await DbManager.getDirectoryHandle();
    if (!savedHandle) {
      openDirectoryButton.style.display = 'block';
      reconnectButton.style.display = 'none';
      forgetFolderButton.style.display = 'none';
      return;
    }

    if (
      (await savedHandle.queryPermission({ mode: 'readwrite' })) === 'granted'
    ) {
      rootDirectoryHandle = savedHandle;
      await refreshFileTree();
    } else {
      openDirectoryButton.style.display = 'none';
      reconnectButton.style.display = 'block';
      forgetFolderButton.style.display = 'block';
    }
  }

  // =================================================================
  // === Resizable Panel Logic                                     ===
  // =================================================================
  function initResizablePanels() {
    // Store split instance globally to access in toggle logic
    window.splitInstance = Split(['#file-tree-container', '#editor-container', '#chat-panel'], {
      sizes: [15, 55, 30],
      minSize: [0, 300, 200],
      gutterSize: 10,
      cursor: 'col-resize',
      onDragEnd: () => {
        if (editor) {
          editor.layout();
        }
      },
    });
  }

  // --- Initialize Application ---
  initResizablePanels();
  tryRestoreDirectory();
  GeminiChat.initialize();
  ApiKeyManager.loadKeys().then(() => {
    GeminiChat.startOrRestartChatSession();
  });

  saveKeysButton.addEventListener('click', () => ApiKeyManager.saveKeys());
  chatSendButton.addEventListener('click', () => GeminiChat.sendMessage());
  chatCancelButton.addEventListener('click', () => GeminiChat.cancelMessage());

  // Context management listeners
  viewContextButton.addEventListener('click', async () => {
    contextDisplay.textContent = await GeminiChat.viewHistory();
    contextModal.style.display = 'block';
  });

  condenseContextButton.addEventListener('click', () =>
    GeminiChat.condenseHistory(),
  );
  clearContextButton.addEventListener('click', () => GeminiChat.clearHistory());

  closeModalButton.addEventListener('click', () => {
    contextModal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target == contextModal) {
      contextModal.style.display = 'none';
    }
  });

  imageUploadButton.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', handleImageUpload);

  let isFileTreeCollapsed = false;
  toggleFilesButton.addEventListener('click', () => {
    const fileTreePanel = document.getElementById('file-tree-container');
    if (!window.splitInstance || !fileTreePanel) return;

    isFileTreeCollapsed = !isFileTreeCollapsed;

    if (isFileTreeCollapsed) {
      // Hide contents and collapse panel
      fileTreePanel.classList.add('hidden');
      window.splitInstance.setSizes([0, 70, 30]);
    } else {
      // Restore panel and show contents
      fileTreePanel.classList.remove('hidden');
      window.splitInstance.setSizes([15, 55, 30]);
    }
    
    // A brief delay helps the editor layout adjust correctly after the transition
    setTimeout(() => {
      if (editor) {
        editor.layout();
      }
    }, 50);
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      GeminiChat.sendMessage();
    }
  });
  editorContainer.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
  });

  const formatButton = document.getElementById('format-button');
  if (formatButton) {
    formatButton.addEventListener('click', () => {
      if (!activeFileHandle) {
        alert('Please open a file to format.');
        return;
      }

      const fileData = openFiles.get(activeFileHandle);
      const originalContent = fileData.model.getValue();
      const parser = getPrettierParser(fileData.name);

      prettierWorker.onmessage = (event) => {
        if (event.data.success) {
          fileData.model.setValue(event.data.formattedCode);
          console.log(`File '${fileData.name}' formatted successfully.`);
        } else {
          console.error('Error formatting file:', event.data.error);
          alert('An error occurred while formatting the file.');
        }
      };

      prettierWorker.postMessage({ code: originalContent, parser });
    });
  }

  function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImage = {
        name: file.name,
        type: file.type,
        data: e.target.result.split(',')[1], // Get base64 part
      };
      updateImagePreview();
    };
    reader.readAsDataURL(file);
  }

  function updateImagePreview() {
    imagePreviewContainer.innerHTML = '';
    if (uploadedImage) {
      const img = document.createElement('img');
      img.src = `data:${uploadedImage.type};base64,${uploadedImage.data}`;

      const clearButton = document.createElement('button');
      clearButton.id = 'image-preview-clear';
      clearButton.innerHTML = '&times;';
      clearButton.onclick = clearImagePreview;

      imagePreviewContainer.appendChild(img);
      imagePreviewContainer.appendChild(clearButton);
      imagePreviewContainer.style.display = 'block';
    } else {
      imagePreviewContainer.style.display = 'none';
    }
  }

  function clearImagePreview() {
    uploadedImage = null;
    imageInput.value = ''; // Reset the file input
    updateImagePreview();
  }
});
