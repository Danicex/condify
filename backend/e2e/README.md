# End-to-end tests (no testnet needed)

These deploy the real `USDTlock` contract on a local in-memory EVM and drive the real FastAPI app against it
(AI calls are stubbed). They prove that the contract, the Python signing code and the API agree with each other.

```bash
cd backend/e2e
npm install                 # solc + OpenZeppelin, only used to compile
npm run compile             # writes compiled.json from ../../contracts
pip install "web3[tester]"  # local EVM (on top of ../requirements.txt)
python test_contract.py     # contract rules + the signature the backend produces
python test_flow.py         # sign-in, goals, AI task, relayer release, retries, tenant isolation
```
Quick API-only check (no chain, no AI): `cd backend && python test_smoke.py`.
