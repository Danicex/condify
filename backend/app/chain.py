"""
Backend <-> USDTlock contract (web3.py). This is where the server talks to the chain directly.

  get_goal()       read a goal from the contract (the on-chain amount / unlock time / released flag are the source of truth)
  relay_unlock()   submit the "task key" to unlockWithKey() from the relayer wallet. The relayer pays the gas, and the
                   contract always pays the funds to the goal's owner, so the relayer can never redirect money.

Env:
  RPC_URL                  JSON-RPC endpoint of the chain the lock contract is on (Sepolia now, Polygon later)
  LOCK_CONTRACT_ADDRESS    deployed USDTlock
  RELAYER_PRIVATE_KEY      wallet that pays gas for relayed releases. Defaults to UNLOCK_SIGNER_KEY; use a separate,
                           low-balance key in production so the signing key never needs ETH/POL.
  CHAIN_ID                 optional, read from the node when unset
  TX_TIMEOUT               seconds to wait for the release receipt (default 90)
"""
import os
import threading
from typing import Optional

from eth_utils import to_checksum_address

from app.errors import ApiError

LOCK_ABI = [
    {
        "type": "function", "name": "getGoal", "stateMutability": "view",
        "inputs": [{"name": "user", "type": "address"}, {"name": "goalId", "type": "uint256"}],
        "outputs": [{"name": "amount", "type": "uint256"}, {"name": "unlockAt", "type": "uint256"}, {"name": "released", "type": "bool"}],
    },
    {
        "type": "function", "name": "unlockWithKey", "stateMutability": "nonpayable",
        "inputs": [
            {"name": "user", "type": "address"}, {"name": "goalId", "type": "uint256"}, {"name": "nonce", "type": "bytes32"},
            {"name": "expiry", "type": "uint256"}, {"name": "signature", "type": "bytes"},
        ],
        "outputs": [],
    },
]

_send_lock = threading.Lock()  # one relayed tx at a time, so the relayer's nonce never collides
_w3 = None  # cached Web3 (tests inject one with set_web3)


def set_web3(w3) -> None:
    """Tests only: use an in-memory chain instead of RPC_URL."""
    global _w3
    _w3 = w3


def configured() -> bool:
    return bool(os.getenv("LOCK_CONTRACT_ADDRESS")) and (_w3 is not None or bool(os.getenv("RPC_URL")))


def _web3():
    global _w3
    if _w3 is None:
        url = os.getenv("RPC_URL")
        if not url:
            raise ApiError(503, "chain access is not configured on the server (RPC_URL)")
        from web3 import Web3
        _w3 = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 20}))
    return _w3


def _contract():
    addr = os.getenv("LOCK_CONTRACT_ADDRESS")
    if not addr:
        raise ApiError(503, "chain access is not configured on the server (LOCK_CONTRACT_ADDRESS)")
    return _web3().eth.contract(address=to_checksum_address(addr), abi=LOCK_ABI)


def chain_id() -> int:
    env = os.getenv("CHAIN_ID")
    if env:
        return int(env)
    try:
        return int(_web3().eth.chain_id)
    except ApiError:
        raise
    except Exception as e:
        raise ApiError(503, f"could not reach the chain: {type(e).__name__}") from e


def get_goal(user_address: str, goal_id: int) -> dict:
    """{amount: int (raw token units), unlock_at: int (unix s), released: bool}. amount == 0 means no such lock."""
    try:
        amount, unlock_at, released = _contract().functions.getGoal(to_checksum_address(user_address), int(goal_id)).call()
    except ApiError:
        raise
    except Exception as e:
        raise ApiError(503, f"could not read the lock contract: {type(e).__name__}") from e
    return {"amount": int(amount), "unlock_at": int(unlock_at), "released": bool(released)}


def _relayer_key() -> str:
    key = os.getenv("RELAYER_PRIVATE_KEY") or os.getenv("UNLOCK_SIGNER_KEY")
    if not key:
        raise ApiError(503, "no relayer wallet configured on the server (RELAYER_PRIVATE_KEY)")
    return key


def relayer_address() -> str:
    from eth_account import Account
    return Account.from_key(_relayer_key()).address


def relay_unlock(user_address: str, goal_id: int, nonce_hex: str, expiry: int, signature: str) -> Optional[str]:
    """
    Send unlockWithKey(user, goalId, nonce, expiry, signature) and wait for it to be mined.
    Returns the tx hash, or None when the goal was already released on-chain (idempotent: nothing to send).
    Raises ApiError when the chain is unreachable, the relayer is unfunded, or the contract rejects the key.
    """
    w3 = _web3()
    contract = _contract()
    user = to_checksum_address(user_address)

    state = get_goal(user, goal_id)
    if state["amount"] == 0:
        raise ApiError(409, "this goal has no lock on-chain")
    if state["released"]:
        return None

    from eth_account import Account
    acct = Account.from_key(_relayer_key())
    nonce_bytes = bytes.fromhex(nonce_hex.removeprefix("0x"))
    sig_bytes = bytes.fromhex(signature.removeprefix("0x"))
    fn = contract.functions.unlockWithKey(user, int(goal_id), nonce_bytes, int(expiry), sig_bytes)

    with _send_lock:
        try:
            tx = fn.build_transaction({
                "from": acct.address,
                "nonce": w3.eth.get_transaction_count(acct.address, "pending"),
                "chainId": chain_id(),
                "gasPrice": int(w3.eth.gas_price * 1.2),  # estimates gas too; a contract revert surfaces right here
            })
            signed = acct.sign_transaction(tx)
            raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction  # web3 v7+ / v6
            tx_hash = w3.eth.send_raw_transaction(raw)
        except Exception as e:
            msg = str(e)
            if "insufficient funds" in msg.lower():
                raise ApiError(503, "the relayer wallet is out of gas funds, top it up and retry") from e
            raise ApiError(502, f"release was not sent: {msg[:200]}") from e

        try:
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=int(os.getenv("TX_TIMEOUT", "90")))
        except Exception as e:
            raise ApiError(504, "release sent but not confirmed yet, retry in a minute (it is safe to retry)") from e

    if receipt["status"] != 1:
        raise ApiError(502, "the contract rejected the release")
    return tx_hash.hex() if tx_hash.hex().startswith("0x") else "0x" + tx_hash.hex()
