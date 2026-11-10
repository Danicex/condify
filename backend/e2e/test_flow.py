import json, os, sys, tempfile
from datetime import datetime, timezone, timedelta
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from web3 import Web3, EthereumTesterProvider
from eth_account import Account
from eth_account.messages import encode_defunct

db = os.path.join(tempfile.mkdtemp(), 'flow.db')
signer_acct, relayer_acct = Account.create(), Account.create()
os.environ.update(JWT_SECRET='x' * 40, DATABASE_URL=f'sqlite:///{db}', UNLOCK_SIGNER_KEY=signer_acct.key.hex(),
                  RELAYER_PRIVATE_KEY=relayer_acct.key.hex(), TX_TIMEOUT='10')
os.environ.pop('AUTH_DEV_MODE', None)

C = json.load(open(os.path.join(HERE, 'compiled.json')))
w3 = Web3(EthereumTesterProvider())
deployer = w3.eth.accounts[0]
def deploy(name, *args):
    h = w3.eth.contract(abi=C[name]['abi'], bytecode=C[name]['bytecode']).constructor(*args).transact({'from': deployer})
    return w3.eth.contract(address=w3.eth.wait_for_transaction_receipt(h).contractAddress, abi=C[name]['abi'])
usdt = deploy('MockToken', 'Test USDT', 'USDT', 6)
lock = deploy('USDTlock', usdt.address, signer_acct.address)
os.environ['LOCK_CONTRACT_ADDRESS'] = lock.address
w3.eth.send_transaction({'from': deployer, 'to': relayer_acct.address, 'value': 10**18})

from app import chain, task_ai
chain.set_web3(w3)
from fastapi.testclient import TestClient
from app.main import app

# ---- stub the LLM: generation returns a quiz, the judge passes only the answer "42" ----
calls = {'gen': 0, 'judge': 0}
def fake_llm(prompt, *, system=None, images=None):
    if 'Create ONE task' in prompt:
        calls['gen'] += 1
        return {'title': 'Answer to everything', 'description': 'Type the answer to life, the universe and everything.',
                'submission_type': 'text', 'answer_key': '42', 'rubric': 'Pass only if the answer is 42.'}
    calls['judge'] += 1
    sub = prompt.split('<submission>')[1].split('</submission>')[0]
    ok = '42' in sub
    return {'passed': ok, 'score': 0.95 if ok else 0.1, 'feedback': 'Correct!' if ok else 'Not quite.'}
task_ai.use_llm = fake_llm

def send(fn, acct):
    tx = fn.build_transaction({'from': acct.address, 'nonce': w3.eth.get_transaction_count(acct.address), 'chainId': w3.eth.chain_id, 'gasPrice': w3.eth.gas_price})
    h = w3.eth.send_raw_transaction(acct.sign_transaction(tx).raw_transaction)
    r = w3.eth.wait_for_transaction_receipt(h); assert r['status'] == 1, 'tx failed'; return h.hex()
def fund(acct, usd=100):
    w3.eth.send_transaction({'from': deployer, 'to': acct.address, 'value': 10**18})
    send(usdt.functions.faucet(usd * 10**6), acct); send(usdt.functions.approve(lock.address, 10**12), acct)
bal = lambda a: usdt.functions.balanceOf(a).call()
chain_now = lambda: w3.eth.get_block('latest').timestamp
def sign_text(acct, text): return '0x' + acct.sign_message(encode_defunct(text=text)).signature.hex().removeprefix('0x')
def iso(dt): return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
def check(cond, label):
    if not cond: print('FAIL:', label); sys.exit(1)
    print('ok ', label)

alice, bob = Account.create(), Account.create()
fund(alice); fund(bob)

