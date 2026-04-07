const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 9001;
const LOG_FILE = path.join(__dirname, '../tmp/mock_payloads.log');

// Ensure tmp exists
if (!fs.existsSync(path.join(__dirname, '../tmp'))) {
    fs.mkdirSync(path.join(__dirname, '../tmp'));
}

app.use(bodyParser.json());

// Logger middleware
app.use((req, res, next) => {
    const entry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        body: req.body
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    next();
});

// Mock Endpoints
app.post('/mock-whatsapp', (req, res) => {
    console.log('[MOCK-WHATSAPP] Received:', JSON.stringify(req.body, null, 2));
    res.json({ success: true, message: 'Mock WhatsApp notification received' });
});

app.post('/mock-zapier', (req, res) => {
    console.log('[MOCK-ZAPIER] Received:', JSON.stringify(req.body, null, 2));
    res.json({ success: true, message: 'Mock Zapier payload received' });
});

app.post('/mock-email', (req, res) => {
    console.log('[MOCK-EMAIL] Received:', JSON.stringify(req.body, null, 2));
    res.json({ success: true, message: 'Mock Email notification received' });
});

app.get('/health', (req, res) => res.json({ status: 'MOCK_SERVER_OK' }));

app.listen(PORT, () => {
    console.log(`Mock UI service server running on http://localhost:${PORT}`);
    console.log(`Logging payloads to ${LOG_FILE}`);
});
