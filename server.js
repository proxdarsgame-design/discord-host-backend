const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Allows external websites to send requests

// Test endpoint to verify server is alive
app.get('/', (req, res) => {
    res.send('Backend API is live!');
});

// Deployment request endpoint
app.post('/api/deploy', (req, res) => {
    const { owner, botName, botToken, githubUrl } = req.body;

    if (!botName || !botToken || !githubUrl) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    console.log(`[DEPLOY] User: ${owner} | Bot: ${botName} | Repo: ${githubUrl}`);

    res.json({ 
        message: `Deployment request for '${botName}' received successfully!` 
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
