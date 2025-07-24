# AI-Powered Browser-Based Code Editor

This project is a sophisticated, browser-based code editor that integrates a powerful AI agent (Google's Gemini) to assist with a wide range of coding tasks. The application is designed with a secure, client-centric architecture, ensuring that all file system operations run directly in the browser, providing a seamless and safe user experience.

---

## Core Architecture

The editor's architecture is built on modern web technologies to be both powerful and secure.

*   **Client-Centric Design**: The application's core logic resides in the frontend (`frontend/app.js`). It leverages the **File System Access API**, a native browser feature that allows the web app to interact directly and securely with the user's local files and folders. This eliminates the security risks associated with server-side file operations.

*   **Simplified Backend**: The Node.js backend (`backend/index.js`) serves as a simple static file server for the frontend assets. It also includes an endpoint to execute terminal commands, acting as a bridge for tools that require a shell environment.

*   **Stateful Experience with IndexedDB**: The application uses IndexedDB to persist user data locally. This includes:
    *   **API Keys**: Securely stores the user's Gemini API keys.
    *   **Directory Handle**: Remembers the last opened project folder, allowing for quick reconnection.
    *   **Codebase Index**: Caches a searchable index of the project's code for faster queries.

---

## Features

*   **Monaco Editor**: Integrates the same powerful editor used in VS Code, providing a rich and familiar coding environment with syntax highlighting and advanced editing features.
*   **Gemini AI Agent**: A stateful AI assistant powered by the Google Gemini API with official tool-calling capabilities. The agent can understand context, use tools, and assist with tasks like code generation, file manipulation, and project-wide searches.
*   **Resizable Panels**: A flexible UI with resizable panels for the file tree, editor, and AI chat.
*   **Tabbed File Management**: Open, close, and switch between multiple files in a familiar tabbed interface.
*   **Multimodal Input**: The AI chat supports both text and image uploads, allowing you to ask questions about visual content.
*   **Multiple Agent Modes**: Switch between different AI modes (`Code`, `Plan`, `Search`) to tailor the agent's behavior to your specific needs.

---

## Getting Started

Follow these steps to set up and run the project locally.

### Prerequisites

*   [Node.js](https://nodejs.org/) (which includes `npm`) installed on your system.

### Installation & Running

#### Windows (Automated Setup)

1.  **Run the setup script:**
    *   Double-click the `setup.bat` file in the project root. This will automatically install dependencies, install `pm2` (a process manager), start the server, and configure it to launch on startup.
2.  **Open the application:**
    *   Navigate to `http://localhost:3333` in a modern web browser that supports the File System Access API (e.g., Chrome, Edge).

#### macOS / Linux (Manual Setup)

1.  **Clone the repository:**
    ```bash
    git clone [repository-url]
    cd [repository-folder]
    ```

2.  **Install backend dependencies:**
    ```bash
    cd backend
    npm install
    ```

3.  **Install and Configure PM2:**
    ```bash
    npm install pm2 -g
    pm2 start index.js --name "ai-code-editor"
    pm2 startup # Follow the on-screen instructions to enable auto-start
    pm2 save
    ```

4.  **Open the application:**
    *   Navigate to `http://localhost:3333` in a modern web browser that supports the File System Access API (e.g., Chrome, Edge).

### Configuration

1.  **Add API Keys**:
    *   In the AI Chat panel, expand the "API Key Settings" section.
    *   Enter one or more Google Gemini API keys, separated by new lines.
    *   Click "Save Keys". The keys are stored securely in your browser's IndexedDB.

2.  **Open a Project**:
    *   Click the "Open Project Folder" button.
    *   Select a local directory to work with. The application will remember this folder for future sessions.

---

## Logic Workflow

1.  **Initialization**: On load, the app initializes the Monaco editor, loads API keys from IndexedDB, and attempts to reconnect to the last used project directory.
2.  **Project Access**: The user clicks "Open Project Folder" and grants permission via the browser's native dialog. A handle to this directory is stored in IndexedDB.
3.  **AI Chat Session**: A chat session with the Gemini model is established, configured with the selected agent mode and a set of predefined tools.
4.  **User Interaction**: The user interacts with the AI through the chat interface. They can send text prompts, upload images, open files, and select text.
5.  **Tool-Calling Loop**:
    *   The AI determines if it needs to use a tool (e.g., `read_file`, `search_code`).
    *   It sends a `functionCall` request to the frontend.
    *   The frontend executes the corresponding JavaScript function, performing the action securely in the browser.
    *   The result is sent back to the AI as a `functionResponse`.
    *   The AI uses the result to formulate its final, natural-language answer.
6.  **File Operations**: All file actions (create, read, delete) are handled by the frontend using the File System Access API, ensuring changes are reflected directly on the user's local disk.

---

## AI Toolset

The AI agent has access to a variety of tools to interact with the project:

| Tool                      | Description                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `get_project_structure`   | Gets the entire file and folder structure of the project.                                                |
| `create_file`             | Creates a new file with specified content.                                                               |
| `rewrite_file`            | Rewrites a file with new content. Overwrites the entire existing file content.                           |
| `read_file`               | Reads the content of an existing file.                                                                   |
| `delete_file`             | Deletes a file from the project.                                                                         |
| `search_code`             | Searches for a string across all files in the project.                                                   |
| `get_open_file_content`   | Gets the content of the file currently open in the editor.                                               |
| `get_selected_text`       | Gets the text currently highlighted by the user.                                                         |
| `replace_selected_text`   | Replaces the currently selected text with new content.                                                   |
| `run_terminal_command`    | Executes a shell command on the backend.                                                                 |
| `build_or_update_codebase_index` | Scans the codebase to build a searchable index for faster queries. |
| `query_codebase`          | Searches the pre-built codebase index for definitions and TODOs.                                          |
