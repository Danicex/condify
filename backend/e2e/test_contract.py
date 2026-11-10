import json, os, sys, secrets
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from web3 import Web3, EthereumTesterProvider
from eth_account import Account
from app.wallet import unlock_digest, sign_digest, signer_address

C = json.load(open(os.path.join(HERE, 'compiled.json')))
w3 = Web3(EthereumTesterProvider())
owner, user, relayer, attacker, other = w3.eth.accounts[:5]
signer_key = Account.create().key.hex()
SIGNER = signer_address(signer_key)

def deploy(name, *args):
    c = w3.eth.contract(abi=C[name]['abi'], bytecode=C[name]['bytecode'])
    h = c.constructor(*args).transact({'from': owner})
    return w3.eth.contract(address=w3.eth.wait_for_transaction_receipt(h).contractAddress, abi=C[name]['abi'])

usdt = deploy('MockToken', 'Test USDT', 'USDT', 6)
lock = deploy('USDTlock', usdt.address, SIGNER)
chain_id = w3.eth.chain_id
now = lambda: w3.eth.get_block('latest').timestamp
def raises(fn, label):
    try: fn(); print('FAIL (no revert):', label); sys.exit(1)
    except SystemExit: raise
    except Exception as e: print('ok  reverts:', label, '->', str(e)[:70].replace('\n',' '))

def key_for(user_addr, goal_id, amount, expiry, nonce=None, key=signer_key):
    nonce = nonce or '0x' + secrets.token_hex(32)
    d = unlock_digest(lock.address, chain_id, user_addr, goal_id, amount, nonce, expiry)
    return nonce, sign_digest(d, key)

AMT = 25 * 10**6
for a in (user, other, attacker):
    usdt.functions.faucet(100 * 10**6).transact({'from': a}); usdt.functions.approve(lock.address, 10**12).transact({'from': a})
bal = lambda a: usdt.functions.balanceOf(a).call()

# lock
lock.functions.lock(1, AMT, now() + 1000).transact({'from': user})
lock.functions.lock(2, AMT, now() + 1000).transact({'from': user})
assert lock.functions.viewLockedUSDT(user).call() == 2 * AMT
assert lock.functions.getGoal(user, 1).call()[0] == AMT
print('ok  lock x2, viewLockedUSDT =', 2 * AMT)
raises(lambda: lock.functions.lock(1, AMT, now() + 1000).transact({'from': user}), 'goalId reuse')
raises(lambda: lock.functions.lock(3, AMT, now() - 5).transact({'from': user}), 'unlockAt in the past')
raises(lambda: lock.functions.lock(3, 0, now() + 100).transact({'from': user}), 'amount 0')
lock.functions.lock(1, 5 * 10**6, now() + 1000).transact({'from': attacker})  # same goalId for another user: allowed, no squatting
print('ok  same goalId from another address is independent (no squatting)')

# no key / early withdraw
raises(lambda: lock.functions.withdraw(user, 1).transact({'from': user}), 'withdraw before unlockAt')

# task key paths
exp = now() + 600
n, sig = key_for(user, 1, AMT, exp)
before = bal(user)
lock.functions.unlockWithKey(user, 1, n, exp, sig).transact({'from': relayer})   # relayer pays gas
assert bal(user) == before + AMT and bal(relayer) == 0
assert lock.functions.viewLockedUSDT(user).call() == AMT
print('ok  relayer-submitted key released', AMT, 'to the OWNER (relayer got 0)')
raises(lambda: lock.functions.unlockWithKey(user, 1, n, exp, sig).transact({'from': relayer}), 'replay same key / already released')
n2, sig2 = key_for(user, 2, AMT, exp, key=Account.create().key.hex())
raises(lambda: lock.functions.unlockWithKey(user, 2, n2, exp, sig2).transact({'from': relayer}), 'key signed by the wrong signer')
n3, sig3 = key_for(user, 2, AMT, now() - 1)
raises(lambda: lock.functions.unlockWithKey(user, 2, n3, now() - 1, sig3).transact({'from': relayer}), 'expired key')
n4, sig4 = key_for(user, 2, AMT + 1, exp)  # amount in key differs from on-chain amount
raises(lambda: lock.functions.unlockWithKey(user, 2, n4, exp, sig4).transact({'from': relayer}), 'key for a different amount')
n5, sig5 = key_for(user, 2, AMT, exp)
raises(lambda: lock.functions.unlockWithKey(attacker, 1, n5, exp, sig5).transact({'from': relayer}), "user's key replayed on attacker's goal")
raises(lambda: lock.functions.unlockWithKey(user, 2, n5, exp, sig5[:-2] + '00').transact({'from': relayer}), 'tampered signature')

# time-based withdraw: anyone can trigger, owner is paid
w3.provider.ethereum_tester.time_travel(now() + 2000)
w3.provider.ethereum_tester.mine_blocks(1)
before = bal(user)
lock.functions.withdraw(user, 2).transact({'from': relayer})
assert bal(user) == before + AMT
assert lock.functions.viewLockedUSDT(user).call() == 0
print('ok  withdraw after unlockAt paid the owner (triggered by a third party)')
raises(lambda: lock.functions.withdraw(user, 2).transact({'from': user}), 'double withdraw')
# old API is gone
assert not any(f.get('name') == 'unlockUSDT' for f in C['USDTlock']['abi'])
print('ok  old unrestricted unlockUSDT() no longer exists')
print('CONTRACT TESTS PASSED; digest in wallet.py matches the contract')
