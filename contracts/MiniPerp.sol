// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title MiniPerp
/// @notice A deliberately minimal perpetuals margin vault for a testnet portfolio
///         demo. Users deposit ERC-20 collateral, open a single long/short position
///         at a caller-supplied mark price, and close it for a PnL-adjusted payout.
///
/// @dev SCOPE / LIMITATIONS — read before assuming this is production-grade:
///      - Price is supplied by the caller, not an oracle. A real venue reads a
///        signed price from Pyth/Chainlink; doing so here would obscure the part
///        this project is actually demonstrating (the front end). The trade-off is
///        that a caller can pick a favourable price, so this is testnet-only.
///      - One position per account, no funding rate, no partial fills, no
///        keeper-run liquidations. `liquidationPrice` is advisory only.
///      - Payouts are capped at the vault's collateral balance.
contract MiniPerp {
    // ---------------------------------------------------------------------
    // Types & constants
    // ---------------------------------------------------------------------

    struct Position {
        uint256 sizeUsd; // notional, 1e6
        uint256 entryPrice; // 1e8
        uint256 margin; // collateral locked, 1e6
        bool isLong;
        bool isOpen;
        uint64 openedAt;
    }

    IERC20 public immutable collateral;

    uint256 public constant PRICE_SCALE = 1e8;
    uint256 public constant MAX_LEVERAGE = 20;
    /// @dev Position is liquidatable once losses eat this share of margin (90%).
    uint256 public constant MAINTENANCE_BPS = 9_000;
    uint256 public constant BPS = 10_000;

    mapping(address => uint256) public freeCollateral; // 1e6
    mapping(address => Position) public positions;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event PositionOpened(
        address indexed account,
        bool isLong,
        uint256 sizeUsd,
        uint256 entryPrice,
        uint256 margin
    );
    event PositionClosed(
        address indexed account,
        uint256 exitPrice,
        int256 pnl,
        uint256 payout
    );

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAmount();
    error InsufficientFreeCollateral();
    error PositionAlreadyOpen();
    error NoOpenPosition();
    error InvalidPrice();
    error LeverageTooHigh();
    error TransferFailed();

    constructor(address collateralToken) {
        collateral = IERC20(collateralToken);
    }

    // ---------------------------------------------------------------------
    // Collateral
    // ---------------------------------------------------------------------

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (!collateral.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        freeCollateral[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (freeCollateral[msg.sender] < amount) revert InsufficientFreeCollateral();
        unchecked {
            freeCollateral[msg.sender] -= amount;
        }
        if (!collateral.transfer(msg.sender, amount)) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    function openPosition(
        bool isLong,
        uint256 sizeUsd,
        uint256 margin,
        uint256 entryPrice
    ) external {
        if (positions[msg.sender].isOpen) revert PositionAlreadyOpen();
        if (sizeUsd == 0 || margin == 0) revert ZeroAmount();
        if (entryPrice == 0) revert InvalidPrice();
        if (sizeUsd > margin * MAX_LEVERAGE) revert LeverageTooHigh();
        if (freeCollateral[msg.sender] < margin) revert InsufficientFreeCollateral();

        unchecked {
            freeCollateral[msg.sender] -= margin;
        }

        positions[msg.sender] = Position({
            sizeUsd: sizeUsd,
            entryPrice: entryPrice,
            margin: margin,
            isLong: isLong,
            isOpen: true,
            openedAt: uint64(block.timestamp)
        });

        emit PositionOpened(msg.sender, isLong, sizeUsd, entryPrice, margin);
    }

    function closePosition(uint256 exitPrice) external {
        Position memory p = positions[msg.sender];
        if (!p.isOpen) revert NoOpenPosition();
        if (exitPrice == 0) revert InvalidPrice();

        int256 pnl = _pnl(p, exitPrice);

        uint256 payout;
        if (pnl >= 0) {
            payout = p.margin + uint256(pnl);
            uint256 vaultBalance = collateral.balanceOf(address(this));
            if (payout > vaultBalance) payout = vaultBalance;
        } else {
            uint256 loss = uint256(-pnl);
            payout = loss >= p.margin ? 0 : p.margin - loss;
        }

        delete positions[msg.sender];
        freeCollateral[msg.sender] += payout;

        emit PositionClosed(msg.sender, exitPrice, pnl, payout);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getPosition(address account) external view returns (Position memory) {
        return positions[account];
    }

    /// @return pnl Signed PnL in collateral units (1e6) at `markPrice`.
    function unrealizedPnl(address account, uint256 markPrice) external view returns (int256) {
        Position memory p = positions[account];
        if (!p.isOpen || markPrice == 0) return 0;
        return _pnl(p, markPrice);
    }

    /// @notice Advisory liquidation price. Returns 0 when there is no open position.
    function liquidationPrice(address account) external view returns (uint256) {
        Position memory p = positions[account];
        if (!p.isOpen) return 0;

        // Liquidate when |loss| >= margin * MAINTENANCE_BPS / BPS.
        // loss = sizeUsd * |exit - entry| / entry
        //   =>  |exit - entry| = margin * MAINTENANCE_BPS * entry / (BPS * sizeUsd)
        uint256 delta = (p.margin * MAINTENANCE_BPS * p.entryPrice) / (BPS * p.sizeUsd);

        if (p.isLong) {
            return delta >= p.entryPrice ? 0 : p.entryPrice - delta;
        }
        return p.entryPrice + delta;
    }

    /// @return Total account value (free collateral + margin + unrealized PnL), floored at 0.
    function accountValue(address account, uint256 markPrice) external view returns (uint256) {
        Position memory p = positions[account];
        uint256 base = freeCollateral[account];
        if (!p.isOpen) return base;

        int256 equity = int256(base + p.margin) + _pnl(p, markPrice);
        return equity <= 0 ? 0 : uint256(equity);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _pnl(Position memory p, uint256 price) internal pure returns (int256) {
        int256 entry = int256(p.entryPrice);
        int256 diff = int256(price) - entry;
        if (!p.isLong) diff = -diff;
        return (int256(p.sizeUsd) * diff) / entry;
    }
}
