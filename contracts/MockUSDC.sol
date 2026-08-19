// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockUSDC
/// @notice Minimal 6-decimal ERC-20 used as testnet collateral. Anyone can mint
///         from the faucet so demo users can fund an account without a real faucet.
contract MockUSDC {
    string public constant name = "Mock USD Coin";
    string public constant symbol = "mUSDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @dev 10,000 mUSDC per faucet call, rate limited per address.
    uint256 public constant FAUCET_AMOUNT = 10_000 * 1e6;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;
    mapping(address => uint256) public lastFaucetAt;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();
    error FaucetCooldown(uint256 availableAt);

    function faucet() external {
        uint256 nextAllowed = lastFaucetAt[msg.sender] + FAUCET_COOLDOWN;
        if (lastFaucetAt[msg.sender] != 0 && block.timestamp < nextAllowed) {
            revert FaucetCooldown(nextAllowed);
        }
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (balanceOf[from] < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] -= value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        unchecked {
            balanceOf[to] += value;
        }
        emit Transfer(address(0), to, value);
    }
}
