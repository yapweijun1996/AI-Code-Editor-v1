# Project Documentation: AI-Powered Browser-Based Code Editor

This document provides a comprehensive overview of the AI-Powered Code Editor, detailing its architecture, features, and the available toolset for the integrated AI agent.

---

### Core Architecture: Client-Centric and Secure

The application has been architecturally refactored to be **client-centric**. All tools that interact with the user's file system now run entirely in the browser (`frontend/app.js`). This approach resolves critical security and context-related issues by ensuring the AI agent's operational environment is identical to the user's.

*   **File System Access API**: The application leverages the browser's native **File System Access API** (`window.showDirectoryPicker`) for all file and folder operations. This modern API allows the web application to interact directly and securely with the user's local file system.
*   **Simplified Backend**: The Node.js backend (`backend/index.js`) now serves as a simple static file server for the frontend assets and runs on `http://localhost:3333`. It no longer contains any file system logic, which was the source of previous architectural flaws. It remains as a placeholder for potential future tools that would genuinely require a server environment (e.g., executing terminal commands).
*   **Folder Persistence**: The application uses **IndexedDB** to store a handle to the last opened directory. On page reload, it checks for this handle and its permissions. If permission is not granted, it displays a "Reconnect Project" button, allowing the user to securely re-grant access with a single click, ensuring a seamless workflow.

---

### AI Agent: Gemini with Official Tool Calling

The editor features a stateful AI agent powered by the **Google Gemini API** (`v1beta`) and its official tool-calling capabilities. This ensures a reliable and predictable conversational loop.

1.  **Tool Declaration**: The frontend formally declares its available functions to the Gemini API.
2.  **Function Call**: The AI responds with a structured `functionCall` when it needs to use a tool.
3.  **Frontend Execution**: The browser executes the requested function (e.g., reading a file).
4.  **Function Response**: The result is sent back to the AI in a formal `functionResponse`.
5.  **Final Answer**: The AI provides a natural-language response to the user.

---

### Setup and Installation

#### Windows (Automated Setup)
1.  Run `setup.bat` to install dependencies, configure `pm2` for process management, and set up auto-start.
2.  Access the editor at `http://localhost:3333`.

#### macOS / Linux (Manual Setup)
1.  Install dependencies: `cd backend && npm install`.
2.  Install and configure `pm2`:
    ```bash
    npm install pm2 -g
    pm2 start index.js --name "ai-code-editor"
    pm2 startup
    pm2 save
    ```
3.  Access the editor at `http://localhost:3333`.

---

### Final AI Toolset and Usage Guidelines

The following is the definitive list of tools available to the AI agent.

**CRITICAL USAGE RULE FOR ALL FILE TOOLS:** All `filename` parameters must be **relative to the project root**. Do **NOT** include the root folder's name in the path. For example, to read a file named `style.css` in the root, the path is simply `style.css`. For a file in a subdirectory, use `src/component.js`.

*   **`get_project_structure`**:
    *   **Description**: Gets the entire file and folder structure of the currently open project.
    *   **Usage**: This should **always** be the first tool used to understand the project's layout and to get the correct, relative file paths for other operations.

*   **`create_file`**:
    *   **Description**: Creates a new file with the specified content.
    *   **Parameters**: `filename` (string), `content` (string).
    *   **Note**: Always use `get_project_structure` first to avoid overwriting an existing file.

*   **`rewrite_file`**:
    *   **Description**: Rewrites a file with new content. Overwrites the entire existing file content.
    *   **Parameters**: `filename` (string), `content` (string).

*   **`read_file`**:
    *   **Description**: Reads the entire content of an existing file.
    *   **Parameters**: `filename` (string).

*   **`delete_file`**:
    *   **Description**: Deletes a specified file from the project.
    *   **Parameters**: `filename` (string).

*   **`search_code`**:
    *   **Description**: Searches for a string across all files in the project (case-insensitive).
    *   **Parameters**: `search_term` (string).

*   **`get_open_file_content`**:
    *   **Description**: Gets the content of the file currently open in the editor.

*   **`get_selected_text`**:
    *   **Description**: Gets the text currently highlighted by the user in the editor.

*   **`replace_selected_text`**:
    *   **Description**: Replaces the currently selected text with new content.
    *   **Parameters**: `new_text` (string).
