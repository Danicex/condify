export const CHAIN_ID_HEX = "0xaa36a7"; // Sepolia (11155111)
export const ADDRESSES = {
  USDT:    "0xb1d4657f403609d680a2d274f5f7705e2ac54DeA",
  NIM:     "0xFBd28e9BdFe7FFd1C1860067515D7d0F111458b3",
  LOCK:    "0xda9092f7f7a2974bC4BF50E3FDd23Cf5fb9aD990",
  SWAP:    "0x0e8Ca14B52Ba0753e3E0a056f22A2969a51355e0",
  CONDIFI: "0x831f56369B941cB8Df3Acfc24e2DB2Ef33a1440c",
};
export const DECIMALS = { USDT: 6, NIM: 5 };

export const ERC20_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function faucet(uint256 amount)",
];
export const LOCK_ABI = [
  "function lockUSDT(uint256 amount)",
  "function unlockUSDT(uint256 amount)",
  "function viewLockedUSDT(address user) view returns (uint256)",
];
export const SWAP_ABI = [
  "function swapUSDTforNIM(uint256 usdtIn)",
  "function swapNIMforUSDT(uint256 nimIn)",
  "function quoteUsdtToNim(uint256) view returns (uint256)",
  "function quoteNimToUsdt(uint256) view returns (uint256)",
];
export const CONDIFI_ABI = [
  "function sendUSDT(address to,uint256 amount)",
  "function sendNIM(address to,uint256 amount)",
];