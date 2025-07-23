const express = require('express');
const path = require('path');
const fs = require('fs/promises');

const app = express();
const port = 3000;

app.use(express.json());

// Serve the frontend static files.
app.use(express.static(path.join(__dirname, '../frontend')));

// =================================================================
// === Backend Tool Execution Endpoint (Future Use)              ===
// =================================================================
// This endpoint is reserved for future tools that require backend execution,
// such as running terminal commands or interacting with a database.
// File-system operations have been moved to the frontend to work
// directly with the user's selected directory.

app.post('/api/execute-tool', async (req, res) => {
    const { toolName, parameters } = req.body;
    console.log(`[Backend] Received tool call for '${toolName}', but no backend tools are currently implemented.`);
    // In the future, a switch statement here would route to different tool handlers.
    res.status(501).json({ status: "Error", message: `Tool '${toolName}' is not implemented on the backend.` });
});

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
    console.log('Navigate to http://localhost:3000 to open the editor.');
});
