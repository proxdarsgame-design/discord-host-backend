const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Active process container
const runningBots = {};

app.get('/', (req, res) => {
    res.send('CoreHost Backend Engine active.');
});

app.post('/api/deploy', (req, res) => {
    const { owner, botName, botToken, githubUrl } = req.body;

    if (!botName || !botToken || !githubUrl) {
        return res.status(400).json({ error: 'Missing required parameters.' });
    }

    // Sanitize identifier
    const folderName = `${owner}_${botName}`.replace(/[^a-zA-Z0-0_]/g, '');
    const botDir = path.join(__dirname, 'deployments', folderName);

    // Stop existing instance if already running
    if (runningBots[folderName]) {
        try {
            runningBots[folderName].kill();
            delete runningBots[folderName];
        } catch (e) {
            console.log('Error terminating running process:', e);
        }
    }

    // Clean destination directory
    if (fs.existsSync(botDir)) {
        fs.rmSync(botDir, { recursive: true, force: true });
    }

    fs.mkdirSync(botDir, { recursive: true });

    // Step 1: Clone repository
    exec(`git clone ${githubUrl} .`, { cwd: botDir }, (cloneErr) => {
        if (cloneErr) {
            console.error('Git Clone Error:', cloneErr);
            return res.status(500).json({ error: 'Failed to clone repository. Ensure the repository is PUBLIC.' });
        }

        // Step 2: Install dependencies
        exec('npm install --only=production', { cwd: botDir }, (installErr) => {
            if (installErr) {
                console.error('npm install Error:', installErr);
                return res.status(500).json({ error: 'Failed to install npm dependencies.' });
            }

            // Determine entry point (index.js, bot.js, server.js, or main.js)
            let entryFile = 'index.js';
            const possibleEntries = ['index.js', 'bot.js', 'server.js', 'main.js'];
            for (const file of possibleEntries) {
                if (fs.existsSync(path.join(botDir, file))) {
                    entryFile = file;
                    break;
                }
            }

            // Step 3: Spawn process in background
            const botEnv = { ...process.env, TOKEN: botToken, DISCORD_TOKEN: botToken };
            const botProcess = spawn('node', [entryFile], {
                cwd: botDir,
                env: botEnv
            });

            botProcess.stdout.on('data', (data) => {
                console.log(`[${folderName} STDOUT]: ${data}`);
            });

            botProcess.stderr.on('data', (data) => {
                console.error(`[${folderName} STDERR]: ${data}`);
            });

            botProcess.on('close', (code) => {
                console.log(`[${folderName}] Process exited with code ${code}`);
                delete runningBots[folderName];
            });

            runningBots[folderName] = botProcess;

            return res.json({ 
                message: `Bot '${botName}' successfully deployed and launched live!` 
            });
        });
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`CoreHost Server running on port ${PORT}`);
});
