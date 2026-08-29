const http = require('http');
const fs = require('fs');
const path = require('path');
const { NeuralNetwork } = require('./nn_core.js');

let nnModel = null;
const resultsPath = path.join(__dirname, 'training_results.json');

function loadModel() {
    if (fs.existsSync(resultsPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
            nnModel = NeuralNetwork.fromJSON(data.modelWeights);
            console.log("✅ Neural Network Model loaded from training_results.json");
            broadcastStatus();
        } catch (e) {
            console.error("❌ Failed to load model:", e.message);
        }
    } else {
        console.log("⚠️ No trained model found. Please run 'node train.js' first.");
    }
}

// Watch for model updates
fs.watchFile(resultsPath, (curr, prev) => {
    console.log("🔄 Model file changed, reloading...");
    loadModel();
});

let clients = [];

function broadcastStatus() {
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify({ type: 'status', status: 'connected', hasModel: !!nnModel })}\n\n`);
    });
}

const server = http.createServer((req, res) => {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/connect') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        clients.push(res);
        res.write(`data: ${JSON.stringify({ type: 'status', status: 'connected', hasModel: !!nnModel })}\n\n`);

        req.on('close', () => {
            clients = clients.filter(c => c !== res);
        });
        return;
    }

    if (req.url === '/predict' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { features } = JSON.parse(body);
                if (!nnModel) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Model not loaded on server' }));
                    return;
                }
                const pred = nnModel.predict(features);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ prediction: pred }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end();
});

const PORT = 3005;
server.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`🧠 NEURAL NETWORK SERVER RUNNING`);
    console.log(`➡️  Listening for predictions on port ${PORT}`);
    console.log(`==============================================\n`);
    loadModel();
});
