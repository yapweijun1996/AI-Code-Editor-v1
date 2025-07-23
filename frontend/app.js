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
    const apiKeysTextarea = document.getElementById('api-keys-textarea');
    const saveKeysButton = document.getElementById('save-keys-button');
    const thinkingIndicator = document.getElementById('thinking-indicator');

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
            this.keys = keysString.split('\n').filter(k => k.trim() !== '');
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
    // === Gemini Agentic Chat Manager with Official Tool Calling    ===
    // =================================================================
    const GeminiChat = {
        isSending: false,
        isCancelled: false,
        abortController: null,
        conversationHistory: [],
        turnCounter: 0,
        lastStructureFetchTurn: -1,
        tools: [{
            "functionDeclarations": [
                {
                    "name": "create_file",
                    "description": "Creates a new file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. Always use get_project_structure first to check for existing files.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "filename": { "type": "STRING", "description": "The name of the file to create." },
                            "content": { "type": "STRING", "description": "The content to write into the file." }
                        },
                        "required": ["filename", "content"]
                    }
                },
                {
                    "name": "delete_file",
                    "description": "Deletes a file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. CRITICAL: Use get_project_structure first to ensure the file exists.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "filename": { "type": "STRING", "description": "The path of the file to delete." }
                        },
                        "required": ["filename"]
                    }
                },
                 {
                    "name": "read_file",
                   "description": "Reads the content of an existing file. IMPORTANT: File paths must be relative to the project root. Do NOT include the root folder's name in the path. Always use get_project_structure first to get the correct file path.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": { "filename": { "type": "STRING", "description": "The name of the file to read." } },
                        "required": ["filename"]
                    }
                },
                {
                    "name": "get_open_file_content",
                    "description": "Gets the content of the currently open file in the editor."
                },
                {
                    "name": "get_selected_text",
                    "description": "Gets the text currently selected by the user in the editor."
                },
                {
                    "name": "replace_selected_text",
                    "description": "Replaces the currently selected text in the editor with new text.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": { "new_text": { "type": "STRING", "description": "The new text to replace the selection with." } },
                        "required": ["new_text"]
                    }
                },
                {
                    "name": "get_project_structure",
                    "description": "Gets the entire file and folder structure of the project. CRITICAL: Always use this tool before attempting to read or create a file to ensure you have the correct file path and to avoid overwriting existing files."
                },
                {
                    "name": "search_code",
                    "description": "Searches for a specific string in all files in the project (like grep). Returns the filename, line number, and content for each match.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": { "search_term": { "type": "STRING", "description": "The text to search for." } },
                        "required": ["search_term"]
                    }
                },
                {
                    "name": "run_terminal_command",
                    "description": "Executes a shell command on the backend and returns the output. Use this for tasks like running tests, installing dependencies, or managing processes.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "command": { "type": "STRING", "description": "The command to execute." }
                        },
                        "required": ["command"]
                    }
                },
                {
                    "name": "build_or_update_codebase_index",
                    "description": "Scans the entire codebase to build or update a searchable index of functions, classes, and other key entities. This is slow and should only be run once per session or after major file changes."
                },
                {
                    "name": "query_codebase",
                    "description": "Searches the pre-built codebase index for specific functions, classes, or keywords. Use this for fast, high-level code exploration.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": { "query": { "type": "STRING", "description": "The term to search for in the codebase index." }
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "get_file_history",
                    "description": "Retrieves the git commit history for a specific file to understand its evolution. Requires the file path to be accurate.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": { "filename": { "type": "STRING", "description": "The full path of the file to get the git history for." }
                        },
                        "required": ["filename"]
                    }
                }
            ]
        }],

        initialize() {
            this.conversationHistory = [];
        },

        appendMessage(text, sender) {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${sender}`;
            messageDiv.textContent = text;
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        },

        async executeTool(functionCall) {
            const toolName = functionCall.name;
            const parameters = functionCall.args;
            this.appendMessage(`AI is using tool: ${toolName} with parameters: ${JSON.stringify(parameters)}`, 'ai');
            console.log(`[Frontend] Tool Call: ${toolName}`, parameters);

            let result;
            try {
                 if (!rootDirectoryHandle && ['create_file', 'read_file', 'search_code', 'get_project_structure', 'delete_file', 'build_or_update_codebase_index', 'query_codebase'].includes(toolName)) {
                   throw new Error("No project folder is open. You must ask the user to click the 'Open Project Folder' button and then try the operation again.");
                 } else if (toolName === 'run_terminal_command') {
                    // This tool is special and does not require a folder to be open.
                 }

               switch (toolName) {
                    case 'get_project_structure': {
                        const tree = await buildTree(rootDirectoryHandle, true);
                        const structure_string = formatTreeToString(tree);
                        result = { "status": "Success", "structure": structure_string };
                        this.lastStructureFetchTurn = this.turnCounter;
                        break;
                    }
                    case 'read_file': {
                        const fileHandle = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename);
                        const file = await fileHandle.getFile();
                        const content = await file.text();
                        result = { "status": "Success", "content": content };
                        break;
                    }
                    case 'create_file': {
                        const fileHandle = await getFileHandleFromPath(rootDirectoryHandle, parameters.filename, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(parameters.content);
                        await writable.close();
                        await refreshFileTree();
                        result = { "status": "Success", "message": `File '${parameters.filename}' created successfully.` };
                        break;
                    }
                    case 'delete_file': {
                        const { parentHandle, fileNameToDelete } = await getParentDirectoryHandle(rootDirectoryHandle, parameters.filename);
                        await parentHandle.removeEntry(fileNameToDelete);

                        let handleToDelete = null;
                        for (const handle of openFiles.keys()) {
                            if (handle.name === fileNameToDelete) {
                                handleToDelete = handle;
                                break;
                            }
                        }
                        if (handleToDelete) {
                            closeTab(handleToDelete);
                        }

                        await refreshFileTree();
                        result = { "status": "Success", "message": `File '${parameters.filename}' deleted successfully.` };
                        break;
                    }
                    case 'search_code': {
                         const searchResults = [];
                         await searchInDirectory(rootDirectoryHandle, parameters.search_term, '', searchResults);
                         result = { status: "Success", results: searchResults };
                         break;
                    }
                    case 'get_open_file_content': {
                        if (!activeFileHandle) {
                            result = { "status": "Error", "message": "No file is currently open in the editor." };
                        } else {
                            const fileData = openFiles.get(activeFileHandle);
                            result = { "status": "Success", "filename": fileData.name, "content": fileData.model.getValue() };
                        }
                        break;
                    }
                    case 'get_selected_text': {
                        const selection = editor.getSelection();
                        if (!selection || selection.isEmpty()) {
                            result = { "status": "Error", "message": "No text is currently selected." };
                        } else {
                            result = { "status": "Success", "selected_text": editor.getModel().getValueInRange(selection) };
                        }
                        break;
                    }
                    case 'replace_selected_text': {
                        const selection = editor.getSelection();
                        if (!selection || selection.isEmpty()) {
                            result = { "status": "Error", "message": "No text is currently selected to be replaced." };
                        } else {
                            editor.executeEdits('ai-agent', [{ range: selection, text: parameters.new_text }]);
                            result = { "status": "Success", "message": "Replaced the selected text." };
                        }
                        break;
                    }
                    case 'run_terminal_command': {
                        const response = await fetch('/api/execute-tool', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ toolName: 'run_terminal_command', parameters: parameters })
                        });
                        result = await response.json();
                        break;
                    }
                    case 'build_or_update_codebase_index': {
                       this.appendMessage('Building codebase index... This may take a moment.', 'ai');
                       const index = await CodebaseIndexer.buildIndex(rootDirectoryHandle);
                       await DbManager.saveCodeIndex(index);
                       result = { status: "Success", message: "Codebase index built successfully. You can now use 'query_codebase'." };
                       break;
                   }
                   case 'query_codebase': {
                       const index = await DbManager.getCodeIndex();
                       if (!index) {
                           result = { status: "Error", message: "No codebase index found. Please run 'build_or_update_codebase_index' first." };
                       } else {
                           const queryResults = await CodebaseIndexer.queryIndex(index, parameters.query);
                           result = { status: "Success", results: queryResults };
                       }
                       break;
                   }
                   case 'get_file_history': {
                       const command = `git log --pretty=format:"%h - %an, %ar : %s" -- ${parameters.filename}`;
                       const response = await fetch('/api/execute-tool', {
                           method: 'POST',
                           headers: { 'Content-Type': 'application/json' },
                           body: JSON.stringify({ toolName: 'run_terminal_command', parameters: { command } })
                       });
                       result = await response.json();
                       break;
                   }
                    default:
                        result = { "status": "Error", "message": `Unknown tool '${toolName}'.` };
                        break;
                }
            } catch (error) {
                result = { "status": "Error", "message": `Error executing tool '${toolName}': ${error.message}` };
            }
            console.log(`[Frontend] Tool Result: ${toolName}`, result);
            this.appendMessage(`Tool ${toolName} finished.`, 'ai');
            return { "name": toolName, "response": result };
        },

        async runConversation(newContent, signal) {
            this.conversationHistory.push(newContent);
            let model = modelSelector.value;
            const historySize = JSON.stringify(this.conversationHistory).length;
            const LARGE_CONTEXT_THRESHOLD = 30000; // 30k chars, ~8k tokens

            if (historySize > LARGE_CONTEXT_THRESHOLD) {
                model = 'gemini-2.5-flash';
                console.log(`Context size (${historySize}) exceeds threshold. Switching to ${model} for this request.`);
            }

            let currentAttempt = 0;
            const maxAttempts = ApiKeyManager.keys.length || 1;

            while (currentAttempt < maxAttempts) {
                const apiKey = ApiKeyManager.getCurrentKey();
                if (!apiKey) return { error: 'No API key provided.' };

                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: this.conversationHistory, tools: this.tools }),
                        signal
                    });

                    if (!response.ok) {
                        const errorBody = await response.text();
                        throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
                    }
                    const data = await response.json();
                    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                         throw new Error("Invalid or empty response structure from API.");
                    }
                    return data.candidates[0].content;

                } catch (error) {
                    console.error(`Attempt ${currentAttempt + 1} with model ${model} failed:`, error.message);
                    ApiKeyManager.rotateKey();
                    currentAttempt++;
                    if (signal?.aborted) throw new Error("Request aborted by user.");
                }
            }
            return { error: 'All API keys failed after multiple attempts.' };
        },

        async sendMessage() {
            const userPrompt = chatInput.value.trim();
            if (!userPrompt || this.isSending) return;

            this.isSending = true;
            this.isCancelled = false;
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            chatSendButton.style.display = 'none';
            chatCancelButton.style.display = 'inline-block';
            thinkingIndicator.style.display = 'block';
            this.appendMessage(userPrompt, 'user');
            chatInput.value = '';

            try {
                this.turnCounter = 0;
                let aiResponse = await this.runConversation({ role: 'user', parts: [{ text: userPrompt }] }, signal);

                const MAX_TOOL_CALLS = 10;
                let toolCallCount = 0;

                while (aiResponse && aiResponse.parts && aiResponse.parts[0].functionCall) {
                    if (this.isCancelled) {
                        this.appendMessage("Cancelled by user.", 'ai');
                        break;
                    }
                    this.turnCounter++;
                    if (toolCallCount >= MAX_TOOL_CALLS) {
                        this.appendMessage("The AI has attempted too many consecutive tool calls and has been stopped to prevent a loop. Please try a simpler request.", 'ai');
                        break;
                    }

                    let functionCall = aiResponse.parts[0].functionCall;
                    toolCallCount++;

                    const isFileTool = ['read_file', 'create_file', 'delete_file', 'search_code'].includes(functionCall.name);
                    const isStructureStale = this.lastStructureFetchTurn === -1 || (this.turnCounter - this.lastStructureFetchTurn > 3);

                    if (isFileTool && isStructureStale) {
                        this.appendMessage('Project context may be stale. Proactively fetching structure before proceeding.', 'ai');
                        const structureToolResult = await this.executeTool({ name: 'get_project_structure', args: {} });
                        
                        const structureHistoryPart = { role: 'user', parts: [{ functionResponse: { name: 'get_project_structure', response: structureToolResult.response } }] };
                        this.conversationHistory.push(aiResponse);
                        this.conversationHistory.push(structureHistoryPart);

                        this.appendMessage('Asking AI to re-evaluate its next step with the updated project structure.', 'ai');
                        aiResponse = await this.runConversation({
                            role: 'user',
                            parts: [{ text: `Based on the project structure I just received, please re-evaluate and re-issue the function call to achieve your original goal (which was to use the '${functionCall.name}' tool). Just call the correct tool.` }]
                        }, signal);

                        if (aiResponse && aiResponse.parts && aiResponse.parts[0].functionCall) {
                            functionCall = aiResponse.parts[0].functionCall;
                            this.appendMessage(`AI has re-issued a new tool call: ${functionCall.name}`, 'ai');
                        } else {
                            this.appendMessage('AI did not provide a new tool call after receiving the project structure. Displaying its response.', 'ai');
                            break;
                        }
                    } else {
                        this.conversationHistory.push(aiResponse);
                    }

                    let toolResult = await this.executeTool(functionCall);

                    if (toolResult.response.status === 'Error' && (functionCall.name === 'read_file' || functionCall.name === 'create_file' || functionCall.name === 'delete_file')) {
                        this.appendMessage('File operation failed. Automatically fetching project structure to assist AI...', 'ai');
                        const structureResult = await this.executeTool({ name: 'get_project_structure', args: {} });
                        toolResult.response.message += `\n\nFor your reference, here is the current project structure:\n${structureResult.response.structure}`;
                    }

                    if (this.isCancelled) {
                        this.appendMessage("Cancelled by user.", 'ai');
                        break;
                    }

                    aiResponse = await this.runConversation({
                        role: 'user',
                        parts: [{ functionResponse: toolResult }]
                    }, signal);

                    if (aiResponse && !aiResponse.parts) {
                        this.appendMessage("The AI stopped responding with a valid format. The task may be too complex or have hit an internal limit.", 'ai');
                        break;
                    }
                }

                if (!this.isCancelled) {
                    if (aiResponse && aiResponse.error) {
                        this.appendMessage(aiResponse.error, 'ai');
                    } else if (aiResponse && aiResponse.parts) {
                        const finalResponse = aiResponse.parts[0].text;
                        this.appendMessage(finalResponse, 'ai');
                        this.conversationHistory.push(aiResponse);
                    } else {
                       console.error("Malformed AI Response:", aiResponse);
                       this.appendMessage("An unexpected error occurred. The AI response was empty or malformed. Check the console for details.", 'ai');
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    this.appendMessage('Request cancelled by user.', 'ai');
                } else {
                    this.appendMessage(`An error occurred: ${error.message}`, 'ai');
                    console.error("Chat Error:", error);
                }
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
                if (this.abortController) {
                    this.abortController.abort();
                }
            }
        }
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
        } catch (error) { console.error('Error opening directory:', error); }
    });

    const buildTree = async (dirHandle, omitHandles = false) => {
        const tree = { name: dirHandle.name, kind: dirHandle.kind, children: [] };
        if (!omitHandles) {
            tree.handle = dirHandle;
        }
        for await (const entry of dirHandle.values()) {
            tree.children.push(entry.kind === 'directory' ? await buildTree(entry, omitHandles) : { name: entry.name, kind: entry.kind, handle: omitHandles ? undefined : entry });
        }
        return tree;
    };

    const renderTree = (node, element) => {
        const ul = document.createElement('ul');
        node.children?.sort((a, b) => {
            if (a.kind === 'directory' && b.kind !== 'directory') return -1;
            if (a.kind !== 'directory' && b.kind === 'directory') return 1;
            return a.name.localeCompare(b.name);
        }).forEach(child => {
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
                li.addEventListener('click', (e) => { e.stopPropagation(); openFile(child.handle); });
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

        let activeResizer = null;

        const onMouseDown = (e) => {
            e.preventDefault();
            activeResizer = e.target;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseUp = () => {
            activeResizer = null;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (editor) {
                editor.layout();
            }
        };

        const onMouseMove = (e) => {
            if (!activeResizer) return;

            const containerRect = activeResizer.parentElement.getBoundingClientRect();
            const minPanelWidth = 150;

            if (activeResizer === resizerLeft) {
                let newLeftWidth = e.clientX - containerRect.left;
                if (newLeftWidth < minPanelWidth) newLeftWidth = minPanelWidth;
                
                const editorMinWidth = resizerRight.getBoundingClientRect().left - (containerRect.left + newLeftWidth);
                if (editorMinWidth < minPanelWidth) {
                    newLeftWidth = resizerRight.getBoundingClientRect().left - containerRect.left - minPanelWidth;
                }
                fileTreePanel.style.flexBasis = `${newLeftWidth}px`;

            } else if (activeResizer === resizerRight) {
                let newRightWidth = containerRect.right - e.clientX;
                if (newRightWidth < minPanelWidth) newRightWidth = minPanelWidth;
                
                const editorMinWidth = (containerRect.right - newRightWidth) - resizerLeft.getBoundingClientRect().right;
                if (editorMinWidth < minPanelWidth) {
                    newRightWidth = containerRect.right - resizerLeft.getBoundingClientRect().right - minPanelWidth;
                }
                chatPanel.style.flexBasis = `${newRightWidth}px`;
            }
        };
        
        resizerLeft.addEventListener('mousedown', onMouseDown);
        resizerRight.addEventListener('mousedown', onMouseDown);
    }
    
    // --- Initialize Application ---
    initResizablePanels();
    tryRestoreDirectory();
    GeminiChat.initialize();
    ApiKeyManager.loadKeys();
    
    saveKeysButton.addEventListener('click', () => ApiKeyManager.saveKeys());
    chatSendButton.addEventListener('click', () => GeminiChat.sendMessage());
    chatCancelButton.addEventListener('click', () => GeminiChat.cancelMessage());
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
});
