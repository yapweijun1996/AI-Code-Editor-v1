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
        dbName: 'ApiKeyDB',
        storeName: 'apiKeys',
        async openDb() {
            return new Promise((resolve, reject) => {
                if (this.db) return resolve(this.db);
                const request = indexedDB.open(this.dbName, 1);
                request.onerror = () => reject("Error opening IndexedDB.");
                request.onsuccess = (event) => { this.db = event.target.result; resolve(this.db); };
                request.onupgradeneeded = (event) => { event.target.result.createObjectStore(this.storeName, { keyPath: 'id' }); };
            });
        },
        async getKeys() {
            const db = await this.openDb();
            return new Promise((resolve) => {
                const request = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).get('userApiKeys');
                request.onerror = () => resolve('');
                request.onsuccess = () => resolve(request.result ? request.result.keys : '');
            });
        },
        async saveKeys(keysString) {
            const db = await this.openDb();
            return new Promise((resolve, reject) => {
                const request = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName).put({ id: 'userApiKeys', keys: keysString });
                request.onerror = () => reject("Error saving keys.");
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
                    "name": "prompt_open_folder",
                    "description": "Asks the user to open a project folder. Use this if a file operation is requested and you are not sure if a folder is open."
                },
                {
                    "name": "create_file",
                    "description": "Creates a new file in the current project directory.",
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
                    "name": "read_file",
                    "description": "Reads the content of an existing file.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": { "filename": { "type": "STRING", "description": "The name of the file to read." } },
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
            this.appendMessage(`Using tool: ${toolName}...`, 'ai');
            let result;
            try {
                switch (toolName) {
                    case 'prompt_open_folder':
                        openDirectoryButton.click();
                        result = { "status": "System", "message": "Prompting user to select a folder. Let the user know they should try their request again after selecting a folder." };
                        break;
                    case 'create_file': {
                        if (!rootDirectoryHandle) {
                            result = { "status": "Error", "message": "No project folder is open. Use prompt_open_folder first." };
                        } else {
                            const fileHandle = await rootDirectoryHandle.getFileHandle(parameters.filename, { create: true });
                            const writable = await fileHandle.createWritable();
                            await writable.write(parameters.content);
                            await writable.close();
                            await refreshFileTree();
                            result = { "status": "Success", "message": `Wrote to ${parameters.filename}.` };
                        }
                        break;
                    }
                    case 'read_file': {
                        if (!rootDirectoryHandle) {
                            result = { "status": "Error", "message": "No project folder is open. Use prompt_open_folder first." };
                        } else {
                            const fileHandle = await rootDirectoryHandle.getFileHandle(parameters.filename);
                            const file = await fileHandle.getFile();
                            result = { "status": "Success", "content": await file.text() };
                        }
                        break;
                    }
                    default:
                        result = { "status": "Error", "message": `Unknown tool '${toolName}'.` };
                }
            } catch (error) {
                result = { "status": "Error", "message": `Error executing tool '${toolName}': ${error.message}` };
            }
            return { "name": toolName, "response": result };
        },

        async runConversation(newContent) {
            this.conversationHistory.push(newContent);
            const model = modelSelector.value;
            let currentAttempt = 0;
            const maxAttempts = ApiKeyManager.keys.length || 1;

            while (currentAttempt < maxAttempts) {
                const apiKey = ApiKeyManager.getCurrentKey();
                if (!apiKey) return { error: 'No API key provided.' };

                try {
                    // Using the v1beta endpoint as requested
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: this.conversationHistory, tools: this.tools })
                    });

                    if (!response.ok) throw new Error(`API Error: ${response.status}`);
                    const data = await response.json();
                    return data.candidates[0].content;

                } catch (error) {
                    console.error(`Attempt ${currentAttempt + 1} failed:`, error.message);
                    ApiKeyManager.rotateKey();
                    currentAttempt++;
                }
            }
            return { error: 'All API keys failed.' };
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
                const toolResult = await this.executeTool(functionCall);
                
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
                this.appendMessage("An unexpected error occurred. The AI response was empty or malformed.", 'ai');
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
            fileTreeContainer.innerHTML = '';
            const tree = await buildTree(rootDirectoryHandle);
            renderTree(tree, fileTreeContainer);
        }
    }

    openDirectoryButton.addEventListener('click', async () => {
        try {
            rootDirectoryHandle = await window.showDirectoryPicker();
            await refreshFileTree();
        } catch (error) { console.error('Error opening directory:', error); }
    });

    const buildTree = async (dirHandle) => {
        const tree = { name: dirHandle.name, kind: dirHandle.kind, handle: dirHandle, children: [] };
        for await (const entry of dirHandle.values()) {
            tree.children.push(entry.kind === 'directory' ? await buildTree(entry) : { name: entry.name, kind: entry.kind, handle: entry });
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

    // --- Initial Load & Event Listeners ---
    GeminiChat.initialize();
    ApiKeyManager.loadKeys();
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
