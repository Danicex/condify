// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * Per-goal USDT lock.
 *
 *  lock(goalId, amount, unlockAt)   user locks USDT for one goal (goalId is the backend's goal id)
 *  withdraw(goalId)                 after unlockAt the funds go back to the goal's owner (anyone may trigger it)
 *  unlockWithKey(...)               BEFORE unlockAt: needs a "task key", a signature from the trusted backend signer
 *                                   that the backend only issues after the user passed their task. Anyone may submit
 *                                   it (the backend relayer pays the gas); the funds ALWAYS go to the goal's owner.
 *
 * Goals are stored per (owner, goalId), so nobody can squat another user's goalId.
 * Task key = EIP-191 signature (by trustedSigner) over
 *   keccak256(abi.encodePacked(address(this), block.chainid, owner, goalId, amount, nonce, expiry))
 * where `amount` is the amount stored on-chain for that goal, so a key can never release more than was locked.
 */
contract USDTlock is Ownable {
    using SafeERC20 for IERC20;

    struct Goal {
        uint256 amount;
        uint256 unlockAt; // unix seconds
        bool released;
    }

    IERC20 public immutable usdt;
    address public trustedSigner;

    mapping(address => mapping(uint256 => Goal)) private _goals;
    mapping(address => uint256) private _locked; // sum of unreleased goals per user
    mapping(bytes32 => bool) public usedNonce;

    event Locked(address indexed user, uint256 indexed goalId, uint256 amount, uint256 unlockAt);
    event Withdrawn(address indexed user, uint256 indexed goalId, uint256 amount);
    event UnlockedWithKey(address indexed user, uint256 indexed goalId, uint256 amount, address relayer);
    event TrustedSignerChanged(address indexed signer);

    constructor(address usdt_, address trustedSigner_) Ownable(msg.sender) {
        require(usdt_ != address(0) && trustedSigner_ != address(0), "zero addr");
        usdt = IERC20(usdt_);
        trustedSigner = trustedSigner_;
        emit TrustedSignerChanged(trustedSigner_);
    }

    function setTrustedSigner(address signer) external onlyOwner {
        require(signer != address(0), "zero addr");
        trustedSigner = signer;
        emit TrustedSignerChanged(signer);
    }

    // ───────────── lock ─────────────
    function lock(uint256 goalId, uint256 amount, uint256 unlockAt) external {
        require(amount > 0, "amount=0");
        require(unlockAt > block.timestamp, "unlockAt in the past");
        Goal storage g = _goals[msg.sender][goalId];
        require(g.amount == 0, "goalId used");

        g.amount = amount;
        g.unlockAt = unlockAt;
        _locked[msg.sender] += amount;

        usdt.safeTransferFrom(msg.sender, address(this), amount);
        emit Locked(msg.sender, goalId, amount, unlockAt);
    }

    // ───────────── release paths ─────────────
    /// Lock period is over: funds go back to `user`. No key needed; anyone may call it (e.g. a relayer).
    function withdraw(address user, uint256 goalId) external {
        Goal storage g = _goals[user][goalId];
        require(g.amount > 0 && !g.released, "nothing to withdraw");
        require(block.timestamp >= g.unlockAt, "still locked");
        _release(user, g);
        emit Withdrawn(user, goalId, g.amount);
    }

    /// Early release with a task key from the backend. Funds go to `user`, whoever sends the transaction.
    function unlockWithKey(address user, uint256 goalId, bytes32 nonce, uint256 expiry, bytes calldata signature) external {
        Goal storage g = _goals[user][goalId];
        require(g.amount > 0 && !g.released, "nothing to unlock");
        require(block.timestamp <= expiry, "key expired");
        require(!usedNonce[nonce], "key already used");

        bytes32 digest = keccak256(abi.encodePacked(address(this), block.chainid, user, goalId, g.amount, nonce, expiry));
        address signer = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), signature);
        require(signer == trustedSigner, "bad key");

        usedNonce[nonce] = true;
        _release(user, g);
        emit UnlockedWithKey(user, goalId, g.amount, msg.sender);
    }

    function _release(address user, Goal storage g) private {
        uint256 amount = g.amount;
        g.released = true; // effects before the transfer
        _locked[user] -= amount;
        usdt.safeTransfer(user, amount);
    }

    // ───────────── views ─────────────
    function viewLockedUSDT(address user) external view returns (uint256) {
        return _locked[user];
    }

    function getGoal(address user, uint256 goalId) external view returns (uint256 amount, uint256 unlockAt, bool released) {
        Goal storage g = _goals[user][goalId];
        return (g.amount, g.unlockAt, g.released);
    }
}
