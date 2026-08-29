/**
 * train.js — Netting Broker Neural Network Training Script
 * ==========================================================
 * Run with: node train.js
 *
 * What this does:
 *   1. Generates 50,000 synthetic broker scenarios
 *   2. Splits into 80% train / 20% validation
 *   3. Trains the network for 200 epochs (~2-5 minutes)
 *   4. Saves all results to training_results.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { NeuralNetwork, extractFeatures, generateLabels } = require('./nn_core.js');

// ─────────────────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────────────────

const CONFIG = {
    DATASET_SIZE:   50_000,
    TRAIN_SPLIT:    0.80,
    LAYER_SIZES:    [8, 16, 8, 3],
    EPOCHS:         200,
    BATCH_SIZE:     64,
    LEARNING_RATE:  0.04,
    LR_DECAY:       0.995,
    MOMENTUM:       0.88,
    REPORT_EVERY:   10,
    OUTPUT_FILE:    path.join(__dirname, 'training_results.json'),
    SAMPLE_COUNT:   30,   // how many sample predictions to save
};

// ─────────────────────────────────────────────────────────
//  Console helpers
// ─────────────────────────────────────────────────────────

const COLORS = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    cyan:   '\x1b[36m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    dim:    '\x1b[2m',
    magenta:'\x1b[35m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;
const bar = (pct, width = 30) => {
    const filled = Math.round(pct * width);
    return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
};

function printHeader() {
    console.log('\n' + '═'.repeat(65));
    console.log(c('bold', c('cyan', '  🧠  Netting Broker Neural Network — Training')));
    console.log('═'.repeat(65));
    console.log(c('dim', `  Architecture: ${CONFIG.LAYER_SIZES.join(' → ')} neurons`));
    console.log(c('dim', `  Dataset:       ${CONFIG.DATASET_SIZE.toLocaleString()} synthetic scenarios`));
    console.log(c('dim', `  Epochs:        ${CONFIG.EPOCHS}  |  Batch size: ${CONFIG.BATCH_SIZE}`));
    console.log(c('dim', `  Learning rate: ${CONFIG.LEARNING_RATE} (decay: ${CONFIG.LR_DECAY})`));
    console.log('═'.repeat(65) + '\n');
}

function printProgress({ epoch, epochs, currentLr, trainLoss, valLoss, trainAcc, valAcc }) {
    const pct   = epoch / epochs;
    const progress = bar(pct);
    const lrStr = currentLr.toFixed(5);

    process.stdout.write(
        `\r  Epoch ${c('bold', String(epoch).padStart(3))}/${epochs}  ` +
        `${c('cyan', progress)} ${(pct * 100).toFixed(0).padStart(3)}%  ` +
        `Loss ${c('yellow', trainLoss.toFixed(4))}/${c('dim', valLoss.toFixed(4))}  ` +
        `Acc ${c('green', (trainAcc * 100).toFixed(1) + '%')}/${c('dim', (valAcc * 100).toFixed(1) + '%')}  ` +
        `lr=${c('magenta', lrStr)}`
    );
}

function printEpochLine({ epoch, trainLoss, valLoss, trainAcc, valAcc }) {
    console.log(
        `\n  ${c('bold', `[Epoch ${epoch}]`)}  ` +
        `Train Loss: ${c('yellow', trainLoss.toFixed(4))}  ` +
        `Val Loss: ${c('dim', valLoss.toFixed(4))}  ` +
        `Train Acc: ${c('green', (trainAcc * 100).toFixed(2) + '%')}  ` +
        `Val Acc: ${c('cyan', (valAcc * 100).toFixed(2) + '%')}`
    );
}

// ─────────────────────────────────────────────────────────
//  Synthetic Data Generation
// ─────────────────────────────────────────────────────────

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

/**
 * Generate one random broker scenario and its labels.
 * Produces diverse distinct market scenarios to make the AI robust.
 */
