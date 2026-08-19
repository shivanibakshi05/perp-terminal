import type { ContractTransactionResponse } from "ethers";
import { MaxUint256 } from "ethers";
import { PERP_ADDRESS } from "@/lib/config";
import { humanizeError, writeCollateral, writePerp } from "@/lib/ethereum";
import { toCollateral, toPrice } from "@/lib/format";
import { nextTxId, useTxStore } from "@/store/txStore";
import { useAccountStore } from "@/store/accountStore";
import { EMPTY_POSITION, type PositionView } from "@/lib/types";

/**
 * Wraps a contract write in the full lifecycle so every call site gets
 * signing -> pending -> confirmed/failed for free, with the hash surfaced the
 * moment it exists (not after confirmation — a trader wants the explorer link
 * while they wait).
 */
async function runTx(
  label: string,
  send: () => Promise<ContractTransactionResponse>
): Promise<boolean> {
  const id = nextTxId();
  const tx = useTxStore.getState();
  tx.start(id, label);

  try {
    const response = await send();
    tx.update(id, { stage: "pending", hash: response.hash });

    const receipt = await response.wait();

    if (receipt && receipt.status === 0) {
      tx.update(id, { stage: "failed", error: "Reverted on chain" });
      return false;
    }

    tx.update(id, { stage: "confirmed" });
    return true;
  } catch (err) {
    tx.update(id, { stage: "failed", error: humanizeError(err) });
    return false;
  }
}

export async function claimFaucet(): Promise<boolean> {
  return runTx("Claim 10,000 mUSDC", async () => {
    const token = await writeCollateral();
    return token.faucet() as Promise<ContractTransactionResponse>;
  });
}

/**
 * ERC-20 approve. Deliberately exposed as its own step rather than hidden
 * inside `deposit`, because the two-transaction approve→act dance is a real
 * part of the EVM UX and pretending otherwise makes the pending states lie.
 */
export async function approveCollateral(amount?: number): Promise<boolean> {
  const value = amount === undefined ? MaxUint256 : toCollateral(amount);
  return runTx("Approve mUSDC", async () => {
    const token = await writeCollateral();
    return token.approve(PERP_ADDRESS, value) as Promise<ContractTransactionResponse>;
  });
}

export async function depositCollateral(amount: number): Promise<boolean> {
  return runTx(`Deposit ${amount.toLocaleString()} mUSDC`, async () => {
    const perp = await writePerp();
    return perp.deposit(toCollateral(amount)) as Promise<ContractTransactionResponse>;
  });
}

export async function withdrawCollateral(amount: number): Promise<boolean> {
  return runTx(`Withdraw ${amount.toLocaleString()} mUSDC`, async () => {
    const perp = await writePerp();
    return perp.withdraw(toCollateral(amount)) as Promise<ContractTransactionResponse>;
  });
}

export async function openPositionOnChain(params: {
  isLong: boolean;
  sizeUsd: number;
  margin: number;
  entryPrice: number;
}): Promise<boolean> {
  const { isLong, sizeUsd, margin, entryPrice } = params;

  // Optimistic overlay: paint the position immediately, reconcile on sync.
  const optimistic: PositionView = {
    isOpen: true,
    isLong,
    sizeUsd,
    entryPrice,
    margin,
    openedAt: Date.now(),
    liquidationPrice: 0,
  };
  useAccountStore.getState().setOptimisticPosition(optimistic);

  const ok = await runTx(
    `${isLong ? "Long" : "Short"} $${sizeUsd.toLocaleString()}`,
    async () => {
      const perp = await writePerp();
      return perp.openPosition(
        isLong,
        toCollateral(sizeUsd),
        toCollateral(margin),
        toPrice(entryPrice)
      ) as Promise<ContractTransactionResponse>;
    }
  );

  if (!ok) {
    // Roll the optimistic paint back — the chain never accepted it.
    useAccountStore.getState().setOptimisticPosition(null);
  }

  return ok;
}

export async function closePositionOnChain(exitPrice: number): Promise<boolean> {
  useAccountStore.getState().setOptimisticPosition(EMPTY_POSITION);

  const ok = await runTx("Close position", async () => {
    const perp = await writePerp();
    return perp.closePosition(toPrice(exitPrice)) as Promise<ContractTransactionResponse>;
  });

  if (!ok) {
    useAccountStore.getState().setOptimisticPosition(null);
  }

  return ok;
}
