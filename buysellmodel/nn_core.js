/**
 * nn_core.js — Pure JavaScript Neural Network Engine
 * =====================================================
 * Works in BOTH Node.js (for training) and the Browser (for live inference).
 *
 * Architecture: Feedforward network with configurable layers.
 * Default for broker model: [8] -> [16] -> [8] -> [3]
 *
 * Features:
 *   - Xavier weight initialization
 *   - ReLU hidden activation, Sigmoid output activation
 *   - Mini-batch Stochastic Gradient Descent with momentum
 *   - Combined binary cross-entropy + MSE loss
 *   - serialize/deserialize weights to JSON
 */

// ─────────────────────────────────────────────────────────
//  Matrix Utility (row-major flat arrays for speed)
// ─────────────────────────────────────────────────────────

class Matrix {
    constructor(rows, cols, data) {
        this.rows = rows;
        this.cols = cols;
        this.data = data || new Float64Array(rows * cols);
    }

    static zeros(rows, cols) {
        return new Matrix(rows, cols, new Float64Array(rows * cols));
    }

    static random(rows, cols, scale = 1) {
        const m = Matrix.zeros(rows, cols);
        for (let i = 0; i < m.data.length; i++) {
            // Box-Muller transform for Gaussian random numbers
            const u1 = Math.random() + 1e-10;
            const u2 = Math.random();
            m.data[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * scale;
        }
        return m;
    }

    get(r, c) { return this.data[r * this.cols + c]; }
    set(r, c, v) { this.data[r * this.cols + c] = v; }

    /** Matrix multiplication: this (m×k) × B (k×n) = result (m×n) */
    mul(B) {
        if (this.cols !== B.rows) throw new Error(`Matrix mul dim mismatch ${this.cols} vs ${B.rows}`);
        const result = Matrix.zeros(this.rows, B.cols);
        for (let i = 0; i < this.rows; i++) {
            for (let k = 0; k < this.cols; k++) {
                const aik = this.data[i * this.cols + k];
                if (aik === 0) continue;
                for (let j = 0; j < B.cols; j++) {
                    result.data[i * B.cols + j] += aik * B.data[k * B.cols + j];
                }
            }
        }
        return result;
    }

    /** Transpose */
    T() {
        const result = Matrix.zeros(this.cols, this.rows);
        for (let i = 0; i < this.rows; i++)
            for (let j = 0; j < this.cols; j++)
                result.data[j * this.rows + i] = this.data[i * this.cols + j];
        return result;
    }

    /** Element-wise apply function */
    map(fn) {
        const result = Matrix.zeros(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) result.data[i] = fn(this.data[i], i);
        return result;
    }

    /** Element-wise add */
    add(B) {
        const result = Matrix.zeros(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) result.data[i] = this.data[i] + B.data[i];
        return result;
    }

    /** Element-wise subtract */
    sub(B) {
        const result = Matrix.zeros(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) result.data[i] = this.data[i] - B.data[i];
        return result;
    }

    /** Scalar multiply */
    scale(s) {
        const result = Matrix.zeros(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) result.data[i] = this.data[i] * s;
        return result;
    }

    /** Element-wise multiply (Hadamard) */
    hadamard(B) {
        const result = Matrix.zeros(this.rows, this.cols);
        for (let i = 0; i < this.data.length; i++) result.data[i] = this.data[i] * B.data[i];
        return result;
    }

    /** Sum all elements */
    sum() {
        let s = 0;
        for (let i = 0; i < this.data.length; i++) s += this.data[i];
        return s;
    }

    /** Convert a flat JS array to a column vector Matrix */
    static fromArray(arr) {
        const m = Matrix.zeros(arr.length, 1);
        for (let i = 0; i < arr.length; i++) m.data[i] = arr[i];
        return m;
    }

    /** Convert this column vector to flat JS array */
    toArray() {
        return Array.from(this.data);
    }

    clone() {
        return new Matrix(this.rows, this.cols, new Float64Array(this.data));
    }

    toJSON() {
        return { rows: this.rows, cols: this.cols, data: Array.from(this.data) };
    }

    static fromJSON(obj) {
        return new Matrix(obj.rows, obj.cols, new Float64Array(obj.data));
    }
}

// ─────────────────────────────────────────────────────────
//  Activation Functions
// ─────────────────────────────────────────────────────────

const Activation = {
    relu:        (x) => Math.max(0, x),
    reluPrime:   (x) => (x > 0 ? 1 : 0),
    sigmoid:     (x) => 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x)))),
    sigmoidPrime:(x) => { const s = Activation.sigmoid(x); return s * (1 - s); },
    linear:      (x) => x,
    linearPrime: (_) => 1,
};

