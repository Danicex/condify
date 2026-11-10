// Compiles MockToken + USDTlock with solc-js (no network needed beyond `npm install`) into compiled.json.
const solc = require('solc'); const fs = require('fs'); const path = require('path');
const contracts = path.join(__dirname, '..', '..', 'contracts');
const sources = {};
for (const f of ['MockToken.sol', 'USDTlock.sol']) sources[f] = { content: fs.readFileSync(path.join(contracts, f), 'utf8') };
function findImports(p) {
  const full = path.join(__dirname, 'node_modules', p);
  return fs.existsSync(full) ? { contents: fs.readFileSync(full, 'utf8') } : { error: 'not found ' + p };
}
const out = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources,
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
}), { import: findImports }));
let bad = false;
for (const e of out.errors || []) { console.log(e.severity + ': ' + e.formattedMessage.split('\n')[0]); if (e.severity === 'error') bad = true; }
if (bad) process.exit(1);
const res = {};
for (const f of Object.keys(out.contracts)) for (const c of Object.keys(out.contracts[f])) {
  if (['MockToken', 'USDTlock'].includes(c)) res[c] = { abi: out.contracts[f][c].abi, bytecode: '0x' + out.contracts[f][c].evm.bytecode.object };
}
fs.writeFileSync(path.join(__dirname, 'compiled.json'), JSON.stringify(res));
console.log('compiled:', Object.keys(res).join(', '));