function generateScenario() {
    const r = Math.random();
    let bid, ask, spread, buyQty, sellQty, bookDepthBuy, bookDepthSell, historicalMatchRate;

    if (r < 0.15) {
        // 1. Whale Order Scenario (Huge block size)
        bid = rand(90, 110);
        spread = rand(0.05, 0.30);
        ask = bid + spread;
        buyQty = Math.random() > 0.5 ? randInt(500, 2000) : randInt(1, 50);
        sellQty = buyQty > 100 ? randInt(1, 50) : randInt(500, 2000);
        bookDepthBuy = randInt(1, 5);
        bookDepthSell = randInt(1, 5);
        historicalMatchRate = rand(0.1, 0.5);
    } 
    else if (r < 0.30) {
        // 2. High Volatility / Illiquid (Wide spread, shallow book, random prices)
        bid = rand(10, 500);
        spread = rand(0.50, 3.50);
        ask = bid + spread;
        buyQty = randInt(1, 20);
        sellQty = randInt(1, 20);
        bookDepthBuy = randInt(0, 2);
        bookDepthSell = randInt(0, 2);
        historicalMatchRate = rand(0.0, 0.2);
    } 
    else if (r < 0.40) {
        // 3. Perfect Match Scenario (Quantities are identical)
        bid = rand(90, 110);
        spread = rand(0.05, 0.20);
        ask = bid + spread;
        const qty = randInt(10, 200);
        buyQty = qty;
        sellQty = qty;
        bookDepthBuy = randInt(5, 20);
        bookDepthSell = randInt(5, 20);
        historicalMatchRate = rand(0.8, 1.0);
    } 
    else if (r < 0.55) {
        // 4. Zero Liquidity / Empty Book (No opposing side)
        bid = rand(90, 110);
        spread = rand(0.05, 0.30);
        ask = bid + spread;
        buyQty = randInt(10, 100);
        sellQty = 0;
        bookDepthBuy = randInt(1, 5);
        bookDepthSell = 0;
        historicalMatchRate = 0.0;
    } 
    else if (r < 0.70) {
        // 5. High Historical Trust (High match rate history)
        bid = rand(90, 110);
        spread = rand(0.05, 0.30);
        ask = bid + spread;
        buyQty = randInt(10, 50);
        sellQty = randInt(10, 50);
        bookDepthBuy = randInt(5, 10);
        bookDepthSell = randInt(5, 10);
        historicalMatchRate = rand(0.8, 1.0);
    } 
    else {
        // 6. Normal / Balanced Market (Standard distribution)
        bid = rand(90, 110);
        spread = rand(0.05, 0.30);
        ask = bid + spread;
        buyQty = randInt(1, 100);
        const hasSeller = Math.random() > 0.30;
        sellQty = hasSeller ? randInt(1, 100) : 0;
        bookDepthBuy = randInt(0, 10);
        bookDepthSell = randInt(0, 10);
        const baseRate = hasSeller ? rand(0.3, 1.0) : rand(0.0, 0.35);
        historicalMatchRate = Math.min(1, Math.max(0, baseRate + rand(-0.1, 0.1)));
    }

    const scenario = { buyQty, sellQty, bid, ask, bookDepthBuy, bookDepthSell, historicalMatchRate };

    return {
        input:    extractFeatures(scenario),
        target:   generateLabels(scenario),
        raw:      scenario,
    };
}

console.log(c('dim', '  Generating dataset...'));
const startGen = Date.now();

const allData = [];
for (let i = 0; i < CONFIG.DATASET_SIZE; i++) {
    allData.push(generateScenario());
}

console.log(c('green', `  ✓ Generated ${CONFIG.DATASET_SIZE.toLocaleString()} scenarios in ${Date.now() - startGen}ms`));

// Shuffle
for (let i = allData.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allData[i], allData[j]] = [allData[j], allData[i]];
}

// Split
const splitIdx  = Math.floor(allData.length * CONFIG.TRAIN_SPLIT);
const trainData = allData.slice(0, splitIdx);
const valData   = allData.slice(splitIdx);

const trainSet = { inputs: trainData.map(d => d.input), targets: trainData.map(d => d.target) };
const valSet   = { inputs: valData.map(d => d.input),   targets: valData.map(d => d.target)   };

console.log(c('dim', `  Train: ${trainSet.inputs.length.toLocaleString()} samples | Val: ${valSet.inputs.length.toLocaleString()} samples\n`));

// ─────────────────────────────────────────────────────────
//  Train
// ─────────────────────────────────────────────────────────

printHeader();

const nn = new NeuralNetwork(CONFIG.LAYER_SIZES, CONFIG.MOMENTUM);
const startTrain = Date.now();

let lastEpochData = null;

