// Simple configuration for Gemini API
const generationConfig = {
	temperature: 1,
	topP: 0.95,
	topK: 40,
	maxOutputTokens: 8192,
	responseMimeType: "text/plain",
};

const modelMaxTokens = {
	'gemma-3-27b-it': 8192,
	'gemini-2.5-pro': 65536,
	'gemini-2.5-flash': 65536,
	'gemini-2.0-flash': 8192
};


// Store chat history
let chatHistory = [];

// IndexedDB Helper Functions
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("chatDB", 1);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("history")) {
                db.createObjectStore("history", { keyPath: "id" });
            }
        };
        request.onsuccess = event => {
            window.db = event.target.result;
            resolve(window.db);
        };
        request.onerror = () => reject(request.error);
    });
}

async function loadHistory() {
    const db = window.db;
    if (!db) return [];
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("history", "readonly");
        const store = transaction.objectStore("history");
        const getRequest = store.get(1);
        getRequest.onsuccess = () => {
            const result = getRequest.result;
            resolve(result && result.data ? result.data : []);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

async function saveHistory(data) {
    const db = window.db;
    if (!db) return;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("history", "readwrite");
        const store = transaction.objectStore("history");
        const putRequest = store.put({ id: 1, data });
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
    });
}

async function clearHistory() {
    const db = window.db;
    if (!db) return;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("history", "readwrite");
        const store = transaction.objectStore("history");
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
    });
}

// Clear chat UI and IndexedDB history
async function clearChat() {
    const chatMessages = document.getElementById("chatMessages");
    await clearHistory();
    chatHistory = [];
    // Clear UI messages
    chatMessages.innerHTML = '';
    // Re-add welcome message
    const welcomeMsg = document.createElement("div");
    welcomeMsg.className = "message system";
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    contentDiv.textContent = "👋 Welcome to Gemini ChatBot! Send a message or upload an image to start your AI conversation.";
    welcomeMsg.appendChild(contentDiv);
    chatMessages.appendChild(welcomeMsg);
}


// Start a chat session
async function startChatSession(selectedModel) {
  return {
    sendMessage: async function(messageData) {
      let userMessage = typeof messageData === "string"
        ? { role: "user", parts: [{ text: messageData }] }
        : messageData;

      const requestBody = { contents: [...chatHistory, userMessage], generationConfig };
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + selectedModel + ":generateContent";

      // 用 sendApiRequest 发送请求（自动切换 key）
      const result = await sendApiRequest(url, requestBody);

      if (result.candidates && result.candidates.length > 0) {
        const modelResponse = { role: "model", parts: result.candidates[0].content.parts };
        chatHistory.push(userMessage, modelResponse);
      } else {
        throw new Error("No response from API");
      }
      return result;
    }
  };
}

// Read file as Base64
function readFileAsBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result.split(",")[1]);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

// Append a message to the chat area
function appendMessage(role, text, isLoading = false) {
	const chatMessages = document.getElementById("chatMessages");
	const msgDiv = document.createElement("div");
	msgDiv.className = "message " + role;

	if (isLoading) {
		msgDiv.classList.add("loading");
	}

	// Detect if the text contains HTML tags
	const containsHtml = /<[a-z][\s\S]*>/i.test(text);

	// If it's a user message and contains HTML, wrap it in a code block
	if (role === 'user' && containsHtml) {
		text = '```html\n' + text + '\n```';
	}

	// Convert markdown to HTML
	const contentHtml = marked.parse(text);
	const contentDiv = document.createElement('div');
	contentDiv.className = 'message-content';
	contentDiv.innerHTML = contentHtml;
	msgDiv.appendChild(contentDiv);

	// Highlight code blocks and add copy buttons within content
	contentDiv.querySelectorAll('pre code').forEach(codeEl => {
		hljs.highlightElement(codeEl);
		const copyBtn = document.createElement('button');
		copyBtn.className = 'copy-btn';
		copyBtn.textContent = 'Copy';
		copyBtn.addEventListener('click', () => {
			navigator.clipboard.writeText(codeEl.textContent);
			copyBtn.textContent = 'Copied';
			setTimeout(() => copyBtn.textContent = 'Copy', 2000);
		});
		codeEl.parentNode.appendChild(copyBtn);
	});

	// Add timestamp
	const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
	const timeSpan = document.createElement("div");
	timeSpan.className = "message-timestamp";
	timeSpan.textContent = timestamp;
	if (!isLoading) {
		msgDiv.appendChild(timeSpan);
	}

	chatMessages.appendChild(msgDiv);
	chatMessages.scrollTop = chatMessages.scrollHeight;

	return msgDiv;
}

