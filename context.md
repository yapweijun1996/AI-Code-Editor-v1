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

### Phase 3: Context-Aware Editor Actions (Next Steps)

*   **Objective:** Deepen the integration between the AI agent and the code editor.
*   **Next Steps:**
    *   **Editor-Aware Tools:** Add new function declarations for tools like `get_open_file_content()` or `replace_selected_text(new_text)`.
    *   **In-Editor Refactoring:** This will enable powerful commands like "Refactor the function I have selected" or "Add JSDoc comments to the current file."
