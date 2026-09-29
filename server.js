const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const activeProcesses = {};

app.get('/', (req, res) => {
    res.send('CoreHost Engine Active.');
});

app.post('/api/deploy', (req, res) => {
    const { owner, botName, botTech, botToken, deployMethod, githubUrl, files } = req.body;

    if (!botName || !botToken) {
        return res.status(400).json({ error: 'Bot Name and Token are required.' });
    }

    const folderName = `${owner}_${botName}`.replace(/[^a-zA-Z0-9_]/g, '');
    const botDir = path.join(__dirname, 'deployments', folderName);

    // Stop existing process if active
    if (activeProcesses[folderName]) {
        try {
            activeProcesses[folderName].kill();
            delete activeProcesses[folderName];
        } catch (err) {
            console.error('Error killing old process:', err);
        }
    }

    if (fs.existsSync(botDir)) {
        fs.rmSync(botDir, { recursive: true, force: true });
    }
    fs.mkdirSync(botDir, { recursive: true });

    if (deployMethod === 'github') {
        if (!githubUrl) return res.status(400).json({ error: 'GitHub URL is required.' });
        
        exec(`git clone ${githubUrl} .`, { cwd: botDir }, (err) => {
            if (err) return res.status(500).json({ error: 'Failed to clone repository.' });
            startBotProcess(botDir, folderName, botTech, botToken, res);
        });
    } else {
        if (!files || Object.keys(files).length === 0) {
            return res.status(400).json({ error: 'No code files provided.' });
        }
        
        Object.keys(files).forEach(f => {
            fs.writeFileSync(path.join(botDir, f), files[f]);
        });
        
        startBotProcess(botDir, folderName, botTech, botToken, res);
    }
});

function startBotProcess(botDir, folderName, botTech, botToken, res) {
    const isPython = botTech === 'python';
    
    let installCmd = isPython 
        ? (fs.existsSync(path.join(botDir, 'requirements.txt')) ? 'pip install -r requirements.txt' : 'pip install discord.py')
        : (fs.existsSync(path.join(botDir, 'package.json')) ? 'npm install --only=production' : 'npm install discord.js');

    exec(installCmd, { cwd: botDir }, () => {
        let entryFile = isPython ? 'main.py' : 'index.js';
        const possibleEntries = isPython ? ['main.py', 'bot.py'] : ['index.js', 'bot.js', 'main.js'];

        for (const f of possibleEntries) {
            if (fs.existsSync(path.join(botDir, f))) {
                entryFile = f;
                break;
            }
        }

        const runner = isPython ? 'python3' : 'node';
        const proc = spawn(runner, [entryFile], {
            cwd: botDir,
            env: { ...process.env, TOKEN: botToken, DISCORD_TOKEN: botToken }
        });

        proc.stdout.on('data', (d) => console.log(`[${folderName}] ${d}`));
        proc.stderr.on('data', (d) => console.error(`[${folderName} ERR] ${d}`));

        proc.on('close', () => {
            delete activeProcesses[folderName];
        });

        activeProcesses[folderName] = proc;

        return res.json({ message: `Successfully deployed instance using ${runner}.` });
    });
}

// Fixed 0.0.0.0 binding for cloud platforms like Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});