// ─────────────────────────────────────────────────────────
//  Neural Network
// ─────────────────────────────────────────────────────────

class NeuralNetwork {
    /**
     * @param {number[]} layerSizes - e.g. [8, 16, 8, 3]
     * @param {number}   momentum   - SGD momentum factor (0–1)
     */
    constructor(layerSizes = [8, 16, 8, 3], momentum = 0.9) {
        this.layerSizes = layerSizes;
        this.numLayers  = layerSizes.length;
        this.momentum   = momentum;

        // Weights[l]: matrix (layerSizes[l+1] × layerSizes[l])
        // Biases[l]:  matrix (layerSizes[l+1] × 1)
        this.weights = [];
        this.biases  = [];

        // Momentum velocity matrices
        this.vWeights = [];
        this.vBiases  = [];

        for (let l = 0; l < this.numLayers - 1; l++) {
            const inSize  = layerSizes[l];
            const outSize = layerSizes[l + 1];

            // Xavier initialization: scale = sqrt(2 / inSize) for ReLU
            const scale = Math.sqrt(2.0 / inSize);
            this.weights.push(Matrix.random(outSize, inSize, scale));
            this.biases.push(Matrix.zeros(outSize, 1));

            this.vWeights.push(Matrix.zeros(outSize, inSize));
            this.vBiases.push(Matrix.zeros(outSize, 1));
        }
    }

    // ── Forward Pass ──────────────────────────────────────

    /**
     * Run a forward pass.
     * @param {number[]} inputArray - flat input features
     * @returns {{ zs: Matrix[], activations: Matrix[] }}
     */
    forward(inputArray) {
        const activations = [Matrix.fromArray(inputArray)];
        const zs = [];

        for (let l = 0; l < this.numLayers - 1; l++) {
            const a = activations[l];
            const z = this.weights[l].mul(a).add(this.biases[l]);
            zs.push(z);

            const isOutput = (l === this.numLayers - 2);
            const activationFn = isOutput ? Activation.sigmoid : Activation.relu;
            activations.push(z.map(v => activationFn(v)));
        }

        return { zs, activations };
    }

    /**
     * Get output predictions as a plain array.
     * @param {number[]} inputArray
     * @returns {number[]} predictions [matchProb, expectedSavingsNorm, routeRecommendation]
     */
    predict(inputArray) {
        const { activations } = this.forward(inputArray);
        return activations[activations.length - 1].toArray();
    }

    // ── Backward Pass (Backpropagation) ───────────────────

    /**
     * Compute gradients for a single sample and update velocities.
     * @param {number[]} inputArray
     * @param {number[]} targetArray
     * @param {number}   lr          - learning rate
     * @returns {number} loss (binary cross-entropy + MSE combined)
     */
    backward(inputArray, targetArray, lr) {
        const { zs, activations } = this.forward(inputArray);
        const target = Matrix.fromArray(targetArray);
        const output = activations[activations.length - 1];

        // Combined loss: BCE for outputs 0 & 2 (binary), MSE for output 1 (continuous)
        let loss = 0;
        const EPSILON = 1e-7;
        for (let i = 0; i < output.data.length; i++) {
            const y  = target.data[i];
            const yh = output.data[i];
            if (i === 1) {
                // MSE for regression output
                loss += 0.5 * (yh - y) ** 2;
            } else {
                // Binary cross-entropy for classification outputs
                loss += -(y * Math.log(yh + EPSILON) + (1 - y) * Math.log(1 - yh + EPSILON));
            }
        }

        // Output layer delta: dL/dz for sigmoid + BCE/MSE
        // d(BCE)/d(sigmoid) = output - target
        let delta = output.sub(target);

        // Backpropagate through layers
        const gradWeights = [];
        const gradBiases  = [];

        for (let l = this.numLayers - 2; l >= 0; l--) {
            const a_prev = activations[l];
            gradWeights.unshift(delta.mul(a_prev.T()));
            gradBiases.unshift(delta);

            if (l > 0) {
                // Propagate delta back: W^T * delta * relu'(z_{l-1})
                const z_prev = zs[l - 1];
                const reluPrimeMat = z_prev.map(v => Activation.reluPrime(v));
                delta = this.weights[l].T().mul(delta).hadamard(reluPrimeMat);
            }
        }

        // Update weights with momentum SGD
        for (let l = 0; l < this.numLayers - 1; l++) {
            this.vWeights[l] = this.vWeights[l].scale(this.momentum).sub(gradWeights[l].scale(lr));
            this.vBiases[l]  = this.vBiases[l].scale(this.momentum).sub(gradBiases[l].scale(lr));
            this.weights[l]  = this.weights[l].add(this.vWeights[l]);
            this.biases[l]   = this.biases[l].add(this.vBiases[l]);
        }

        return loss;
    }

