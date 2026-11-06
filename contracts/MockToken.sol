// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Testnet-only token. Deploy twice: ("Test USDT","USDT",6) and ("Wrapped NIM","wNIM",5)
contract MockToken is ERC20 {
    uint8 private immutable _dec;
    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
        _mint(msg.sender, 1_000_000 * 10 ** d);
    }
    function decimals() public view override returns (uint8) { return _dec; }
    function faucet(uint256 amount) external { _mint(msg.sender, amount); }
}
