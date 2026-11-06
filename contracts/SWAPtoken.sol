// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// swap usdt for nim / swap nim for usdt (fixed-rate pool, owner funds liquidity)
// rate = raw NIM units per 1e6 raw USDT units (owner sets, accounts for decimals)
contract SWAPtoken is Ownable {
    using SafeERC20 for IERC20;
    IERC20 public immutable usdt;
    IERC20 public immutable nim;
    uint256 public rate;
    uint256 public constant RATE_SCALE = 1e6;

    event Swapped(address indexed user, address tokenIn, uint256 amountIn, uint256 amountOut);

    constructor(address usdt_, address nim_, uint256 rate_) Ownable(msg.sender) {
        usdt = IERC20(usdt_); nim = IERC20(nim_); rate = rate_;
    }

    function setRate(uint256 r) external onlyOwner { require(r > 0, "rate=0"); rate = r; }

    function quoteUsdtToNim(uint256 usdtIn) public view returns (uint256) { return usdtIn * rate / RATE_SCALE; }
    function quoteNimToUsdt(uint256 nimIn) public view returns (uint256) { return nimIn * RATE_SCALE / rate; }

    function swapUSDTforNIM(uint256 usdtIn) external {
        uint256 out = quoteUsdtToNim(usdtIn);
        require(out > 0, "too small");
        usdt.safeTransferFrom(msg.sender, address(this), usdtIn);
        nim.safeTransfer(msg.sender, out);
        emit Swapped(msg.sender, address(usdt), usdtIn, out);
    }

    function swapNIMforUSDT(uint256 nimIn) external {
        uint256 out = quoteNimToUsdt(nimIn);
        require(out > 0, "too small");
        nim.safeTransferFrom(msg.sender, address(this), nimIn);
        usdt.safeTransfer(msg.sender, out);
        emit Swapped(msg.sender, address(nim), nimIn, out);
    }

    // owner adds/removes liquidity
    function withdraw(address token, uint256 amount) external onlyOwner { IERC20(token).safeTransfer(msg.sender, amount); }
}
