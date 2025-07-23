# Project Improvement Plan

This document outlines the necessary steps to resolve the ongoing issues with the AI agent and to improve the overall quality of the codebase.

## 1. AI Agent Tool Usage

**Problem:** The AI agent is not consistently using its provided tools, often defaulting to generic, non-contextual answers. This is because the system prompt is not explicit enough in guiding the AI's behavior.

**Solution:**

*   **Modularize `app.js`**: The primary `frontend/app.js` file has grown quite large. It should be broken down into smaller, more focused modules. This will dramatically improve readability and simplify maintenance.
    *   **Proposed Modules**:
        *   `uiManager.js`: Handles all DOM manipulation, including the file tree, chat messages, and panel resizing.
        *   `geminiChat.js`: Encapsulates all logic for interacting with the Gemini API, including conversation history and tool execution.
        *   `fileSystem.js`: Contains all functions related to the File System Access API (`buildTree`, `openFile`, `saveFile`, etc.).
        *   `dbManager.js`: Manages all IndexedDB operations.
        *   `state.js`: A central module to hold and manage the application's shared state.

*   **Centralized State Management**: Currently, state variables like `rootDirectoryHandle`, `currentFileHandle`, and `isSending` are scattered. Centralizing them into a single state object would make state transitions more predictable and simplify debugging.

*   **Configuration File**: Move hardcoded values, such as CSS selectors, API endpoints, and model names, into a dedicated configuration object or a `config.js` file. This makes them easier to find and modify.

*   **Refine CSS with Variables**: Utilize CSS custom properties (variables) for colors, fonts, and spacing. This would make theming (e.g., adding a dark/light mode switcher) significantly easier and ensure greater UI consistency.

---

## 2. Feature Enhancements

These are new features that would significantly expand the application's capabilities.

*   **Tabbed File Interface**: Implement a tab bar in the editor panel to allow users to have multiple files open at once and easily switch between them. This is a standard feature in modern editors and a major productivity booster.

*   **File Tree Icons**: Enhance the file tree by adding icons to visually differentiate between file types (e.g., JS, HTML, CSS, JSON) and folders.

*   **Implement Backend Terminal Tool**: The backend has a placeholder for executing tools. A high-impact feature would be to implement a `run_terminal_command` tool. This would allow the AI to perform powerful actions like installing dependencies (`npm install`), running tests, or executing scripts, transforming the application into a more capable development environment.

*   **AI "Thinking" Indicator**: Add a visual indicator in the chat UI (e.g., a subtle pulsing animation or a "Bot is thinking..." message) that appears while waiting for the Gemini API response. This provides essential feedback to the user, so the application doesn't feel unresponsive.

*   **File Search within Editor**: Add a search/replace widget within the Monaco editor itself (using its built-in capabilities) for finding text in the currently open file.

---

## 3. User Experience (UX)

These changes focus on making the application more intuitive, polished, and enjoyable to use.

*   **UI Component Framework**: To create a more modern and maintainable UI, consider adopting a lightweight component framework like **Lit** or **Preact**. This would replace the current manual DOM manipulation with a more structured, declarative approach.

*   **Theme Switcher (Light/Dark Mode)**: Build upon the CSS variables suggestion to add a simple toggle that allows users to switch between a light and dark theme.

*   **Expanded Keyboard Shortcuts**: Introduce more keyboard shortcuts for common actions, such as:
    *   `Cmd/Ctrl + N`: Create a new file.
    *   `Cmd/Ctrl + Shift + S`: Save all open files.
    *   `Cmd/Ctrl + W`: Close the current file tab.

*   **Improved Button and UI Feedback**: Enhance the visual feedback for UI elements. For example, show a spinner on the "Send" button while a message is being processed and provide clearer visual cues for disabled or interactive elements.