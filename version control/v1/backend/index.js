const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json());

// Serve the frontend static files. This is still needed to host the HTML, CSS, and JS.
app.use(express.static(path.join(__dirname, '../frontend')));

// The AI endpoints will be added here in Phase 2.
// For now, the backend's primary role is to serve the frontend.

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
    console.log('Navigate to http://localhost:3000 to open the editor.');
});