    // ── Training Loop ────────────────────────────────────

    /**
     * Full training run with mini-batch SGD.
     *
     * @param {{ inputs: number[][], targets: number[][] }} trainSet
     * @param {{ inputs: number[][], targets: number[][] }} valSet
     * @param {object} opts
     * @param {number} opts.epochs
     * @param {number} opts.batchSize
     * @param {number} opts.lr          - initial learning rate
     * @param {number} opts.lrDecay     - lr multiplied by this each epoch
     * @param {function} opts.onProgress - called every reportEvery epochs
     * @param {number} opts.reportEvery
     * @returns {object} history
     */
    train(trainSet, valSet, opts = {}) {
        const {
            epochs      = 200,
            batchSize   = 32,
            lr          = 0.05,
            lrDecay     = 0.995,
            onProgress  = null,
            reportEvery = 10,
        } = opts;

        const history = {
            trainLoss: [], valLoss: [], trainAcc: [], valAcc: [],
        };

        let currentLr = lr;
        const n = trainSet.inputs.length;

        for (let epoch = 1; epoch <= epochs; epoch++) {
            // Shuffle training data
            const indices = Array.from({ length: n }, (_, i) => i);
            for (let i = n - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }

            // Mini-batch gradient descent
            let epochLoss = 0;
            let batchCount = 0;

            for (let start = 0; start < n; start += batchSize) {
                const end = Math.min(start + batchSize, n);
                let batchLoss = 0;

                for (let k = start; k < end; k++) {
                    const idx = indices[k];
                    batchLoss += this.backward(
                        trainSet.inputs[idx],
                        trainSet.targets[idx],
                        currentLr / (end - start)
                    );
                }

                epochLoss += batchLoss / (end - start);
                batchCount++;
            }

            const avgTrainLoss = epochLoss / batchCount;
            const trainAcc = this._accuracy(trainSet);
            const avgValLoss = this._loss(valSet);
            const valAcc = this._accuracy(valSet);

            history.trainLoss.push(avgTrainLoss);
            history.valLoss.push(avgValLoss);
            history.trainAcc.push(trainAcc);
            history.valAcc.push(valAcc);

            // Learning rate decay
            currentLr *= lrDecay;

            if (onProgress && epoch % reportEvery === 0) {
                onProgress({
                    epoch, epochs, currentLr,
                    trainLoss: avgTrainLoss, valLoss: avgValLoss,
                    trainAcc, valAcc,
                });
            }
        }

        return history;
    }

    // ── Evaluation Helpers ────────────────────────────────

    _loss(dataset) {
        const EPSILON = 1e-7;
        let total = 0;
        const n = dataset.inputs.length;
        for (let i = 0; i < n; i++) {
            const pred   = this.predict(dataset.inputs[i]);
            const target = dataset.targets[i];
            for (let j = 0; j < pred.length; j++) {
                const y = target[j], yh = pred[j];
                if (j === 1) {
                    total += 0.5 * (yh - y) ** 2;
                } else {
                    total += -(y * Math.log(yh + EPSILON) + (1 - y) * Math.log(1 - yh + EPSILON));
                }
            }
        }
        return total / n;
    }

    _accuracy(dataset) {
        let correct = 0;
        const n = dataset.inputs.length;
        for (let i = 0; i < n; i++) {
            const pred   = this.predict(dataset.inputs[i]);
            const target = dataset.targets[i];
            // Accuracy on binary outputs (index 0 and 2)
            const predLabel  = pred[2] >= 0.5 ? 1 : 0;
            const trueLabel  = target[2] >= 0.5 ? 1 : 0;
            if (predLabel === trueLabel) correct++;
        }
        return correct / n;
    }

