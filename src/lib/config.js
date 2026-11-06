export const CHAIN_ID_HEX = "0xaa36a7"; // Sepolia (11155111)
export const ADDRESSES = {
  USDT:    "PASTE_USDT_ADDRESS",
  NIM:     "PASTE_NIM_ADDRESS",
  LOCK:    "PASTE_LOCK_ADDRESS",
  SWAP:    "PASTE_SWAP_ADDRESS",
  CONDIFI: "PASTE_CONDIFI_ADDRESS",
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