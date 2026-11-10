"""
All eth_account / signature code in one place. (Named wallet.py, not eth_account.py: a file with the library's own
name inside the project can shadow the real package and break `import eth_account`.)

  Sign-in      verify_signed_message()   did this address sign this text?          (used by app/auth.py)
  Unlock keys  unlock_digest()           the exact bytes the lock contract hashes  (used by app/task_ai.py)
               sign_digest()             backend signs that digest
               signer_address()          the public address to configure as the contract's trusted signer
"""
from eth_abi.packed import encode_packed
from eth_account import Account
from eth_account.messages import encode_defunct
from eth_utils import is_address, keccak, to_checksum_address


def normalize_address(address: str) -> str:
    """Lowercase 0x address, or ValueError."""
    if not is_address(address or ""):
        raise ValueError("invalid wallet address")
    return address.lower()


# ───────────────────────────── sign-in ─────────────────────────────
def recover_signer(message: str, signature: str) -> str:
    """Address (lowercase) that produced an EIP-191 personal_sign signature of `message`. Raises ValueError if malformed."""
    try:
        return Account.recover_message(encode_defunct(text=message), signature=signature).lower()
    except Exception as e:
        raise ValueError("invalid signature") from e


def verify_signed_message(address: str, message: str, signature: str) -> bool:
    try:
        return recover_signer(message, signature) == normalize_address(address)
    except ValueError:
        return False


# ───────────────────────────── unlock keys ─────────────────────────────
def unlock_digest(lock_address: str, chain_id: int, user_address: str, goal_id: int, amount_raw: int, nonce_hex: str, expiry: int) -> bytes:
    """
    keccak256(abi.encodePacked(lock, chainId, user, goalId, amount, nonce, expiry)).
    Solidity side:  bytes32 h = keccak256(abi.encodePacked(address(this), block.chainid, msg.sender, goalId, amount, nonce, expiry));
                    ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(h), sig) == trustedSigner
    """
    packed = encode_packed(
        ["address", "uint256", "address", "uint256", "uint256", "bytes32", "uint256"],
        [to_checksum_address(lock_address), chain_id, to_checksum_address(user_address), goal_id, amount_raw, bytes.fromhex(nonce_hex.removeprefix("0x")), expiry],
    )
    return keccak(packed)


def sign_digest(digest: bytes, private_key: str) -> str:
    """EIP-191 signed-message signature over the 32-byte digest, as 0x + 65 bytes (r, s, v)."""
    sig = Account.sign_message(encode_defunct(primitive=digest), private_key=private_key).signature.hex()
    return "0x" + sig.removeprefix("0x")


def signer_address(private_key: str) -> str:
    return Account.from_key(private_key).address
