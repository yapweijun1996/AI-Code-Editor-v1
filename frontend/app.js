document.addEventListener('DOMContentLoaded', () => {
    const fileTreeContainer = document.getElementById('file-tree');
    const editorContainer = document.getElementById('editor');
    const openDirectoryButton = document.createElement('button');

    let editor;
    let rootDirectoryHandle = null;

    // --- UI Setup ---
    openDirectoryButton.textContent = 'Open Project Folder';
    fileTreeContainer.before(openDirectoryButton);

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

    // --- File System Access API Implementation ---
    openDirectoryButton.addEventListener('click', async () => {
        try {
            rootDirectoryHandle = await window.showDirectoryPicker();
            if (rootDirectoryHandle) {
                fileTreeContainer.innerHTML = ''; // Clear previous tree
                const tree = await buildTree(rootDirectoryHandle);
                renderTree(tree, fileTreeContainer);
            }
        } catch (error) {
            console.error('Error opening directory:', error);
        }
    });

    const buildTree = async (dirHandle) => {
        const tree = {
            name: dirHandle.name,
            kind: dirHandle.kind,
            handle: dirHandle,
            children: []
        };
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'directory') {
                tree.children.push(await buildTree(entry));
            } else {
                tree.children.push({
                    name: entry.name,
                    kind: entry.kind,
                    handle: entry
                });
            }
        }
        return tree;
    };

    // --- File Tree Rendering ---
    const renderTree = (node, element) => {
        const ul = document.createElement('ul');
        
        node.children?.sort((a, b) => { // Sort directories first, then by name
            if (a.kind === 'directory' && b.kind !== 'directory') return -1;
            if (a.kind !== 'directory' && b.kind === 'directory') return 1;
            return a.name.localeCompare(b.name);
        }).forEach(child => {
            const li = document.createElement('li');
            li.textContent = child.name;
            
            if (child.kind === 'directory') {
                li.classList.add('directory');
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.textContent = child.name;
                details.appendChild(summary);
                renderTree(child, details);
                element.appendChild(details);
            } else {
                li.classList.add('file');
                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openFile(child.handle);
                });
                ul.appendChild(li);
            }
        });
        if (ul.hasChildNodes()) {
            element.appendChild(ul);
        }
    };

    // --- File Operations ---
    let currentFileHandle = null;
    const openFile = async (fileHandle) => {
        try {
            currentFileHandle = fileHandle;
            const file = await fileHandle.getFile();
            const content = await file.text();
            
            editor.setValue(content);
            editor.updateOptions({ readOnly: false });
            
            const extension = file.name.split('.').pop();
            const language = getLanguageFromExtension(extension);
            monaco.editor.setModelLanguage(editor.getModel(), language);
        } catch (error) {
            console.error(`Failed to open file ${fileHandle.name}:`, error);
        }
    };

    const saveFile = async () => {
        if (!currentFileHandle) return;
        try {
            const content = editor.getValue();
            const writable = await currentFileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            console.log('File saved successfully');
        } catch (error) {
            console.error(`Failed to save file ${currentFileHandle.name}:`, error);
        }
    };

    // --- Utility ---
    const getLanguageFromExtension = (ext) => {
        const languageMap = { js: 'javascript', ts: 'typescript', java: 'java', py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown' };
        return languageMap[ext] || 'plaintext';
    };

    // --- Event Listeners ---
    editorContainer.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFile();
        }
    });
});