const history = nn.train(trainSet, valSet, {
    epochs:      CONFIG.EPOCHS,
    batchSize:   CONFIG.BATCH_SIZE,
    lr:          CONFIG.LEARNING_RATE,
    lrDecay:     CONFIG.LR_DECAY,
    reportEvery: 1,
    onProgress:  (data) => {
        lastEpochData = data;
        printProgress(data);
        if (data.epoch % CONFIG.REPORT_EVERY === 0) {
            printEpochLine(data);
        }
    },
});

const trainTimeMs = Date.now() - startTrain;
console.log('\n\n' + '─'.repeat(65));
console.log(c('bold', c('green', `  ✅ Training complete in ${(trainTimeMs / 1000).toFixed(1)}s`)));
console.log('─'.repeat(65));

// ─────────────────────────────────────────────────────────
//  Evaluate
// ─────────────────────────────────────────────────────────

const cm = nn.confusionMatrix(valSet);
const finalAcc = history.valAcc[history.valAcc.length - 1];

console.log(`\n  ${c('bold', 'Final Metrics (Validation Set)')}`);
console.log(`  Accuracy:  ${c('green',   (finalAcc * 100).toFixed(2) + '%')}`);
console.log(`  Precision: ${c('cyan',    (cm.precision * 100).toFixed(2) + '%')}`);
console.log(`  Recall:    ${c('yellow',  (cm.recall * 100).toFixed(2) + '%')}`);
console.log(`  F1 Score:  ${c('magenta', cm.f1.toFixed(4))}`);

console.log(`\n  ${c('bold', 'Confusion Matrix')} (Internal match prediction)`);
console.log(`  ${c('dim', '           Predicted')}`);
console.log(`  ${c('dim', '          External  Internal')}`);
console.log(`  Actual External    ${c('green', String(cm.tn).padStart(5))}    ${c('red', String(cm.fp).padStart(5))}`);
console.log(`  Actual Internal    ${c('red',   String(cm.fn).padStart(5))}    ${c('green', String(cm.tp).padStart(5))}`);

// ─────────────────────────────────────────────────────────
//  Sample Predictions
// ─────────────────────────────────────────────────────────

const sampleIndices = [];
for (let i = 0; i < CONFIG.SAMPLE_COUNT; i++) {
    sampleIndices.push(Math.floor(Math.random() * valData.length));
}

const samples = sampleIndices.map(idx => {
    const d    = valData[idx];
    const pred = nn.predict(d.input);
    return {
        input:           d.input,
        rawScenario:     d.raw,
        predicted:       pred,
        actual:          d.target,
        predictedLabel:  pred[2] >= 0.5 ? 'INTERNAL' : 'EXTERNAL',
        actualLabel:     d.target[2] >= 0.5 ? 'INTERNAL' : 'EXTERNAL',
        correct:         (pred[2] >= 0.5) === (d.target[2] >= 0.5),
    };
});

// ─────────────────────────────────────────────────────────
//  Save Results
// ─────────────────────────────────────────────────────────

const output = {
    meta: {
        generatedAt:   new Date().toISOString(),
        trainTimeMs,
        config:        CONFIG,
        datasetSize:   CONFIG.DATASET_SIZE,
        trainSamples:  trainSet.inputs.length,
        valSamples:    valSet.inputs.length,
    },
    modelWeights: nn.save(),
    history: {
        trainLoss: history.trainLoss,
        valLoss:   history.valLoss,
        trainAcc:  history.trainAcc,
        valAcc:    history.valAcc,
    },
    metrics: {
        finalTrainLoss: history.trainLoss[history.trainLoss.length - 1],
        finalValLoss:   history.valLoss[history.valLoss.length - 1],
        finalTrainAcc:  history.trainAcc[history.trainAcc.length - 1],
        finalValAcc:    finalAcc,
        confusionMatrix: cm,
    },
    samples,
};

fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(output, null, 2));

const fileSizeKB = (fs.statSync(CONFIG.OUTPUT_FILE).size / 1024).toFixed(1);
console.log(`\n  ${c('bold', 'Output saved to:')} ${c('cyan', CONFIG.OUTPUT_FILE)}`);
console.log(`  File size: ${fileSizeKB} KB`);
console.log('\n' + '═'.repeat(65));
console.log(c('bold', c('cyan', '  Next steps:')));
console.log(c('dim', '  1. Open results.html in your browser to visualize training'));
console.log(c('dim', '  2. Open index.html to use the live Neural Network Advisor'));
console.log('═'.repeat(65) + '\n');
