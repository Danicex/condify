// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// send USDT / send NIM (user must approve this contract first)
contract CONDIFI {
    using SafeERC20 for IERC20;
    IERC20 public immutable usdt;
    IERC20 public immutable nim;

    event Sent(address indexed from, address indexed to, address token, uint256 amount);

    constructor(address usdt_, address nim_) { usdt = IERC20(usdt_); nim = IERC20(nim_); }

    function sendUSDT(address to, uint256 amount) external {
        require(to != address(0), "zero addr");
        usdt.safeTransferFrom(msg.sender, to, amount);
        emit Sent(msg.sender, to, address(usdt), amount);
    }

    function sendNIM(address to, uint256 amount) external {
        require(to != address(0), "zero addr");
        nim.safeTransferFrom(msg.sender, to, amount);
        emit Sent(msg.sender, to, address(nim), amount);
    }
}