    /**
     * Compute confusion matrix for binary route recommendation (output[2]).
     * Returns { tp, fp, tn, fn, precision, recall, f1 }
     */
    confusionMatrix(dataset) {
        let tp = 0, fp = 0, tn = 0, fn = 0;
        for (let i = 0; i < dataset.inputs.length; i++) {
            const pred  = this.predict(dataset.inputs[i])[2] >= 0.5 ? 1 : 0;
            const truth = dataset.targets[i][2] >= 0.5 ? 1 : 0;
            if (pred === 1 && truth === 1) tp++;
            else if (pred === 1 && truth === 0) fp++;
            else if (pred === 0 && truth === 0) tn++;
            else fn++;
        }
        const precision = tp / (tp + fp + 1e-9);
        const recall    = tp / (tp + fn + 1e-9);
        const f1        = 2 * precision * recall / (precision + recall + 1e-9);
        return { tp, fp, tn, fn, precision, recall, f1 };
    }

    // ── Serialization ─────────────────────────────────────

    save() {
        return {
            layerSizes: this.layerSizes,
            momentum:   this.momentum,
            weights:    this.weights.map(m => m.toJSON()),
            biases:     this.biases.map(m => m.toJSON()),
        };
    }

    load(json) {
        this.layerSizes = json.layerSizes;
        this.momentum   = json.momentum;
        this.weights    = json.weights.map(Matrix.fromJSON);
        this.biases     = json.biases.map(Matrix.fromJSON);
        // Reset velocity
        for (let l = 0; l < this.layerSizes.length - 1; l++) {
            this.vWeights[l] = Matrix.zeros(this.weights[l].rows, this.weights[l].cols);
            this.vBiases[l]  = Matrix.zeros(this.biases[l].rows, this.biases[l].cols);
        }
        return this;
    }

    static fromJSON(json) {
        const nn = new NeuralNetwork(json.layerSizes, json.momentum);
        return nn.load(json);
    }
}

// ─────────────────────────────────────────────────────────
//  Feature Engineering (shared by train.js and browser)
// ─────────────────────────────────────────────────────────

/**
 * Convert a raw broker scenario object into normalized input features.
 *
 * @param {object} scenario
 * @param {number} scenario.buyQty
 * @param {number} scenario.sellQty        - sell quantity available internally
 * @param {number} scenario.bid
 * @param {number} scenario.ask
 * @param {number} scenario.bookDepthBuy   - # buy orders in book
 * @param {number} scenario.bookDepthSell  - # sell orders in book
 * @param {number} scenario.historicalMatchRate  - 0–1
 * @returns {number[]} 8-element input vector
 */
function extractFeatures(scenario) {
    const { buyQty, sellQty, bid, ask, bookDepthBuy, bookDepthSell, historicalMatchRate } = scenario;
    const mid       = (bid + ask) / 2;
    const spread    = ask - bid;
    const sumQty    = buyQty + sellQty;
    const imbalance = sumQty > 0 ? (buyQty - sellQty) / sumQty : 0;

    return [
        Math.min(buyQty / 100, 1),             // 0: buyQtyNorm
        Math.min(sellQty / 100, 1),            // 1: sellQtyNorm
        Math.min(spread / 1, 1),               // 2: spreadNorm
        (imbalance + 1) / 2,                   // 3: imbalance (shifted to 0–1)
        Math.min(mid / 200, 1),                // 4: midPriceNorm
        Math.min(bookDepthBuy / 10, 1),        // 5: bookDepthBuy
        Math.min(bookDepthSell / 10, 1),       // 6: bookDepthSell
        Math.min(Math.max(historicalMatchRate, 0), 1), // 7: historicalMatchRate
    ];
}

/**
 * Generate target labels for a scenario.
 * @returns {number[]} [matchProb, savingsNorm, routeLabel]
 */
function generateLabels(scenario) {
    const { buyQty, sellQty, bid, ask } = scenario;
    const mid     = (bid + ask) / 2;
    const canMatch = sellQty > 0;
    const matchQty = Math.min(buyQty, sellQty);
    const savingsPerShare = canMatch ? (ask - mid) : 0;   // buyer saves vs paying ask

    return [
        canMatch ? 1 : 0,                           // matchProb: binary
        Math.min(savingsPerShare / 0.5, 1),         // savingsNorm: 0–1 (max 0.5$/share)
        canMatch && (matchQty / buyQty) > 0.1 ? 1 : 0,  // route: cross internally?
    ];
}

// ─────────────────────────────────────────────────────────
//  Export (Node.js or Browser)
// ─────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    // Node.js
    module.exports = { Matrix, NeuralNetwork, extractFeatures, generateLabels };
} else {
    // Browser — attach to window
    window.NeuralNetworkCore = { Matrix, NeuralNetwork, extractFeatures, generateLabels };
}
