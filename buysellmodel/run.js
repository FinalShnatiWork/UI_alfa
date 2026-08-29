/**
 * run.js — Netting Broker Neural Network Runner
 * ============================================
 * Unified CLI tool for training and testing the model.
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Import core logic from nn_core.js
const { NeuralNetwork, extractFeatures } = require('./nn_core.js');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const COLORS = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    cyan:   '\x1b[36m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    magenta:'\x1b[35m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

async function main() {
    console.clear();
    console.log(c('bold', c('cyan', '====================================================')));
    console.log(c('bold', c('cyan', '   🧠  Netting Broker — Service Manager      ')));
    console.log(c('bold', c('cyan', '====================================================')));
    console.log(c('yellow', '   [1]') + ' Train the model (אימון הרשת)');
    console.log(c('yellow', '   [2]') + ' Start Web Server (הרצת האתר בנפרד)');
    console.log(c('yellow', '   [3]') + ' Start NN Server (הרצת שרת רשת נוירונים)');
    console.log(c('yellow', '   [4]') + ' Run prediction CLI (הרצת חיזוי)');
    console.log(c('yellow', '   [5]') + ' Exit (יציאה)');
    console.log(c('cyan', '----------------------------------------------------'));

    rl.question(c('bold', ' Choose an option: '), (choice) => {
        switch (choice) {
            case '1': trainModel(); break;
            case '2': startService('web_server.js'); break;
            case '3': startService('nn_server.js'); break;
            case '4': runPrediction(); break;
            case '5':
                console.log('Goodbye! (להתראות!)');
                process.exit(0);
                break;
            default:
                console.log(c('red', 'Invalid choice.'));
                main();
                break;
        }
    });
}

function trainModel() {
    console.log('\n' + c('bold', 'Starting training process...'));
    const child = spawn('node', ['train.js'], { stdio: 'inherit' });
    
    child.on('close', (code) => {
        if (code === 0) {
            console.log('\n' + c('green', '✔ Training finished successfully!'));
        } else {
            console.log('\n' + c('red', '✘ Training failed.'));
        }
        rl.question('\nPress Enter to return to menu...', () => main());
    });
}

function startService(scriptName) {
    console.log('\n' + c('bold', `Starting ${scriptName}...`));
    console.log(c('yellow', 'Press Ctrl+C to stop the server and exit.'));
    const child = spawn('node', [scriptName], { stdio: 'inherit' });
    
    child.on('close', (code) => {
        console.log(`\nService ${scriptName} stopped.`);
        main();
    });
}

function runPrediction() {
    const resultsPath = path.join(__dirname, 'training_results.json');
    if (!fs.existsSync(resultsPath)) {
        console.log(c('red', '\nError: No trained model found. Please train the model first (Option 1).'));
        return rl.question('\nPress Enter to return...', () => main());
    }

    const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const nn = NeuralNetwork.fromJSON(data.modelWeights);

    console.log('\n' + c('bold', '--- Run Prediction ---'));
    rl.question(' Enter Buy Quantity (e.g. 50): ', (buyQty) => {
        rl.question(' Enter Sell Quantity (e.g. 30): ', (sellQty) => {
            rl.question(' Enter Spread (e.g. 0.10): ', (spread) => {
                
                const scenario = {
                    buyQty: parseFloat(buyQty) || 0,
                    sellQty: parseFloat(sellQty) || 0,
                    bid: 100,
                    ask: 100 + (parseFloat(spread) || 0.10),
                    bookDepthBuy: 5,
                    bookDepthSell: 5,
                    historicalMatchRate: 0.7,
                };

                const features = extractFeatures(scenario);
                const pred = nn.predict(features);

                console.log('\n' + c('cyan', 'Results:'));
                console.log(` - Match Probability: ${c('green', (pred[0] * 100).toFixed(1) + '%')}`);
                console.log(` - Expected Savings:  ${c('yellow', (pred[1] * 100).toFixed(1) + '%')}`);
                console.log(` - Recommendation:    ${pred[2] >= 0.5 ? c('bold', c('green', 'INTERNAL CROSS')) : c('bold', c('red', 'EXTERNAL ROUTE'))}`);
                
                rl.question('\nRun another? (y/n): ', (ans) => {
                    if (ans.toLowerCase() === 'y') runPrediction();
                    else main();
                });
            });
        });
    });
}

main();
