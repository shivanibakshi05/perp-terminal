/**
 * End-to-end check of MiniPerp against a real EVM.
 *
 * Compiles with solc, deploys to a local Hardhat node, then walks the full
 * user journey (faucet -> approve -> deposit -> open -> close) and asserts the
 * PnL and liquidation arithmetic matches the frontend's TypeScript.
 *
 *   npx hardhat node &   # then:
 *   node scripts/verify.mjs
 */
import fs from "node:fs";
import solc from "solc";
import { ethers } from "ethers";

const RPC = process.env.RPC ?? "http://127.0.0.1:8545";

function compile() {
  const sources = {
    "MockUSDC.sol": { content: fs.readFileSync("contracts/MockUSDC.sol", "utf8") },
    "MiniPerp.sol": { content: fs.readFileSync("contracts/MiniPerp.sol", "utf8") },
  };
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const fatal = (out.errors ?? []).filter((e) => e.severity === "error");
  if (fatal.length) {
    fatal.forEach((e) => console.error(e.formattedMessage));
    throw new Error("Solidity compilation failed");
  }
  return {
    usdc: out.contracts["MockUSDC.sol"].MockUSDC,
    perp: out.contracts["MiniPerp.sol"].MiniPerp,
  };
}

let passed = 0;
let failed = 0;

function check(name, actual, expected, tolerance = 0) {
  const ok =
    typeof expected === "number"
      ? Math.abs(Number(actual) - expected) <= tolerance
      : actual === expected;
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}\n      expected ${expected}, got ${actual}`);
  }
}

const USD = (n) => BigInt(Math.round(n * 1e6));
const PX = (n) => BigInt(Math.round(n * 1e8));
const fromUSD = (v) => Number(v) / 1e6;
const fromPX = (v) => Number(v) / 1e8;

async function main() {
  const { usdc, perp } = compile();
  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = await provider.getSigner(0);
  const me = await signer.getAddress();

  console.log("\nDeploying...");
  const usdcC = await new ethers.ContractFactory(usdc.abi, usdc.evm.bytecode.object, signer).deploy();
  await usdcC.waitForDeployment();
  const perpC = await new ethers.ContractFactory(
    perp.abi,
    perp.evm.bytecode.object,
    signer
  ).deploy(await usdcC.getAddress());
  await perpC.waitForDeployment();
  console.log("  deployed\n");

  // --- Collateral ------------------------------------------------------
  console.log("Collateral flow");
  await (await usdcC.faucet()).wait();
  check("faucet mints 10,000 mUSDC", fromUSD(await usdcC.balanceOf(me)), 10_000);

  await (await usdcC.approve(await perpC.getAddress(), ethers.MaxUint256)).wait();
  check("allowance is set", (await usdcC.allowance(me, await perpC.getAddress())) > 0n, true);

  await (await perpC.deposit(USD(5_000))).wait();
  check("freeCollateral after deposit", fromUSD(await perpC.freeCollateral(me)), 5_000);
  check("wallet balance after deposit", fromUSD(await usdcC.balanceOf(me)), 5_000);

  // Seed the vault so winning payouts are covered.
  await (await usdcC.transfer(await perpC.getAddress(), USD(5_000))).wait();

  // --- Open ------------------------------------------------------------
  console.log("\nOpen position (10x long, $1,000 margin, entry $50,000)");
  const margin = 1_000;
  const size = 10_000;
  const entry = 50_000;

  await (await perpC.openPosition(true, USD(size), USD(margin), PX(entry))).wait();
  const pos = await perpC.getPosition(me);
  check("position is open", pos.isOpen, true);
  check("position is long", pos.isLong, true);
  check("size", fromUSD(pos.sizeUsd), size);
  check("entry price", fromPX(pos.entryPrice), entry);
  check("margin locked out of free collateral", fromUSD(await perpC.freeCollateral(me)), 4_000);

  // --- PnL -------------------------------------------------------------
  console.log("\nPnL math");
  // +2% on a $10,000 long = +$200
  check(
    "+2% move -> +$200",
    fromUSD(await perpC.unrealizedPnl(me, PX(51_000))),
    200,
    0.01
  );
  check(
    "-2% move -> -$200",
    fromUSD(await perpC.unrealizedPnl(me, PX(49_000))),
    -200,
    0.01
  );
  check("flat move -> 0", fromUSD(await perpC.unrealizedPnl(me, PX(entry))), 0);

  // --- Liquidation -----------------------------------------------------
  console.log("\nLiquidation price");
  // delta = margin * 0.9 * entry / size = 1000 * 0.9 * 50000 / 10000 = 4500
  const liq = fromPX(await perpC.liquidationPrice(me));
  check("long liquidation = entry - 4,500", liq, 45_500, 0.01);

  // Frontend mirrors this formula — assert they agree.
  const tsLiq = entry - (margin * 0.9 * entry) / size;
  check("TypeScript formula matches Solidity", liq, tsLiq, 0.01);

  // --- Account value ---------------------------------------------------
  console.log("\nAccount value");
  check(
    "free + margin + pnl at +2%",
    fromUSD(await perpC.accountValue(me, PX(51_000))),
    4_000 + 1_000 + 200,
    0.01
  );

  // --- Close in profit --------------------------------------------------
  console.log("\nClose at $51,000 (+$200)");
  await (await perpC.closePosition(PX(51_000))).wait();
  const closed = await perpC.getPosition(me);
  check("position cleared", closed.isOpen, false);
  check("free collateral = 4,000 + 1,000 + 200", fromUSD(await perpC.freeCollateral(me)), 5_200, 0.01);

  // --- Loss beyond margin ----------------------------------------------
  console.log("\nLoss exceeding margin is floored at zero");
  await (await perpC.openPosition(true, USD(10_000), USD(1_000), PX(50_000))).wait();
  const freeBefore = fromUSD(await perpC.freeCollateral(me));
  await (await perpC.closePosition(PX(40_000))).wait(); // -20% => -$2,000 on $1,000 margin
  check(
    "payout floored at 0, never negative",
    fromUSD(await perpC.freeCollateral(me)),
    freeBefore,
    0.01
  );

  // --- Guards -----------------------------------------------------------
  console.log("\nGuards");
  let reverted = false;
  try {
    // 50x on $100 margin exceeds the 20x cap.
    await (await perpC.openPosition(true, USD(5_000), USD(100), PX(50_000))).wait();
  } catch {
    reverted = true;
  }
  check("leverage above 20x reverts", reverted, true);

  reverted = false;
  try {
    await (await perpC.withdraw(USD(999_999))).wait();
  } catch {
    reverted = true;
  }
  check("over-withdrawal reverts", reverted, true);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
