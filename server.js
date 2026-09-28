const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const runningBots = {};

app.get('/', (req, res) => {
    res.send('CoreHost Backend Engine active.');
});

app.post('/api/deploy', (req, res) => {
    const { owner, botName, botToken, deployMethod, githubUrl, files } = req.body;

    if (!botName || !botToken) {
        return res.status(400).json({ error: 'Bot Name and Bot Token are required.' });
    }

    const folderName = `${owner}_${botName}`.replace(/[^a-zA-Z0-9_]/g, '');
    const botDir = path.join(__dirname, 'deployments', folderName);

    // Terminate existing running instance
    if (runningBots[folderName]) {
        try {
            runningBots[folderName].kill();
            delete runningBots[folderName];
        } catch (e) {
            console.log('Error stopping existing process:', e);
        }
    }

    // Reset folder directory
    if (fs.existsSync(botDir)) {
        fs.rmSync(botDir, { recursive: true, force: true });
    }
    fs.mkdirSync(botDir, { recursive: true });

    if (deployMethod === 'github') {
        if (!githubUrl) return res.status(400).json({ error: 'GitHub URL is required.' });

        exec(`git clone ${githubUrl} .`, { cwd: botDir }, (cloneErr) => {
            if (cloneErr) {
                return res.status(500).json({ error: 'Failed to clone repository.' });
            }
            startBotProcess(botDir, folderName, botToken, res, botName);
        });
    } else {
        // Direct Editor/Files Mode
        if (!files || Object.keys(files).length === 0) {
            return res.status(400).json({ error: 'No code files provided.' });
        }

        // Write files to disk
        Object.keys(files).forEach(fileName => {
            fs.writeFileSync(path.join(botDir, fileName), files[fileName]);
        });

        startBotProcess(botDir, folderName, botToken, res, botName);
    }
});

function startBotProcess(botDir, folderName, botToken, res, botName) {
    // Install npm dependencies if package.json exists
    const hasPackageJson = fs.existsSync(path.join(botDir, 'package.json'));
    const installCmd = hasPackageJson ? 'npm install --only=production' : 'npm install discord.js';

    exec(installCmd, { cwd: botDir }, (installErr) => {
        if (installErr) {
            console.error('NPM Install Warning:', installErr);
        }

        let entryFile = 'index.js';
        const possibleEntries = ['index.js', 'bot.js', 'main.js', 'server.js'];
        for (const file of possibleEntries) {
            if (fs.existsSync(path.join(botDir, file))) {
                entryFile = file;
                break;
            }
        }

        const botEnv = { ...process.env, TOKEN: botToken, DISCORD_TOKEN: botToken };
        const botProcess = spawn('node', [entryFile], {
            cwd: botDir,
            env: botEnv
        });

        botProcess.stdout.on('data', (data) => console.log(`[${folderName}]: ${data}`));
        botProcess.stderr.on('data', (data) => console.error(`[${folderName} ERR]: ${data}`));
        
        botProcess.on('close', (code) => {
            delete runningBots[folderName];
        });

        runningBots[folderName] = botProcess;

        return res.json({ 
            message: `Bot '${botName}' launched live!` 
        });
    });
}

// Binds immediately on 0.0.0.0
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`CoreHost Server running on port ${PORT}`);
});