async function runChat() {
	const userInput = document.getElementById("userInput");
	const imageInput = document.getElementById("imageInput");
	const modelSelect = document.getElementById("modelSelect");
	const messageText = userInput.value.trim();
	const imageFile = imageInput.files[0];
	const selectedModel = modelSelect.value;
	
	if (!messageText && !imageFile) {
		alert("Please enter a message or upload an image.");
		return;
	}
	
	// Show user message
	if (messageText) appendMessage("user", messageText);
	if (imageFile) appendMessage("user", "📷 Image: " + imageFile.name);

	// Clear inputs
	userInput.value = "";
	imageInput.value = "";
	autoResizeTextarea(userInput);
	updateFileLabel();
	updateImagePreview();
	updateImagePreview();

	// Disable input controls while sending
	userInput.disabled = true;
	imageInput.disabled = true;
	modelSelect.disabled = true;
	const sendBtn = document.getElementById("sendBtn");
	sendBtn.disabled = true;
	sendBtn.setAttribute('aria-busy', 'true');
sendBtn.innerHTML = '<span class="spinner" role="status" aria-hidden="true"></span><span>Sending...</span>';

	// Show loading message
	const loadingMsg = appendMessage("model", "🤔 Thinking...", true);
	
	let parts = [];
	if (messageText) parts.push({ text: messageText });
	if (imageFile) {
		try {
			const base64Data = await readFileAsBase64(imageFile);
			parts.push({ inline_data: { data: base64Data, mime_type: imageFile.type } });
		} catch (err) {
			// Remove loading message
			const chatBody = document.getElementById("chatMessages");
			if (loadingMsg && loadingMsg.parentNode) {
				chatBody.removeChild(loadingMsg);
			}
			appendMessage("system", "❌ Error reading image: " + err.message);
			// Re-enable inputs on error
			userInput.disabled = false;
			imageInput.disabled = false;
			modelSelect.disabled = false;
const sendBtn = document.getElementById("sendBtn");
sendBtn.disabled = false;
sendBtn.setAttribute('aria-busy', 'false');
sendBtn.innerHTML = '<span>Send</span>';
updateSendButton();
			return;
		}
	}
	const userMessage = { role: "user", parts };
	
	try {
		const session = await startChatSession(selectedModel);
		const result = await session.sendMessage(userMessage);

		// Remove loading message
		const chatBody = document.getElementById("chatMessages");
		chatBody.removeChild(loadingMsg);

		if (result.candidates && result.candidates.length > 0) {
			const candidate = result.candidates[0];
			const textResponse = candidate.content.parts.filter(p => p.text).map(p => p.text).join("\n");
			appendMessage("model", textResponse || "No text response received.");
			await saveHistory(chatHistory);
		} else {
			appendMessage("system", "⚠️ No response received from the AI model.");
		}
	} catch (err) {
		// Remove loading message
		const chatBody = document.getElementById("chatMessages");
		if (loadingMsg && loadingMsg.parentNode) {
			chatBody.removeChild(loadingMsg);
		}
		appendMessage("system", "❌ Error: " + err.message);
	} finally {
		// Re-enable input controls
		userInput.disabled = false;
		imageInput.disabled = false;
		modelSelect.disabled = false;
		const sendBtn = document.getElementById("sendBtn");
		sendBtn.disabled = false;
		sendBtn.innerHTML = '<span>Send</span>';
		updateSendButton();
		updateImagePreview();
		updateImagePreview();
		updateImagePreview();
	}
}

// Auto-resize textarea
function autoResizeTextarea(textarea) {
	textarea.style.height = 'auto';
	textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';
}

// Update send button state
function updateSendButton() {
	const userInput = document.getElementById("userInput");
	const sendBtn = document.getElementById("sendBtn");
	const hasText = userInput.value.trim().length > 0;
	const hasImage = document.getElementById("imageInput").files.length > 0;

	sendBtn.disabled = !hasText && !hasImage;
sendBtn.setAttribute('aria-disabled', sendBtn.disabled);
	sendBtn.innerHTML = sendBtn.disabled ? '<span>Send</span>' : '<span>Send</span>';
}

// Update file input label
function updateFileLabel() {
	const fileInput = document.getElementById("imageInput");
	const label = document.querySelector('.file-input-label');

	if (fileInput.files.length > 0) {
		label.textContent = '✓';
		label.style.background = 'var(--primary-color)';
		label.style.color = 'white';
		label.title = `Selected: ${fileInput.files[0].name}`;
	} else {
		label.textContent = '📎';
		label.style.background = 'var(--secondary-color)';
		label.style.color = 'var(--text-secondary)';
		label.title = 'Upload image';
	}
}

