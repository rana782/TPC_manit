const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 9001;
const LOG_FILE = path.join(__dirname, '../tmp/whatsapp_payloads.log');

app.use(express.json());

// Ensure tmp dir exists
const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
}

app.post('*', (req, res) => {
    const payload = {
        timestamp: new Date().toISOString(),
        url: req.url,
        body: req.body,
        headers: req.headers
    };
    
    console.log('--- RECEIVED WHATSAPP PAYLOAD ---');
    console.log(JSON.stringify(payload, null, 2));
    
    fs.appendFileSync(LOG_FILE, JSON.stringify(payload) + '\n');
    res.json({ success: true, message: 'Captured by Mock Server' });
});

app.listen(PORT, () => {
    console.log(`Mock WhatsApp Server running on http://localhost:${PORT}`);
    console.log(`Logging payloads to: ${LOG_FILE}`);
});
