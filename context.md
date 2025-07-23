# Project Plan: Intelligent Browser-based Code Editing Platform

This document outlines the development plan and current architecture for the Intelligent Browser-based Code Editing Platform.

---

### Phase 1: Core Editor and UI (Completed)

*   **Objective:** Create a functional, browser-based editor using the File System Access API and a rich UI for AI interaction.
*   **Features:**
    *   **Local Project Access:** Uses `window.showDirectoryPicker()` for secure, local folder access.
    *   **Monaco Editor:** Integrated for a professional code editing experience.
    *   **AI Chat UI:** A full chat panel with model selection and API key management.
    *   **Secure Key Storage:** API keys are stored in the browser's **IndexedDB**.
    *   **Folder Persistence:** The application remembers the last opened folder and will prompt the user to reopen it on page load for a better user experience.

---

### Phase 2: Production-Grade Agentic AI (Completed)

*   **Objective:** Implement a highly reliable, stateful AI agent using the official Google Gemini Tool Calling API.
*   **Architecture & Workflow:**
    *   **Official Tool Calling:** The application now uses the recommended `tools` parameter in the Gemini API request to formally declare its capabilities. This is more robust than text-based prompt engineering.
    *   **Structured Responses:** The AI no longer mixes text and JSON. It now responds with a dedicated `functionCall` object when it needs to use a tool, which eliminates parsing errors.
    *   **Stateful, Multi-Turn Loop:** The application supports a production-grade conversational loop:
        1.  **User to AI:** Sends the user's prompt and the formal tool declarations.
        2.  **AI to App (Tool Call):** The AI responds with a `functionCall`.
        3.  **App to AI (Tool Response):** The app executes the tool and sends the result back to the AI inside a `functionResponse`.
        4.  **AI to User (Final Answer):** The AI, having received confirmation of the tool's success, generates a final, clean, natural-language response for the user.

---

### Phase 3: Context-Aware Editor Actions (Completed)

*   **Objective:** Deepen the integration between the AI agent and the code editor.
*   **Features:**
    *   **`get_open_file_content`**: The AI can read the content of the currently open file.
    *   **`get_selected_text`**: The AI can get the text that is currently selected in the editor.
    *   **`replace_selected_text`**: The AI can replace the selected text with new content.
    *   **`get_file_tree`**: The AI can get a complete listing of the project's file structure.
    *   **`search_code`**: The AI can search for text across all files in the project, similar to `grep`.

---

### Phase 4: Advanced Features & Refinements (Next Steps)

*   **Objective:** Make the application more powerful, robust, and user-friendly.
*   **Next Steps:**
    *   **Backend Tool Execution:** Move tool execution from the browser to the backend server to overcome browser security limitations and allow for more powerful tools like running terminal commands.
    *   **Streaming AI Responses:** Improve the chat's responsiveness by streaming the AI's response token-by-token.
    *   **UI/UX Enhancements:** Add features like a "Copy" button for code snippets in the chat, loading indicators, and improved file-type icons in the project tree.
    *   **Tabbed Editor:** Allow multiple files to be open in tabs for easier navigation.
    *   **AI-Powered Autocomplete:** Integrate the AI with the editor's autocomplete functionality to provide intelligent code suggestions.
