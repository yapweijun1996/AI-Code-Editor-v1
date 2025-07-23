document.addEventListener('DOMContentLoaded', () => {
    // --- Editor and File Tree Elements ---
    const fileTreeContainer = document.getElementById('file-tree');
    const editorContainer = document.getElementById('editor');
    const tabBarContainer = document.getElementById('tab-bar');
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
   const imagePreviewContainer = document.getElementById('image-preview-container');

   // --- State for multimodal input ---
   let uploadedImage = null; // Will store { name, type, data }
   let attachedUrl = null; // Will store the URL to attach to the next message

   // --- Context Management Elements ---
   const viewContextButton = document.getElementById('view-context-button');
   const condenseContextButton = document.getElementById('condense-context-button');
   const clearContextButton = document.getElementById('clear-context-button');
   const contextModal = document.getElementById('context-modal');
   const contextDisplay = document.getElementById('context-display');
   const closeModalButton = contextModal.querySelector('.close-button');

    // --- Monaco Editor Initialization ---
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }});
    require(['vs/editor/editor.main'], () => {
        editor = monaco.editor.create(editorContainer, {
            value: ['// Click "Open Project Folder" to start'].join('\n'),
            language: 'javascript',
            theme: 'vs-dark',
            readOnly: true
        });
    });

    // =================================================================
    // === IndexedDB Manager for API Keys                            ===
    // =================================================================
    const DbManager = {
        db: null,
        dbName: 'CodeEditorDB',
        stores: {
            keys: 'apiKeys',
            handles: 'fileHandles',
            codeIndex: 'codeIndex'
        },
        async openDb() {
            return new Promise((resolve, reject) => {
                if (this.db) return resolve(this.db);
                const request = indexedDB.open(this.dbName, 3); // Version 3 for new store
                request.onerror = () => reject("Error opening IndexedDB.");
                request.onsuccess = (event) => { this.db = event.target.result; resolve(this.db); };
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
                const request = db.transaction(this.stores.keys, 'readonly').objectStore(this.stores.keys).get('userApiKeys');
                request.onerror = () => resolve('');
                request.onsuccess = () => resolve(request.result ? request.result.keys : '');
            });
        },
        async saveKeys(keysString) {
            const db = await this.openDb();
            return new Promise((resolve, reject) => {
                const request = db.transaction(this.stores.keys, 'readwrite').objectStore(this.stores.keys).put({ id: 'userApiKeys', keys: keysString });
                request.onerror = () => reject("Error saving keys.");
                request.onsuccess = () => resolve();
            });
        },
        async saveDirectoryHandle(handle) {
            const db = await this.openDb();
            return new Promise((resolve, reject) => {
                const request = db.transaction(this.stores.handles, 'readwrite').objectStore(this.stores.handles).put({ id: 'rootDirectory', handle });
                request.onerror = () => reject("Error saving directory handle.");
                request.onsuccess = () => resolve();
            });
        },
        async getDirectoryHandle() {
            const db = await this.openDb();
            return new Promise((resolve) => {
                const request = db.transaction(this.stores.handles, 'readonly').objectStore(this.stores.handles).get('rootDirectory');
                request.onerror = () => resolve(null);
                request.onsuccess = () => resolve(request.result ? request.result.handle : null);
            });
        },
        async clearDirectoryHandle() {
            const db = await this.openDb();
            return new Promise((resolve, reject) => {
                const request = db.transaction(this.stores.handles, 'readwrite').objectStore(this.stores.handles).delete('rootDirectory');
                request.onerror = () => reject("Error clearing directory handle.");
                request.onsuccess = () => resolve();
            });
        },
       async saveCodeIndex(index) {
           const db = await this.openDb();
           return new Promise((resolve, reject) => {
               const request = db.transaction(this.stores.codeIndex, 'readwrite').objectStore(this.stores.codeIndex).put({ id: 'fullCodeIndex', index });
               request.onerror = () => reject("Error saving code index.");
               request.onsuccess = () => resolve();
           });
       },
       async getCodeIndex() {
           const db = await this.openDb();
           return new Promise((resolve) => {
               const request = db.transaction(this.stores.codeIndex, 'readonly').objectStore(this.stores.codeIndex).get('fullCodeIndex');
               request.onerror = () => resolve(null);
               request.onsuccess = () => resolve(request.result ? request.result.index : null);
           });
       }
    };

    // =================================================================
    // === API Key Manager (Handles DB and Rotation)                 ===
    // =================================================================
    const ApiKeyManager = {
        keys: [],
        currentIndex: 0,
        async loadKeys() {
            const keysString = await DbManager.getKeys();
            console.log("[DEBUG] Loaded API keys from IndexedDB:", keysString);
            this.keys = keysString.split('\n').filter(k => k.trim() !== '');
            apiKeysTextarea.value = keysString;
            this.currentIndex = 0;
        },
        async saveKeys() {
            await DbManager.saveKeys(apiKeysTextarea.value);
            await this.loadKeys();
            alert(`Saved ${this.keys.length} API key(s) to IndexedDB.`);
            if (typeof GeminiChat !== "undefined" && GeminiChat.initialize) {
                GeminiChat.initialize();
            }
        },
        getCurrentKey() {
            return this.keys.length > 0 ? this.keys[this.currentIndex] : null;
        },
        rotateKey() {
            if (this.keys.length > 0) this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        }
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
                const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                if (entry.kind === 'file' && entry.name.match(/\.(js|html|css|md|json|py|java|ts)$/)) {
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
            const functionRegex2 = /const\s+([a-zA-Z0-9_]+)\s*=\s*(\(.*\)|async\s*\(.*\))\s*=>/g;
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
                    if ((def.name && def.name.toLowerCase().includes(lowerCaseQuery)) ||
                        (def.content && def.content.toLowerCase().includes(lowerCaseQuery))) {
                        results.push({ file: filePath, type: def.type, name: def.name || def.content });
                    }
                }
            }
            return results;
        }
    };

    // =================================================================
    // === Diff Application Logic                                      ===
    // =================================================================
    function applyDiff(originalContent, diff) {
        const originalLines = originalContent.split('\n');
        const diffLines = diff.split('\n');
        let newLines = [...originalLines];
        let lineOffset = 0;

        const hunkRegex = /^@@ \-(\d+),(\d+) \+(\d+),(\d+) @@/;

        for (let i = 0; i < diffLines.length; i++) {
            const match = hunkRegex.exec(diffLines[i]);
            if (match) {
                const originalStart = parseInt(match[1], 10) - 1;
                const originalLength = parseInt(match[2], 10);
                const newLength = parseInt(match[4], 10);
                
                const toRemove = [];
                const toAdd = [];

                i++;
                
                for(let j = 0; j < originalLength + newLength; j++) {
                    if (i + j >= diffLines.length) break;
                    const line = diffLines[i + j];
                    if (line.startsWith('-')) {
                        toRemove.push(line.substring(1));
                    } else if (line.startsWith('+')) {
                        toAdd.push(line.substring(1));
                    }
                }
                
                newLines.splice(originalStart + lineOffset, originalLength, ...toAdd);
                lineOffset += (toAdd.length - originalLength);
                i += (originalLength + newLength -1);
            }
        }
        return newLines.join('\n');
    }


    // =================================================================
    // === Gemini Agentic Chat Manager with Official Tool Calling    ===
    // =================================================================
    // --- GeminiChat Refactored for Official Tool Calling and Streaming ---
    const GeminiChat = {
        isSending: false,
        chatSession: null,
        genAI: null,
        generativeModel: null,
        tools: [
            {
                name: "get_project_structure",
                description: "Gets the entire file and folder structure of the currently open project.",
                parameters: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: "create_file",
                description: "Creates a new file with the specified content.",
                parameters: {
                    type: "object",
                    properties: {
                        filename: { type: "string", description: "Relative path to the new file." },
                        content: { type: "string", description: "File content." }
                    },
                    required: ["filename", "content"]
                }
            },
            {
                name: "read_file",
                description: "Reads the entire content of an existing file.",
                parameters: {
                    type: "object",
                    properties: {
                        filename: { type: "string", description: "Relative path to the file." }
                    },
                    required: ["filename"]
                }
            },
            {
                name: "delete_file",
                description: "Deletes a specified file from the project.",
                parameters: {
                    type: "object",
                    properties: {
                        filename: { type: "string", description: "Relative path to the file." }
                    },
                    required: ["filename"]
                }
            },
            {
                name: "apply_diff",
                description: "Applies a unified diff patch to a file to modify it.",
                parameters: {
                    type: "object",
                    properties: {
                        filename: { type: "string", description: "Relative path to the file." },
                        diff: { type: "string", description: "Unified diff string." }
                    },
                    required: ["filename", "diff"]
                }
            },
            {
                name: "search_code",
                description: "Searches for a string across all files in the project (case-insensitive).",
                parameters: {
                    type: "object",
                    properties: {
                        search_term: { type: "string", description: "Search string." }
                    },
                    required: ["search_term"]
                }
            },
            {
                name: "get_open_file_content",
                description: "Gets the content of the file currently open in the editor.",
                parameters: { type: "object", properties: {} }
            },
            {
                name: "get_selected_text",
                description: "Gets the text currently highlighted by the user in the editor.",
                parameters: { type: "object", properties: {} }
            },
            {
                name: "replace_selected_text",
                description: "Replaces the currently selected text with new content.",
                parameters: {
                    type: "object",
                    properties: {
                        new_text: { type: "string", description: "Replacement text." }
                    },
                    required: ["new_text"]
                }
            }
        ],

        // --- Icons ---
        SendIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
        SpinnerIcon: `<div class="spinner"></div>`,
        UserIcon: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
        BotIcon: `<svg xmlns="http://www.w3.org/2000/svg" class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm5.5-9.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM12 8c-2.21 0-4-1.79-4-4h8c0 2.21-1.79 4-4 4z"/></svg>`,
        SearchIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-sm"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>`,

        async initialize() {
            const apiKey = ApiKeyManager.getCurrentKey();
            if (apiKey) {
                // Dynamically import the Gemini SDK as an ES module
                const { GoogleGenAI } = await import('https://esm.sh/@google/genai@^1.10.0');
                console.log("[DEBUG] Imported GoogleGenAI:", GoogleGenAI);
                this.genAI = new GoogleGenAI({ apiKey });
                console.log("[DEBUG] this.genAI instance:", this.genAI);
                // The next line may fail if getGenerativeModel is not a function
                this.generativeModel = this.genAI.getGenerativeModel({
                    model: modelSelector.value,
                    tools: this.tools
                });
                this.chatSession = null;
                this.addMessageToChat('model', "Hello! Select a mode and ask a question. The 'Plan + Search' mode can access real-time information from Google.");
            } else {
                this.addMessageToChat('model', "Welcome! Please enter your Gemini API key in the settings below to begin.");
            }
            this.toggleLoading(false); // Set initial button icon
        },

        toggleLoading(isLoading) {
            this.isSending = isLoading;
            chatInput.disabled = isLoading;
            chatSendButton.disabled = isLoading;
            chatSendButton.innerHTML = isLoading ? this.SpinnerIcon : this.SendIcon;
            if (!isLoading) {
              chatInput.focus();
            }
        },

        addMessageToChat(role, text, groundingChunks = []) {
            const messageId = `msg-${Date.now()}`;
            const isModel = role === 'model';

            const messageWrapper = document.createElement('div');
            messageWrapper.className = `chat-message-wrapper ${isModel ? 'model-message' : 'user-message'}`;
            messageWrapper.id = messageId;

            const iconContainer = document.createElement('div');
            iconContainer.className = 'message-icon';
            iconContainer.innerHTML = isModel ? this.BotIcon : this.UserIcon;

            const messageBubble = document.createElement('div');
            messageBubble.className = 'message-bubble';
            
            const messageText = document.createElement('p');
            messageText.className = 'message-text';
            messageText.id = `text-${messageId}`;
            messageText.textContent = text;
            messageBubble.appendChild(messageText);
            
            if (isModel && groundingChunks.length > 0) {
                 const sourcesContainer = this.createSourcesElement(groundingChunks, messageId);
                 messageBubble.appendChild(sourcesContainer);
            }

            messageWrapper.appendChild(iconContainer);
            messageWrapper.appendChild(messageBubble);
            
            chatMessages.appendChild(messageWrapper);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return messageId;
        },
        
        createSourcesElement(chunks, parentId) {
            const sourcesContainer = document.createElement('div');
            sourcesContainer.className = 'sources-container';
            sourcesContainer.id = `sources-${parentId}`;

            const sourcesHeader = document.createElement('h4');
            sourcesHeader.className = 'sources-header';
            sourcesHeader.innerHTML = `${this.SearchIcon} Sources`;
            sourcesContainer.appendChild(sourcesHeader);
            
            const sourcesList = document.createElement('ul');
            sourcesList.className = 'sources-list';
            chunks.forEach(chunk => {
                if (chunk.web?.uri) {
                    const listItem = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = chunk.web.uri;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.className = 'source-link';
                    link.textContent = chunk.web.title || chunk.web.uri;
                    listItem.appendChild(link);
                    sourcesList.appendChild(listItem);
                }
            });
            sourcesContainer.appendChild(sourcesList);
            return sourcesContainer;
        },

        updateLastMessage(messageId, newText, groundingChunks = []) {
             const messageText = document.getElementById(`text-${messageId}`);
             if (messageText) {
                 messageText.textContent = newText;
             }

             const messageBubble = messageText.parentElement;
             let sourcesContainer = document.getElementById(`sources-${messageId}`);
             
             if (groundingChunks.length > 0) {
                 if (!sourcesContainer) {
                     sourcesContainer = this.createSourcesElement(groundingChunks, messageId);
                     messageBubble.appendChild(sourcesContainer);
                 } else {
                     const newList = this.createSourcesElement(groundingChunks, messageId);
                     sourcesContainer.replaceWith(newList);
                 }
             }
        },
        
        // Official tool executor for Gemini function calling
        async toolExecutor(toolName, parameters) {
            let result;
            try {
                if (!rootDirectoryHandle && ['create_file', 'read_file', 'get_project_structure', 'delete_file', 'apply_diff'].includes(toolName)) {
                    throw new Error("No project folder is open. Please open a folder first.");
                }
                switch (toolName) {
                    case 'get_project_structure':
                        const tree = await buildTree(rootDirectoryHandle, true);
                        result = { structure: formatTreeToString(tree) };
                        break;
                    case 'read_file':
                        const fileHandleRead = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename);
                        const fileRead = await fileHandleRead.getFile();
                        result = { content: await fileRead.text() };
                        break;
                    case 'create_file':
                        const fileHandleCreate = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename, { create: true });
                        const writableCreate = await fileHandleCreate.createWritable();
                        await writableCreate.write(parameters.content);
                        await writableCreate.close();
                        await refreshFileTree();
                        result = { message: `File '${parameters.filename}' created.` };
                        break;
                    case 'delete_file':
                        const { parentHandle, fileNameToDelete } = await getParentDirectoryHandle(rootDirectoryHandle, parameters.filename);
                        await parentHandle.removeEntry(fileNameToDelete);
                        openFiles.forEach((_, handle) => {
                            if (handle.name === fileNameToDelete) closeTab(handle);
                        });
                        await refreshFileTree();
                        result = { message: `File '${parameters.filename}' deleted.` };
                        break;
                    case 'apply_diff':
                        const fileHandleDiff = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename);
                        const fileDiff = await fileHandleDiff.getFile();
                        const originalContent = await fileDiff.text();
                        const newContent = applyDiff(originalContent, parameters.diff);
                        const writableDiff = await fileHandleDiff.createWritable();
                        await writableDiff.write(newContent);
                        await writableDiff.close();
                        if (activeFileHandle && activeFileHandle.name === fileHandleDiff.name) {
                            openFiles.get(activeFileHandle)?.model.setValue(newContent);
                        }
                        result = { message: `Diff applied to '${parameters.filename}'.` };
                        break;
                    case 'search_code':
                        const results = [];
                        await searchInDirectory(rootDirectoryHandle, parameters.search_term, '', results);
                        result = { results };
                        break;
                    case 'get_open_file_content':
                        if (activeFileHandle && openFiles.has(activeFileHandle)) {
                            result = { content: openFiles.get(activeFileHandle).model.getValue() };
                        } else {
                            result = { error: "No file is currently open." };
                        }
                        break;
                    case 'get_selected_text':
                        if (editor) {
                            const selection = editor.getModel().getValueInRange(editor.getSelection());
                            result = { selected_text: selection };
                        } else {
                            result = { error: "Editor not initialized." };
                        }
                        break;
                    case 'replace_selected_text':
                        if (editor && parameters.new_text !== undefined) {
                            const selection = editor.getSelection();
                            editor.executeEdits("replace-selected-text", [
                                { range: selection, text: parameters.new_text }
                            ]);
                            result = { message: "Selected text replaced." };
                        } else {
                            result = { error: "Editor not initialized or new_text missing." };
                        }
                        break;
                    default:
                        result = { error: `Unknown tool '${toolName}'.` };
                }
            } catch (error) {
                console.error(`Error executing tool ${toolName}:`, error);
                result = { error: error.message };
            }
            this.addMessageToChat('model', `*Tool ${toolName} finished.*`);
            return result;
        },

        async sendMessage() {
            const userPrompt = chatInput.value.trim();
            if (!userPrompt || this.isSending) return;
            if (!this.genAI || !this.generativeModel) {
                this.addMessageToChat('model', "API key not configured. Please set it in the settings.");
                return;
            }

            this.toggleLoading(true);
            const errorDisplay = document.getElementById('error-display');
            errorDisplay.textContent = '';

            // Display user message
            this.addMessageToChat('user', userPrompt);
            chatInput.value = '';
            clearImagePreview();

            // Prepare for response
            const thinkingMessageId = this.addMessageToChat('model', '...');

            try {
                // Compose system instruction
                const selectedMode = agentModeSelector.value;
                let systemInstruction = "";
                if (selectedMode === "search") {
                    systemInstruction = "You are a helpful AI assistant with access to Google Search. When the user asks for information that may be recent or requires up-to-date knowledge (like current events, specific product details, or exchange rates), you MUST use the Google Search tool to find the answer. Do not tell the user what you *would* find; perform the search and provide the information directly, citing your sources when available.";
                } else if (selectedMode === "code") {
                    systemInstruction = "You are an expert AI programmer. Your goal is to help with coding tasks. Format responses in Markdown.";
                } else {
                    systemInstruction = "You are a senior software architect. Your goal is to plan projects. Break problems into actionable steps. Use mermaid syntax for diagrams. Do not write implementation code unless asked.";
                }

                // JSON mode toggle
                const jsonModeToggle = document.getElementById('json-mode-toggle');
                const jsonMode = jsonModeToggle && jsonModeToggle.checked;

                // Start a new chat session with the official tool calling config
                this.chatSession = await this.generativeModel.startChat({
                    systemInstruction,
                    tools: this.tools,
                    ...(jsonMode ? { generationConfig: { response_mime_type: "application/json" } } : {})
                });

                let fullResponseText = '';
                const collectedChunks = [];

                // Prepare multimodal content if image is uploaded or URL is attached
                let contents = [{ role: "user", parts: [{ text: userPrompt }] }];
                if (uploadedImage) {
                    contents[0].parts.push({
                        inlineData: {
                            mimeType: uploadedImage.type,
                            data: uploadedImage.data
                        }
                    });
                }
                if (attachedUrl) {
                    // For YouTube or webpage, use file_uri for YouTube, url for webpage
                    if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(attachedUrl)) {
                        contents[0].parts.push({
                            file_uri: attachedUrl
                        });
                    } else {
                        contents[0].parts.push({
                            url: attachedUrl
                        });
                    }
                    attachedUrl = null; // Clear after use
                }

                // Stream the response and handle function calls
                const stream = await this.chatSession.sendMessageStream({ contents });

                for await (const chunk of stream) {
                    // Handle function call (tool use)
                    if (chunk.functionCall) {
                        const { name, args } = chunk.functionCall;
                        this.addMessageToChat('model', `*Using tool: ${name}*`);
                        const toolResult = await this.toolExecutor(name, args);
                        await this.chatSession.sendToolResponse({
                            name,
                            response: toolResult
                        });
                        continue;
                    }

                    // Handle text response
                    const chunkText = chunk.text;
                    if (chunkText) {
                        fullResponseText += chunkText;
                    }

                    // Handle grounding metadata (sources)
                    const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
                    if (groundingChunks.length > 0) {
                        groundingChunks.forEach(newChunk => {
                            if (newChunk.web?.uri && !collectedChunks.some(c => c.web.uri === newChunk.web.uri)) {
                                collectedChunks.push(newChunk);
                            }
                        });
                    }
                    this.updateLastMessage(thinkingMessageId, fullResponseText || '...', collectedChunks);
                }

            } catch (e) {
                console.error("Error during sendMessage:", e);
                const errorMessage = e.message || "An unexpected error occurred.";
                this.updateLastMessage(thinkingMessageId, `Sorry, I ran into an error: ${errorMessage}`);
                errorDisplay.textContent = errorMessage;
            } finally {
                this.toggleLoading(false);
            }
        },

        cancelMessage() {
            // Future implementation: Abort controller for fetch requests if needed.
            this.toggleLoading(false);
        },

        async clearHistory() {
            this.chatSession = null;
            chatMessages.innerHTML = '';
            this.addMessageToChat('model', "Conversation history cleared.");
        },

        async condenseHistory() {
            if (!this.chatSession) return alert("No active session to condense.");
            
            this.addMessageToChat('model', "Condensing history... This will start a new session.");
            const history = await this.chatSession.getHistory();
            if (history.length === 0) return;

            const condensationPrompt = "Summarize our conversation concisely, including critical decisions, file modifications, and key insights. Start with 'Here is a summary of our conversation so far:'.";
            const result = await this.chatSession.sendMessage(condensationPrompt);
            const summaryText = result.response.text();
            
            chatMessages.innerHTML = '';
            this.addMessageToChat('model', "History condensed.");
            this.addMessageToChat('model', summaryText);
            
            this.chatSession = null; // Reset session
        },

        async viewHistory() {
            if (!this.chatSession) return "[]";
            const history = await this.chatSession.getHistory();
            return JSON.stringify(history, null, 2);
        }
    };

    // =================================================================
    // === File System Access API Logic (Editor)                     ===
    // =================================================================
    async function refreshFileTree() {
        if (rootDirectoryHandle) {
            if ($.jstree.reference(fileTreeContainer)) {
                $(fileTreeContainer).jstree(true).destroy();
            }
            fileTreeContainer.innerHTML = '';

            const treeData = await buildJsTreeData(rootDirectoryHandle);
            
            $(fileTreeContainer).jstree({
                'core': {
                    'data': treeData,
                    'themes': {
                        'name': 'default-dark',
                        'responsive': true
                    }
                }
            }).on('select_node.jstree', function (e, data) {
                if (data.node.data && data.node.data.handle) {
                    openFile(data.node.data.handle);
                }
            });

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
        } catch (error) { console.error('Error opening directory:', error); }
    });

    const buildJsTreeData = async (dirHandle) => {
        const children = [];
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'directory') {
                children.push({
                    text: entry.name,
                    icon: 'jstree-folder',
                    children: await buildJsTreeData(entry),
                    state: { opened: true }
                });
            } else {
                children.push({
                    text: entry.name,
                    icon: 'jstree-file',
                    data: { handle: entry }, // Store handle here
                    state: { opened: true }
                });
            }
        }
        children.sort((a, b) => {
            const aIsDir = a.icon === 'jstree-folder';
            const bIsDir = b.icon === 'jstree-folder';
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.text.localeCompare(b.text);
        });
        return children;
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
                model: monaco.editor.createModel(content, getLanguageFromExtension(file.name.split('.').pop())),
                viewState: null
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
            tab.className = 'tab' + (fileHandle === activeFileHandle ? ' active' : '');
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
        editor.setModel(monaco.editor.createModel('// Select a file to view its content', 'plaintext'));
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

    const getLanguageFromExtension = (ext) => ({ js: 'javascript', ts: 'typescript', java: 'java', py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown' }[ext] || 'plaintext');

    const formatTreeToString = (node, prefix = '') => {
        let result = prefix ? `${prefix}${node.name}\n` : `${node.name}\n`;
        const children = node.children || [];
        children.forEach((child, index) => {
            const isLast = index === children.length - 1;
            const newPrefix = prefix + (prefix ? (isLast ? '    ' : '│   ') : (isLast ? '└── ' : '├── '));
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
        const parts = path.split('/').filter(p => p);
        let currentHandle = dirHandle;
        for (let i = 0; i < parts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
        }
        if (options.create) {
             return await currentHandle.getFileHandle(parts[parts.length - 1], { create: true });
        }
        return await currentHandle.getFileHandle(parts[parts.length - 1]);
    }

    async function getParentDirectoryHandle(rootDirHandle, path) {
        const parts = path.split('/').filter(p => p);
        if (parts.length === 0) {
            throw new Error("Invalid file path provided.");
        }
        
        let currentHandle = rootDirHandle;
        for (let i = 0; i < parts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
        }
        
        const fileNameToDelete = parts[parts.length - 1];
        return { parentHandle: currentHandle, fileNameToDelete };
    }

    async function searchInDirectory(dirHandle, searchTerm, currentPath, results) {
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
                                line_content: lines[i].trim()
                            });
                        }
                    }
                    if (fileMatches.length > 0) {
                        results.push({
                            file: newPath,
                            matches: fileMatches
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
                if (await savedHandle.requestPermission({ mode: 'readwrite' }) === 'granted') {
                    rootDirectoryHandle = savedHandle;
                    await refreshFileTree();
                } else {
                     alert("Permission to access the folder was denied.");
                }
            } catch (error) {
                console.error("Error requesting permission:", error);
                alert("There was an error reconnecting to the project folder.");
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

        if (await savedHandle.queryPermission({ mode: 'readwrite' }) === 'granted') {
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
        const resizerLeft = document.getElementById('resizer-left');
        const resizerRight = document.getElementById('resizer-right');
        const fileTreePanel = document.getElementById('file-tree-container');
        const chatPanel = document.getElementById('chat-panel');
        const mainContainer = document.querySelector('.container');

        let activeResizer = null;

        const onMouseDown = (e) => {
            e.preventDefault();
            activeResizer = e.target;
            document.body.classList.add('resizing');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseUp = () => {
            activeResizer = null;
            document.body.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (editor) {
                editor.layout();
            }
        };

        const onMouseMove = (e) => {
            if (!activeResizer) return;

            const containerRect = mainContainer.getBoundingClientRect();
            const minPanelWidth = 100; // Minimum width for side panels

            if (activeResizer === resizerLeft) {
                let newLeftWidth = e.clientX - containerRect.left;
                if (newLeftWidth < minPanelWidth) newLeftWidth = minPanelWidth;
                fileTreePanel.style.flexBasis = `${newLeftWidth}px`;

            } else if (activeResizer === resizerRight) {
                let newRightWidth = containerRect.right - e.clientX;
                if (newRightWidth < minPanelWidth) newRightWidth = minPanelWidth;
                chatPanel.style.flexBasis = `${newRightWidth}px`;
            }
        };
        
        resizerLeft.addEventListener('mousedown', onMouseDown);
        resizerRight.addEventListener('mousedown', onMouseDown);
    }
    
    // --- Initialize Application ---
   initResizablePanels();
   tryRestoreDirectory();
   ApiKeyManager.loadKeys().then(() => {
       // Now that keys are loaded, initialize the chat
       GeminiChat.initialize();
   });

   // Re-initialize GeminiChat when model or agent mode changes
   modelSelector.addEventListener('change', () => GeminiChat.initialize());
   agentModeSelector.addEventListener('change', () => GeminiChat.initialize());
    
    saveKeysButton.addEventListener('click', () => ApiKeyManager.saveKeys());
    chatSendButton.addEventListener('click', () => GeminiChat.sendMessage());
    chatCancelButton.addEventListener('click', () => GeminiChat.cancelMessage());
   
   // Context management listeners
   viewContextButton.addEventListener('click', async () => {
       contextDisplay.textContent = await GeminiChat.viewHistory();
       contextModal.style.display = 'block';
   });

   condenseContextButton.addEventListener('click', () => GeminiChat.condenseHistory());
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

   // URL attach logic
   const urlInput = document.getElementById('url-input');
   const urlAttachButton = document.getElementById('url-attach-button');
   urlAttachButton.addEventListener('click', () => {
       const url = urlInput.value.trim();
       if (url) {
           attachedUrl = url;
           urlInput.value = '';
           urlInput.placeholder = 'URL attached!';
           setTimeout(() => {
               urlInput.placeholder = 'Paste YouTube or webpage URL...';
           }, 1200);
       }
   });

    toggleFilesButton.addEventListener('click', () => {
        const fileTreePanel = document.getElementById('file-tree-container');
        const resizerLeft = document.getElementById('resizer-left');
        fileTreePanel.classList.toggle('hidden');
        resizerLeft.classList.toggle('hidden');
        // A brief delay helps the editor layout adjust correctly after the transition
        setTimeout(() => {
            if(editor) {
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

   function handleImageUpload(event) {
       const file = event.target.files[0];
       if (!file) return;

       const reader = new FileReader();
       reader.onload = (e) => {
           uploadedImage = {
               name: file.name,
               type: file.type,
               data: e.target.result.split(',')[1] // Get base64 part
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
