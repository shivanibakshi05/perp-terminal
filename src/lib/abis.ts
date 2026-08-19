/**
 * Hand-maintained ABIs. Kept as human-readable ethers signatures rather than
 * importing Hardhat artifacts so the frontend builds without a compile step
 * (and so Vercel doesn't need solc).
 */

export const MINI_PERP_ABI = [
  // Collateral
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function freeCollateral(address account) view returns (uint256)",

  // Trading
  "function openPosition(bool isLong, uint256 sizeUsd, uint256 margin, uint256 entryPrice)",
  "function closePosition(uint256 exitPrice)",

  // Views
  "function getPosition(address account) view returns (tuple(uint256 sizeUsd, uint256 entryPrice, uint256 margin, bool isLong, bool isOpen, uint64 openedAt))",
  "function unrealizedPnl(address account, uint256 markPrice) view returns (int256)",
  "function liquidationPrice(address account) view returns (uint256)",
  "function accountValue(address account, uint256 markPrice) view returns (uint256)",
  "function MAX_LEVERAGE() view returns (uint256)",

  // Events
  "event Deposited(address indexed account, uint256 amount)",
  "event Withdrawn(address indexed account, uint256 amount)",
  "event PositionOpened(address indexed account, bool isLong, uint256 sizeUsd, uint256 entryPrice, uint256 margin)",
  "event PositionClosed(address indexed account, uint256 exitPrice, int256 pnl, uint256 payout)",
] as const;

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function faucet()",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;