// Image preview and attachment setup
function updateImagePreview() {
	const previewContainer = document.getElementById('imagePreview');
	if (!previewContainer) return;
	const fileInput = document.getElementById('imageInput');
	const file = fileInput.files[0];
	previewContainer.innerHTML = '';
	if (file) {
		previewContainer.style.display = 'flex';
		const img = document.createElement('img');
		img.src = URL.createObjectURL(file);
		img.className = 'image-preview-img';
		previewContainer.appendChild(img);
		const clearBtn = document.createElement('button');
		clearBtn.className = 'image-preview-clear';
		clearBtn.innerHTML = '&times;';
		clearBtn.addEventListener('click', () => {
			fileInput.value = '';
			updateFileLabel();
			updateSendButton();
			updateImagePreview();
		});
		previewContainer.appendChild(clearBtn);
	} else {
		previewContainer.style.display = 'none';
	}
}

function setupImageAttachment() {
	const chatInput = document.querySelector('.chat-input');
	const previewContainer = document.createElement('div');
	previewContainer.id = 'imagePreview';
	previewContainer.className = 'image-preview';
	previewContainer.style.display = 'none';
	chatInput.insertBefore(previewContainer, chatInput.firstChild);

	const imageInput = document.getElementById('imageInput');

	imageInput.addEventListener('change', () => {
		updateImagePreview();
	});

	const dropZone = document.querySelector('.chat-body');
	dropZone.addEventListener('dragover', e => {
		e.preventDefault();
		dropZone.classList.add('dragover');
	});
	dropZone.addEventListener('dragleave', e => {
		e.preventDefault();
		dropZone.classList.remove('dragover');
	});
	dropZone.addEventListener('drop', e => {
		e.preventDefault();
		dropZone.classList.remove('dragover');
		if (e.dataTransfer.files.length) {
			const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
			if (file) {
				const dt = new DataTransfer();
				dt.items.add(file);
				imageInput.files = dt.files;
				updateFileLabel();
				updateSendButton();
				updateImagePreview();
			}
		}
	});

	document.addEventListener('paste', e => {
		if (e.clipboardData && e.clipboardData.files.length > 0) {
			const file = Array.from(e.clipboardData.files).find(f => f.type.startsWith('image/'));
			if (file) {
				const dt = new DataTransfer();
				dt.items.add(file);
				imageInput.files = dt.files;
				updateFileLabel();
				updateSendButton();
				updateImagePreview();
			}
		}
	});
}

// Event listeners
document.getElementById("sendBtn").addEventListener("click", runChat);

const userInput = document.getElementById("userInput");
userInput.addEventListener("keypress", function(e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		runChat();
	}
});

userInput.addEventListener("input", function() {
	autoResizeTextarea(this);
	updateSendButton();
});

document.getElementById("imageInput").addEventListener("change", function() {
	updateFileLabel();
	updateSendButton();
});

// Initialize
document.addEventListener("DOMContentLoaded", async function() {
    // Theme handling: load saved theme and apply
    const themeSelectEl = document.getElementById("themeSelect");
    function applyTheme(theme) {
        if (theme === 'system') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }
    const savedTheme = localStorage.getItem('theme') || 'system';
    themeSelectEl.value = savedTheme;
    applyTheme(savedTheme);

    // Load saved model and apply
    const modelSelectEl = document.getElementById("modelSelect");
    const savedModel = localStorage.getItem('selectedModel') || 'gemini-2.5-pro';
    modelSelectEl.value = savedModel;
    generationConfig.maxOutputTokens = modelMaxTokens[savedModel] || generationConfig.maxOutputTokens;
    modelSelectEl.addEventListener("change", function() {
		generationConfig.maxOutputTokens = modelMaxTokens[this.value] || generationConfig.maxOutputTokens;
	});
    themeSelectEl.addEventListener('change', () => {
        const selected = themeSelectEl.value;
        localStorage.setItem('theme', selected);
        applyTheme(selected);
    });
    await initDB();
    updateSendButton();
    updateFileLabel();
    autoResizeTextarea(userInput);
    document.getElementById("userInput").focus();
    setupImageAttachment();
    // Load chat history
    const history = await loadHistory();
    if (history && history.length) {
        chatHistory = history;
        history.forEach(msg => {
            msg.parts.forEach(part => {
                if (part.text) {
                    appendMessage(msg.role, part.text);
                } else if (part.inline_data) {
                    appendMessage(msg.role, '📷 Image');
                }
            });
        });
    }
    // Wire up clear chat button
    const clearBtn = document.getElementById("clearChatBtn");
    clearBtn.addEventListener("click", clearChat);

    // Settings modal open/close logic
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settingsModal");
    const saveSettingsBtn = document.getElementById("saveSettingsBtn");
    const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");

    settingsBtn.addEventListener("click", () => {
        settingsModal.hidden = false;
    });
    cancelSettingsBtn.addEventListener("click", () => {
        settingsModal.hidden = true;
    });
    saveSettingsBtn.addEventListener("click", () => {
        const selectedModel = document.getElementById("modelSelect").value;
        localStorage.setItem('selectedModel', selectedModel);
        generationConfig.maxOutputTokens = modelMaxTokens[selectedModel] || generationConfig.maxOutputTokens;
        settingsModal.hidden = true;
    });
});
