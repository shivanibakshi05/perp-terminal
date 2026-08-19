/**
 * Unit tests for orderbook aggregation (src/lib/book.ts).
 *
 *   npm run test:book
 */
import { aggregateLevels } from "../src/lib/book";

let pass = 0, fail = 0;
function t(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + " " + extra); }
}

// Realistic Binance BTCUSDT depth: $0.01 ticks clustered around 65,470
const asks: [string,string][] = [
  ["65470.01","0.0002"],["65470.03","0.0005"],["65470.07","3.8010"],
  ["65470.12","0.0202"],["65470.15","0.0002"],["65471.10","0.0001"],
  ["65471.90","0.0001"],["65472.00","0.0002"],["65472.10","0.0002"],
];
const bids: [string,string][] = [
  ["65470.00","6.8300"],["65469.98","0.0005"],["65469.95","0.7229"],
  ["65469.91","1.3600"],["65469.30","0.0460"],["65468.90","0.4969"],
];

console.log("BTC book aggregated at $0.10");
const a = aggregateLevels(asks, 0.1, "ask", 14);
const b = aggregateLevels(bids, 0.1, "bid", 14);
console.log("  asks:", a.map(l => `${l.price.toFixed(1)}@${l.size.toFixed(4)}`).join(" "));
console.log("  bids:", b.map(l => `${l.price.toFixed(1)}@${l.size.toFixed(4)}`).join(" "));

t("no duplicate ask prices", new Set(a.map(l=>l.price)).size === a.length);
t("no duplicate bid prices", new Set(b.map(l=>l.price)).size === b.length);
t("asks ascend", a.every((l,i)=> i===0 || l.price > a[i-1].price));
t("bids descend", b.every((l,i)=> i===0 || l.price < b[i-1].price));

const spread = a[0].price - b[0].price;
t("spread is positive", spread > 0, `got ${spread}`);
t("spread is one tick here", Math.abs(spread - 0.1) < 1e-6, `got ${spread}`);

// Sizes must be conserved, not dropped
const rawAskSize = asks.reduce((s,[,q])=>s+Number(q),0);
const aggAskSize = a.reduce((s,l)=>s+l.size,0);
t("ask size conserved", Math.abs(rawAskSize - aggAskSize) < 1e-9, `${rawAskSize} vs ${aggAskSize}`);

const rawBidSize = bids.reduce((s,[,q])=>s+Number(q),0);
const aggBidSize = b.reduce((s,l)=>s+l.size,0);
t("bid size conserved", Math.abs(rawBidSize - aggBidSize) < 1e-9, `${rawBidSize} vs ${aggBidSize}`);

t("cumulative totals monotonic", a.every((l,i)=> i===0 || l.total > a[i-1].total));
t("first total equals first size", Math.abs(a[0].total - a[0].size) < 1e-12);

// Bucket merging actually happened
t("three sub-cent asks merged into one bucket",
  Math.abs(a[0].size - (0.0002+0.0005+3.8010)) < 1e-9, `got ${a[0].size}`);

// Float-drift trap: 0.1 buckets on prices ending in .1/.3/.7
const drift = aggregateLevels([["65470.10","1"],["65470.30","1"],["65470.70","1"]], 0.1, "ask", 5);
t("no float drift in bucket keys",
  drift.map(l=>Number(l.price.toFixed(1))).join(",") === "65470.1,65470.3,65470.7",
  drift.map(l=>l.price).join(","));

// ETH at $0.01 — finer tick, should not over-merge
const eth = aggregateLevels([["3500.01","1"],["3500.02","2"]], 0.01, "ask", 5);
t("finer tick keeps levels separate", eth.length === 2, `got ${eth.length}`);

t("zero and negative sizes dropped",
  aggregateLevels([["100","0"],["101","-1"],["102","5"]], 0.1, "ask", 5).length === 1);

t("empty input is safe", aggregateLevels([], 0.1, "bid", 5).length === 0);
t("limit respected", aggregateLevels(asks, 0.01, "ask", 3).length === 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
