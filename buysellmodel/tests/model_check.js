#!/usr/bin/env node
'use strict';
/**
 * Model + feature + engine sanity check. No backend needed, no npm dependencies.
 *
 *   node buysellmodel/tests/model_check.js                 run all checks, exit 1 on any failure
 *   node buysellmodel/tests/model_check.js --write-golden  (re)write expectedFeatures into netting_scenarios.json
 *
 * Checks:
 *  1. JS netting engine (scripts/lib/netting_engine.js) gives the expected plan for every scenario
 *     in netting_scenarios.json — the same file the Java NettingEngineScenarioTest uses (parity).
 *  2. Feature vectors: scripts/lib/netting_engine.features === nn_core.extractFeatures (after the
 *     side-aware renaming) === the golden expectedFeatures stored in the JSON (also checked by Java).
 *  3. Regression gate: with NO opposite liquidity the NN must never say INTERNAL (the old Java
 *     feature builder invented a 0.45 seller and routed 100% INTERNAL).
 *  4. The trained network still separates "seller present" from "no seller".
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCEN_PATH = path.join(__dirname, 'netting_scenarios.json');
const engine = require(path.join(ROOT, 'scripts', 'lib', 'netting_engine'));
const { NeuralNetwork, extractFeatures } = require(path.join(ROOT, 'buysellmodel', 'nn_core.js'));

const WRITE_GOLDEN = process.argv.includes('--write-golden');
const TOL = 1e-9;

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const scen = JSON.parse(fs.readFileSync(SCEN_PATH, 'utf8'));

// ── 1. Engine parity ──────────────────────────────────────────────────────────
console.log('\n[1] Netting engine (JS port) vs expected plans');
for (const s of scen.scenarios) {
  const p = engine.plan(s.incoming, s.resting, s.quote);
  const x = s.expected;
  const fillsOk = p.fills.length === x.fills.length && p.fills.every((f, i) =>
    f.restingOrderId === x.fills[i].restingOrderId && engine.decEq(f.qty, x.fills[i].qty) && engine.decEq(f.price, x.fills[i].price));
  const codes = p.decisions.map((d) => d.code);
  const ok = fillsOk && engine.decEq(p.remainder, x.remainder) && p.rejectReason === x.rejectReason
    && JSON.stringify(codes) === JSON.stringify(x.decisionCodes);
  check(`engine ${s.id} ${s.title.en}`, ok, ok ? `${p.fills.length} fill(s), remainder ${p.remainder}` : `got ${JSON.stringify({ fills: p.fills, remainder: p.remainder, rejectReason: p.rejectReason, codes })}`);
}

// ── 2. Feature vectors ────────────────────────────────────────────────────────
console.log('\n[2] Feature vectors: FeatureBuilder formula == nn_core.extractFeatures == golden');
let goldenChanged = false;
for (const s of scen.scenarios) {
  const fi = s.features;
  const mine = engine.features(fi);
  const ref = extractFeatures({
    buyQty: fi.ownQty, sellQty: fi.oppositeQty, bid: fi.bid, ask: fi.ask,
    bookDepthBuy: fi.ownDepth, bookDepthSell: fi.oppositeDepth, historicalMatchRate: fi.historicalMatchRate,
  });
  const sameAsTraining = mine.every((v, i) => Math.abs(v - ref[i]) <= TOL);
  check(`features ${s.id} match nn_core.extractFeatures`, sameAsTraining, sameAsTraining ? '' : `mine ${JSON.stringify(mine)} vs nn_core ${JSON.stringify(ref)}`);
  if (WRITE_GOLDEN) {
    if (JSON.stringify(s.expectedFeatures) !== JSON.stringify(ref)) goldenChanged = true;
    s.expectedFeatures = ref;
  } else {
    const g = s.expectedFeatures;
    const ok = Array.isArray(g) && g.length === 8 && g.every((v, i) => Math.abs(v - ref[i]) <= TOL);
    check(`features ${s.id} match golden vector`, ok, ok ? '' : (Array.isArray(g) ? `golden ${JSON.stringify(g)}` : 'missing — run with --write-golden'));
  }
}
if (WRITE_GOLDEN) {
  fs.writeFileSync(SCEN_PATH, JSON.stringify(scen, null, 2) + '\n');
  console.log(goldenChanged ? '  golden vectors WRITTEN (review the diff)' : '  golden vectors unchanged');
}

// ── 3 + 4. The trained network ────────────────────────────────────────────────
console.log('\n[3] Trained network behaviour');
const trained = JSON.parse(fs.readFileSync(path.join(ROOT, 'buysellmodel', 'training_results.json'), 'utf8'));
const nn = NeuralNetwork.fromJSON(trained.modelWeights);
const route = (x) => nn.predict(x)[2];

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const N = 1000;
let internalNoSeller = 0;
for (let i = 0; i < N; i++) {
  const mid = 90 + rnd() * 20;
  const spread = 0.05 + rnd() * 0.25;
  const x = engine.features({
    ownQty: 1 + Math.floor(rnd() * 100), oppositeQty: 0,
    bid: mid - spread / 2, ask: mid + spread / 2,
    ownDepth: Math.floor(rnd() * 5), oppositeDepth: 0, historicalMatchRate: rnd() * 0.3,
  });
  if (route(x) > 0.5) internalNoSeller++;
}
check('REGRESSION GATE: no opposite liquidity -> 0% INTERNAL', internalNoSeller === 0, `${internalNoSeller}/${N} routed INTERNAL`);

// Legacy Java vector (what the old code sent): fake seller 0.45 + raw imbalance in [-1,1]
const legacy = [0.1, 0.45, 0.028, 0.0, 0.95, 0, 0, 0.72];
console.log(`INFO  LEGACY (expected to fail) old Java vector -> NN route ${route(legacy).toFixed(3)} (${route(legacy) > 0.5 ? 'INTERNAL' : 'EXTERNAL'}) — this is the bug the new FeatureBuilder removes`);

let internalWithSeller = 0;
for (let i = 0; i < N; i++) {
  const mid = 90 + rnd() * 20;
  const spread = 0.05 + rnd() * 0.25;
  const own = 5 + Math.floor(rnd() * 50);
  const x = engine.features({
    ownQty: own, oppositeQty: own + Math.floor(rnd() * 50),
    bid: mid - spread / 2, ask: mid + spread / 2,
    ownDepth: Math.floor(rnd() * 5), oppositeDepth: 1 + Math.floor(rnd() * 5), historicalMatchRate: 0.5 + rnd() * 0.5,
  });
  if (route(x) > 0.5) internalWithSeller++;
}
check('network recognises real opposite liquidity (>= 90% INTERNAL)', internalWithSeller >= N * 0.9, `${internalWithSeller}/${N} routed INTERNAL`);

// ── Summary ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log(`\nRESULT: ${results.length - failed.length}/${results.length} passed${failed.length ? ' — FAILED: ' + failed.map((f) => f.name).join('; ') : ''}`);
process.exit(failed.length ? 1 : 0);