with TestClient(app) as c:
    def login(acct, username=None):
        n = c.get('/auth/nonce', params={'address': acct.address}).json()
        sig = sign_text(acct, n['message'])
        r = c.post('/auth/login', json={'address': acct.address, 'signature': sig})
        if r.status_code == 404 and username:
            r = c.post('/auth/create_user', json={'address': acct.address, 'username': username, 'signature': sig})
        return r
    H = lambda t: {'Authorization': f'Bearer {t}'}

    # ───── auth ─────
    check(c.get('/goals').status_code == 401, 'no token -> 401')
    n1 = c.get('/auth/nonce', params={'address': alice.address}).json(); n2 = c.get('/auth/nonce', params={'address': alice.address}).json()
    check(n1['message'] == n2['message'], 'a valid nonce is reused (a stranger cannot clobber it)')
    r = c.post('/auth/login', json={'address': alice.address, 'signature': sign_text(alice, n1['message'])})
    check(r.status_code == 404, 'login for an unknown wallet -> 404 (nonce NOT burned)')
    r = c.post('/auth/create_user', json={'address': alice.address, 'username': 'alice_01', 'signature': sign_text(bob, n1['message'])})
    check(r.status_code == 401, "someone else's signature is rejected")
    r = c.post('/auth/create_user', json={'address': alice.address, 'username': 'alice_01', 'signature': sign_text(alice, n1['message'])})
    check(r.status_code == 201 and r.json()['user']['username'] == 'alice_01', 'create_user with the SAME signature after the 404 -> 201 + JWT')
    ta = r.json()['token']
    r = c.post('/auth/create_user', json={'address': alice.address, 'username': 'alice_01', 'signature': sign_text(alice, n1['message'])})
    check(r.status_code == 409, 'cannot create the same wallet twice')
    check(login(alice).status_code == 200, 'returning login with a fresh nonce -> 200')
    r = c.post('/auth/login', json={'address': alice.address, 'signature': sign_text(alice, n1['message'])})
    check(r.status_code == 401, 'a used nonce cannot be replayed')
    tb = login(bob, 'bob_02').json()['token']
    check(c.get('/me', headers=H(ta)).json()['address'] == alice.address.lower(), '/me returns the authenticated wallet')
    check(c.get('/goals', headers={'Authorization': 'Bearer garbage'}).status_code == 401, 'garbage token -> 401')

    # ───── goal lifecycle: pending -> lock on-chain -> confirm ─────
    unlock_at = datetime.now(timezone.utc) + timedelta(days=30)
    body = {'name': 'Tesla fund', 'amount': 25, 'token': 'USDT', 'unlock_at': iso(unlock_at), 'task_category': 'brain_teaser', 'task_difficulty': 'easy'}
    check(c.post('/goals', json={**body, 'status': 'active', 'amount_raw': '1'}, headers=H(ta)).json()['status'] == 'pending', 'client cannot choose the goal status (extra fields ignored)')
    c.delete('/goals/1', headers=H(ta))
    g = c.post('/goals', json=body, headers=H(ta)).json(); gid = g['id']
    check(g['status'] == 'pending', 'new goal is pending')
    check(c.post('/goals', json={**body, 'unlock_at': iso(datetime.now(timezone.utc) - timedelta(days=1))}, headers=H(ta)).status_code == 422, 'unlock_at in the past -> 422')
    check(c.post('/goals', json={**body, 'token': 'NIM'}, headers=H(ta)).status_code == 422, 'only USDT goals')
    r = c.post(f'/goals/{gid}/confirm', json={}, headers=H(ta))
    check(r.status_code == 409, 'confirm before the lock exists on-chain -> 409')
    check(c.post(f'/goals/{gid}/task', headers=H(ta)).status_code == 409, 'no task for an unconfirmed goal')

    lock_tx = send(lock.functions.lock(gid, 25 * 10**6, chain_now() + 86400 * 30), alice)
    check(c.post(f'/goals/{gid}/confirm', json={}, headers=H(tb)).status_code == 404, "bob cannot confirm alice's goal")
    r = c.post(f'/goals/{gid}/confirm', json={'tx_hash': lock_tx if lock_tx.startswith('0x') else '0x' + lock_tx}, headers=H(ta)).json()
    check(r['status'] == 'active' and abs(r['amount'] - 25) < 1e-9, 'confirm reads the contract -> active, amount copied from chain')
    check(c.post(f'/goals/{gid}/confirm', json={}, headers=H(ta)).json()['status'] == 'active', 'confirm is idempotent')
    check(c.delete(f'/goals/{gid}', headers=H(ta)).status_code == 409, 'a locked goal cannot be deleted')
    check(c.get(f'/goals/{gid}', headers=H(tb)).status_code == 404, "bob cannot read alice's goal")
    check(c.patch(f'/goals/{gid}', json={'status': 'liquidated'}, headers=H(ta)).status_code in (404, 405), 'no generic PATCH to fake a release')
    check(bal(alice.address) == 75 * 10**6, 'alice USDT is in the contract (75 left in wallet)')

    # ───── AI task ─────
    check(c.post(f'/goals/{gid}/release', headers=H(ta)).status_code == 403, 'release before passing a task -> 403')
    t = c.post(f'/goals/{gid}/task', json={}, headers=H(ta)).json()
    check(t['status'] == 'pending' and 'answer_key' not in t and 'rubric' not in t and 'unlock_nonce' not in t, 'task response hides answer_key / rubric / nonce')
    check(c.post(f'/goals/{gid}/task', json={}, headers=H(ta)).json()['id'] == t['id'] and calls['gen'] == 1, 'generate is idempotent (one live task, one LLM call)')
    check(c.post(f'/goals/{gid}/task', headers=H(tb)).status_code == 404, "bob cannot generate a task for alice's goal")
    check(c.post(f'/goals/{gid}/task/verify', data={'text': '42'}, headers=H(tb)).status_code == 404, "bob cannot submit proof for alice's goal")
    r = c.post(f'/goals/{gid}/task/verify', data={'text': 'seven'}, headers=H(ta)).json()
    check(r['passed'] is False and r['attempts_left'] == 2 and r['release'] is None and r['unlock'] is None, 'wrong answer: no key, no release, attempt spent')
    check(c.post(f'/goals/{gid}/task/verify', data={}, headers=H(ta)).status_code == 422, 'empty submission rejected without spending an attempt')
    r = c.post(f'/goals/{gid}/task/verify', data={'text': 'It is 42'}, headers=H(ta)).json()
    check(r['passed'] is True and r['release']['released'] is True and r['release']['tx_hash'], 'right answer: backend relayed the key to the contract')
    check(bal(alice.address) == 100 * 10**6, "funds are back in ALICE's wallet (relayer paid the gas)")
    check(lock.functions.getGoal(alice.address, gid).call()[2] is True, 'contract says released')
    gg = c.get(f'/goals/{gid}', headers=H(ta)).json()
    check(gg['status'] == 'liquidated' and gg['release_tx_hash'] == r['release']['tx_hash'], 'DB goal liquidated with the release tx hash')
    check(len(c.get('/tasks', headers=H(ta)).json()) == 1 and c.get('/tasks', headers=H(tb)).json() == [], '/tasks lists alice\'s completion only')
    acts = [a['kind'] for a in c.get('/activities', headers=H(ta)).json()]
    check('lock' in acts and 'unlock' in acts, 'server wrote lock + unlock activity rows')
    check(c.post(f'/goals/{gid}/release', headers=H(ta)).json()['released'] is True, 'release retry after success is a no-op')

    # ───── timed withdraw: user's own tx, then sync ─────
    g2 = c.post('/goals', json={**body, 'name': 'Holiday'}, headers=H(ta)).json()
    send(lock.functions.lock(g2['id'], 10 * 10**6, chain_now() + 1000), alice)
    c.post(f"/goals/{g2['id']}/confirm", json={}, headers=H(ta))
    check(c.post(f"/goals/{g2['id']}/sync", headers=H(ta)).json()['status'] == 'active', 'sync does nothing while still locked')
    w3.provider.ethereum_tester.time_travel(chain_now() + 2000); w3.provider.ethereum_tester.mine_blocks(1)
    send(lock.functions.withdraw(alice.address, g2['id']), alice)
    r = c.post(f"/goals/{g2['id']}/sync", headers=H(ta)).json()
    check(r['status'] == 'liquidated', 'after the user withdraws, sync marks the goal liquidated (read from chain)')

    # ───── relay failure then retry ─────
    g3 = c.post('/goals', json={**body, 'name': 'Rainy day'}, headers=H(ta)).json()
    send(lock.functions.lock(g3['id'], 5 * 10**6, chain_now() + 86400 * 30), alice)
    c.post(f"/goals/{g3['id']}/confirm", json={}, headers=H(ta)); c.post(f"/goals/{g3['id']}/task", json={}, headers=H(ta))
    os.environ['RELAYER_PRIVATE_KEY'] = Account.create().key.hex()  # an unfunded relayer
    r = c.post(f"/goals/{g3['id']}/task/verify", data={'text': '42'}, headers=H(ta)).json()
    check(r['passed'] is True and r['release']['released'] is False and r['release']['error'] and r['unlock'], 'relay failed: pass is kept, key is returned, error explained -> "%s"' % r['release']['error'][:60])
    check(c.get(f"/goals/{g3['id']}", headers=H(ta)).json()['status'] == 'active', 'goal stays active until the chain confirms')
    os.environ['RELAYER_PRIVATE_KEY'] = relayer_acct.key.hex()
    r = c.post(f"/goals/{g3['id']}/release", headers=H(ta)).json()
    check(r['released'] is True and r['goal']['status'] == 'liquidated', 'retry via /release succeeds')

    # ───── wallet fallback: relayer is down, the user submits the key from their own wallet ─────
    g5 = c.post('/goals', json={**body, 'name': 'Fallback'}, headers=H(ta)).json()
    send(lock.functions.lock(g5['id'], 5 * 10**6, chain_now() + 86400 * 30), alice)
    c.post(f"/goals/{g5['id']}/confirm", json={}, headers=H(ta)); c.post(f"/goals/{g5['id']}/task", headers=H(ta))
    check(c.get(f"/goals/{g5['id']}/unlock-key", headers=H(ta)).status_code == 403, 'unlock-key is refused until the task is passed')
    os.environ['RELAYER_PRIVATE_KEY'] = Account.create().key.hex()  # relayer unfunded again
    check(c.post(f"/goals/{g5['id']}/task/verify", data={'text': '42'}, headers=H(ta)).json()['release']['released'] is False, 'relayer down: task passed, funds not moved yet')
    check(c.get(f"/goals/{g5['id']}/unlock-key", headers=H(tb)).status_code == 404, "bob cannot fetch alice's unlock key")
    key = c.get(f"/goals/{g5['id']}/unlock-key", headers=H(ta)).json()   # still available after a reload, not only in the verify response
    before = bal(alice.address)
    send(lock.functions.unlockWithKey(alice.address, g5['id'], key['nonce'], key['expiry'], key['signature']), alice)
    check(bal(alice.address) == before + 5 * 10**6, 'alice submitted the key herself (she paid the gas) and got her USDT back')
    check(c.post(f"/goals/{g5['id']}/sync", headers=H(ta)).json()['status'] == 'liquidated', 'sync then marks the goal liquidated')
    os.environ['RELAYER_PRIVATE_KEY'] = relayer_acct.key.hex()

    # ───── the task a user must do is fixed when the goal is created ─────
    g6 = c.post('/goals', json={**body, 'name': 'Commitment', 'task_category': 'finance_iq', 'task_difficulty': 'hard'}, headers=H(ta)).json()
    send(lock.functions.lock(g6['id'], 5 * 10**6, chain_now() + 86400 * 30), alice)
    c.post(f"/goals/{g6['id']}/confirm", json={}, headers=H(ta))
    t6 = c.post(f"/goals/{g6['id']}/task", json={'category': 'brain_teaser', 'difficulty': 'easy'}, headers=H(ta)).json()
    check(t6['category'] == 'finance_iq' and t6['difficulty'] == 'hard', 'a client-supplied category/difficulty is ignored: the goal\'s committed task type is used')

    # ───── parallel submissions cannot win extra attempts ─────
    from concurrent.futures import ThreadPoolExecutor
    judged_before = calls['judge']
    with ThreadPoolExecutor(8) as pool:
        codes = list(pool.map(lambda _: c.post(f"/goals/{g6['id']}/task/verify", data={'text': 'wrong'}, headers=H(ta)).status_code, range(8)))
    check(calls['judge'] - judged_before == t6['max_attempts'] and codes.count(200) == t6['max_attempts'], '8 parallel wrong answers -> exactly %d attempts judged, the rest refused (%s)' % (t6['max_attempts'], sorted(set(codes))))
    check(c.get(f"/goals/{g6['id']}/task", headers=H(ta)).json()['status'] == 'failed', 'task is failed once the attempts are used')
    check(c.post(f"/goals/{g6['id']}/task/verify", data={'text': '42'}, headers=H(ta)).status_code == 409, 'a failed task cannot be answered any more')
    t6b = c.post(f"/goals/{g6['id']}/task", headers=H(ta)).json()
    check(t6b['id'] != t6['id'] and t6b['status'] == 'pending', 'after failing, the user can get a new task (capped per goal)')

    # ───── the saved key cannot be replayed / used on another goal ─────
    g4 = c.post('/goals', json={**body, 'name': 'Another'}, headers=H(ta)).json()
    send(lock.functions.lock(g4['id'], 5 * 10**6, chain_now() + 86400 * 30), alice)
    c.post(f"/goals/{g4['id']}/confirm", json={}, headers=H(ta))
    check(c.post(f"/goals/{g4['id']}/release", headers=H(ta)).status_code == 403, "an earlier goal's pass does not unlock a different goal")

    # ───── tz-aware timestamps in responses ─────
    import re
    has_zone = lambda s: s is None or re.search(r'(Z|[+-]\d\d:?\d\d)$', s) is not None
    gl = c.get('/goals', headers=H(ta)).json()
    check(gl and all(has_zone(g[k]) for g in gl for k in ('created_at', 'unlock_at', 'liquidated_at')), 'every timestamp in a goal response carries a timezone (the UI never guesses local time)')
print('BACKEND E2E PASSED  (LLM calls: %d generate, %d judge)' % (calls['gen'], calls['judge']))
