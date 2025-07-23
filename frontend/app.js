document.addEventListener('DOMContentLoaded', () => {
    // --- Editor and File Tree Elements ---
    const fileTreeContainer = document.getElementById('file-tree');
    const editorContainer = document.getElementById('editor');
    const openDirectoryButton = document.createElement('button');
    openDirectoryButton.textContent = 'Open Project Folder';
    fileTreeContainer.before(openDirectoryButton);
    let editor;
    let rootDirectoryHandle = null;

    // --- Chat Elements ---
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendButton = document.getElementById('chat-send-button');
    const modelSelector = document.getElementById('model-selector');
    const apiKeysTextarea = document.getElementById('api-keys-textarea');
    const saveKeysButton = document.getElementById('save-keys-button');

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
        dbName: 'CodeEditorDB', // Renamed for clarity
        stores: {
            keys: 'apiKeys',
            handles: 'fileHandles'
        },
        async openDb() {
            return new Promise((resolve, reject) => {
                if (this.db) return resolve(this.db);
                const request = indexedDB.open(this.dbName, 2); // Version 2 for new store
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
    // === Gemini Agentic Chat Manager with Official Tool Calling    ===
    // =================================================================
    const GeminiChat = {
        isSending: false,
        conversationHistory: [],
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
                    "description": "Searches for a specific string in all files in the project (like grep).",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": { "search_term": { "type": "STRING", "description": "The text to search for." } },
                        "required": ["search_term"]
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
                 if (!rootDirectoryHandle && ['create_file', 'read_file', 'search_code', 'get_project_structure', 'delete_file'].includes(toolName)) {
                   throw new Error("No project folder is open. You must ask the user to click the 'Open Project Folder' button and then try the operation again.");
               }

               switch (toolName) {
                    case 'get_project_structure': {
                        const tree = await buildTree(rootDirectoryHandle, true); // true to omit handles
                        const structure_string = formatTreeToString(tree);
                        result = { "status": "Success", "structure": structure_string };
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

                        // If the deleted file was open, clear the editor
                        if (currentFileHandle && currentFileHandle.name === fileNameToDelete) {
                           clearEditor();
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
                        if (!currentFileHandle) {
                            result = { "status": "Error", "message": "No file is currently open in the editor." };
                        } else {
                            result = { "status": "Success", "filename": currentFileHandle.name, "content": editor.getValue() };
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
                    default:
                        result = { "status": "Error", "message": `Unknown tool '${toolName}'.` };
                }
            } catch (error) {
                result = { "status": "Error", "message": `Error executing tool '${toolName}': ${error.message}` };
            }
            console.log(`[Frontend] Tool Result: ${toolName}`, result);
            this.appendMessage(`Tool ${toolName} finished.`, 'ai');
            return { "name": toolName, "response": result };
        },

        async runConversation(newContent) {
            this.conversationHistory.push(newContent);
            let model = modelSelector.value;
            const historySize = JSON.stringify(this.conversationHistory).length;
            const LARGE_CONTEXT_THRESHOLD = 30000; // 30k chars, ~8k tokens

            // If context is large, automatically switch to a model that can handle it
            if (historySize > LARGE_CONTEXT_THRESHOLD) {
                model = 'gemini-1.5-pro-latest';
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
                        body: JSON.stringify({ contents: this.conversationHistory, tools: this.tools })
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
                }
            }
            return { error: 'All API keys failed after multiple attempts.' };
        },

        async sendMessage() {
            const userPrompt = chatInput.value.trim();
            if (!userPrompt || this.isSending) return;

            this.isSending = true;
            chatSendButton.disabled = true;
            this.appendMessage(userPrompt, 'user');
            chatInput.value = '';

            let aiResponse = await this.runConversation({ role: 'user', parts: [{ text: userPrompt }] });

            // Add robust error handling here
            while (aiResponse && aiResponse.parts && aiResponse.parts[0].functionCall) {
                this.conversationHistory.push(aiResponse);
                const functionCall = aiResponse.parts[0].functionCall;
                let toolResult = await this.executeTool(functionCall);

                // If a file-related tool fails, automatically get the project structure to help the AI self-correct.
                if (toolResult.response.status === 'Error' && (functionCall.name === 'read_file' || functionCall.name === 'create_file')) {
                    this.appendMessage('File operation failed. Automatically fetching project structure to assist AI...', 'ai');
                    const structureResult = await this.executeTool({ name: 'get_project_structure', args: {} });
                    toolResult.response.message += `\n\nFor your reference, here is the current project structure:\n${structureResult.response.structure_string}`;
                }
                
                aiResponse = await this.runConversation({
                    role: 'user',
                    parts: [{
                        functionResponse: toolResult
                    }]
                });
            }

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

            this.isSending = false;
            chatSendButton.disabled = false;
        }
    };

    // =================================================================
    // === File System Access API Logic (Editor)                     ===
    // =================================================================
    async function refreshFileTree() {
        if (rootDirectoryHandle) {
            fileTreeContainer.innerHTML = ''; // Clear previous tree
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

    let currentFileHandle = null;
    const openFile = async (fileHandle) => {
        try {
            currentFileHandle = fileHandle;
            const file = await fileHandle.getFile();
            const content = await file.text();
            editor.setValue(content);
            editor.updateOptions({ readOnly: false });
            const extension = file.name.split('.').pop();
            monaco.editor.setModelLanguage(editor.getModel(), getLanguageFromExtension(extension));
        } catch (error) { console.error(`Failed to open file ${fileHandle.name}:`, error); }
    };

    const clearEditor = () => {
        editor.setValue('// Select a file to view its content');
        editor.updateOptions({ readOnly: true });
        monaco.editor.setModelLanguage(editor.getModel(), 'plaintext');
        currentFileHandle = null;
    };

    const saveFile = async () => {
        if (!currentFileHandle) return;
        try {
            const writable = await currentFileHandle.createWritable();
            await writable.write(editor.getValue());
            await writable.close();
            console.log('File saved successfully');
        } catch (error) { console.error(`Failed to save file ${currentFileHandle.name}:`, error); }
    };

    const getLanguageFromExtension = (ext) => ({ js: 'javascript', ts: 'typescript', java: 'java', py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown' }[ext] || 'plaintext');

    // Helper function to format the JSON file tree into a string
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

    // Helper function to get a file or directory handle from a path string
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

    // Helper function to get the parent directory handle and the final filename from a path
    async function getParentDirectoryHandle(rootDirHandle, path) {
        const parts = path.split('/').filter(p => p);
        if (parts.length === 0) {
            throw new Error("Invalid file path provided.");
        }
        
        let currentHandle = rootDirHandle;
        // Traverse to the parent directory
        for (let i = 0; i < parts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
        }
        
        const fileNameToDelete = parts[parts.length - 1];
        return { parentHandle: currentHandle, fileNameToDelete };
    }

    // Helper function to recursively search for a term in the client-side directory
    async function searchInDirectory(dirHandle, searchTerm, currentPath, results) {
        for await (const entry of dirHandle.values()) {
            const newPath = `${currentPath}/${entry.name}`;
            if (entry.kind === 'file') {
                try {
                    const file = await entry.getFile();
                    const content = await file.text();
                    if (content.toLowerCase().includes(searchTerm.toLowerCase())) {
                        results.push({ file: newPath });
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
    forgetFolderButton.style.display = 'none'; // Hide it initially
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
                // This request *is* triggered by user activation (the click)
                if (await savedHandle.requestPermission({ mode: 'readwrite' }) === 'granted') {
                    rootDirectoryHandle = savedHandle;
                    await refreshFileTree();
                } else {
                    // User explicitly denied permission, so we do nothing.
                    // The button remains for them to try again.
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
            // No handle stored, show the initial open button
            openDirectoryButton.style.display = 'block';
            reconnectButton.style.display = 'none';
            forgetFolderButton.style.display = 'none';
            return;
        }

        // Handle exists, check permission silently without prompting
        if (await savedHandle.queryPermission({ mode: 'readwrite' }) === 'granted') {
            // We have permission, proceed to load
            rootDirectoryHandle = savedHandle;
            await refreshFileTree();
        } else {
            // We have a handle but no permission, show the reconnect button
            openDirectoryButton.style.display = 'none';
            reconnectButton.style.display = 'block';
            forgetFolderButton.style.display = 'block';
        }
    }

    GeminiChat.initialize();
    ApiKeyManager.loadKeys();
    tryRestoreDirectory(); // Attempt to restore the directory on load
    saveKeysButton.addEventListener('click', () => ApiKeyManager.saveKeys());
    chatSendButton.addEventListener('click', () => GeminiChat.sendMessage());
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
