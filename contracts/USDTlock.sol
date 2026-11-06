// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// lock usdt / unlock usdt / view locked usdt
contract USDTlock {
    using SafeERC20 for IERC20;
    IERC20 public immutable usdt;
    mapping(address => uint256) private _locked;

    event Locked(address indexed user, uint256 amount);
    event Unlocked(address indexed user, uint256 amount);

    constructor(address usdt_) { usdt = IERC20(usdt_); }

    function lockUSDT(uint256 amount) external {
        require(amount > 0, "amount=0");
        _locked[msg.sender] += amount;
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        emit Locked(msg.sender, amount);
    }

    function unlockUSDT(uint256 amount) external {
        require(amount > 0 && amount <= _locked[msg.sender], "bad amount");
        _locked[msg.sender] -= amount;
        usdt.safeTransfer(msg.sender, amount);
        emit Unlocked(msg.sender, amount);
    }

    function viewLockedUSDT(address user) external view returns (uint256) {
        return _locked[user];
    }
}
