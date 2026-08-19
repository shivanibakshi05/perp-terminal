import { ethers, network } from "hardhat";

/**
 * Deploys MockUSDC + MiniPerp and prints the env lines to paste into .env.local.
 *
 *   npm run deploy:baseSepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    throw new Error(
      "No signer available. Set DEPLOYER_PRIVATE_KEY in .env.local before deploying to a testnet."
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`\nNetwork:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    throw new Error(
      "Deployer has 0 ETH. Fund it from a testnet faucet before deploying."
    );
  }

  console.log("Deploying MockUSDC...");
  const usdcFactory = await ethers.getContractFactory("MockUSDC");
  const usdc = await usdcFactory.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log(`  MockUSDC  -> ${usdcAddress}`);

  console.log("Deploying MiniPerp...");
  const perpFactory = await ethers.getContractFactory("MiniPerp");
  const perp = await perpFactory.deploy(usdcAddress);
  await perp.waitForDeployment();
  const perpAddress = await perp.getAddress();
  console.log(`  MiniPerp  -> ${perpAddress}`);

  // Seed the vault so winning positions can actually be paid out.
  console.log("\nSeeding vault liquidity...");
  const faucetTx = await usdc.faucet();
  await faucetTx.wait();
  const seedAmount = 5_000n * 10n ** 6n;
  const seedTx = await usdc.transfer(perpAddress, seedAmount);
  await seedTx.wait();
  console.log(`  Sent 5,000 mUSDC to the vault as payout liquidity.`);

  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("\n" + "-".repeat(64));
  console.log("Paste these into .env.local:\n");
  console.log(`NEXT_PUBLIC_CHAIN_ID=${chainId}`);
  console.log(`NEXT_PUBLIC_PERP_ADDRESS=${perpAddress}`);
  console.log(`NEXT_PUBLIC_COLLATERAL_ADDRESS=${usdcAddress}`);
  console.log("-".repeat(64) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
