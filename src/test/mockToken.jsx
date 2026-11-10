import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Coins, ExternalLink, Loader2, Search, Send, ShieldCheck } from 'lucide-react'
import { BrowserProvider, Contract, formatUnits, isAddress, parseUnits } from 'ethers'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApp } from '@/context/AppContext'
import { ADDRESSES, CHAIN_ID_HEX, DECIMALS, ERC20_ABI } from '@/lib/config'
import { shortAddr } from '@/lib/utils'

/**
 * Testnet-only tools for the MockToken contracts (USDT / NIM): balanceOf, approve, transfer, faucet.
 * Everything is in this one file. Remove the route to it before going to mainnet.
 */

// ERC20_ABI from config has approve / allowance / balanceOf / faucet; transfer is added here.
const TOKEN_ABI = [...ERC20_ABI, 'function transfer(address to,uint256 amount) returns (bool)']
const EXPLORER_TX = 'https://sepolia.etherscan.io/tx/'

const SPENDERS = [
  { key: 'LOCK', label: 'USDTlock contract' },
  { key: 'SWAP', label: 'Swap contract' },
  { key: 'CONDIFI', label: 'Condifi (send) contract' },
]

const errText = (e) => e?.shortMessage || e?.reason || e?.message || 'Something went wrong'

/** Signer on the wallet's current chain; throws a readable error if it is not Sepolia. */
async function getSigner() {
  if (!window.ethereum) throw new Error('No wallet provider found. Open the app inside Nimiq Pay.')
  const provider = new BrowserProvider(window.ethereum)
  const { chainId } = await provider.getNetwork()
  if (`0x${chainId.toString(16)}` !== CHAIN_ID_HEX) throw new Error(`Wallet is on chain ${chainId}. Switch it to Sepolia (${CHAIN_ID_HEX}).`)
  return provider.getSigner()
}

const tokenContract = async (token, signer) => new Contract(ADDRESSES[token], TOKEN_ABI, signer ?? (await getSigner()))

/** Parses a human amount ("12.5") into raw units for the token, or throws. */
function toRaw(amount, token) {
  try {
    const raw = parseUnits(String(amount).trim(), DECIMALS[token])
    if (raw <= 0n) throw new Error()
    return raw
  } catch {
    throw new Error(`Enter a valid amount (max ${DECIMALS[token]} decimals)`)
  }
}

const fmt = (raw, token) => Number(formatUnits(raw, DECIMALS[token])).toLocaleString(undefined, { maximumFractionDigits: DECIMALS[token] })

/** Shared busy / error / result state for a tab. */
function useAction() {
  const [s, setS] = useState({ busy: false, error: '', note: '', hash: '' })
  const run = async (fn) => {
    setS({ busy: true, error: '', note: '', hash: '' })
    try {
      const out = await fn()
      setS({ busy: false, error: '', note: out?.note || '', hash: out?.hash || '' })
    } catch (e) {
      setS({ busy: false, error: errText(e), note: '', hash: '' })
    }
  }
  return [s, run]
}

function Result({ s }) {
  if (!s.error && !s.note && !s.hash) return null
  return (
    <div className="space-y-1 break-words text-xs font-medium">
      {s.error && <p className="text-destructive">{s.error}</p>}
      {s.note && <p className="flex items-center gap-1.5 text-success"><Check size={13} /> {s.note}</p>}
      {s.hash && (
        <a href={`${EXPLORER_TX}${s.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-primary">
          {shortAddr(s.hash)} <ExternalLink size={11} />
        </a>
      )}
    </div>
  )
}

const Field = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
)

const AddressInput = ({ value, onChange, placeholder = '0x…' }) => (
  <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off" className="font-mono text-xs" />
)

const needAddress = (a, what) => { if (!isAddress(a.trim())) throw new Error(`${what} is not a valid 0x address`); return a.trim() }

export default function TokenTools({ onBack }) {
  const { wallet, balances } = useApp()
  const me = wallet?.evmAddress || ''
  const [token, setToken] = useState('USDT')

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center gap-2">
        {onBack && <button onClick={onBack} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted" aria-label="Back"><ArrowLeft size={20} /></button>}
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Test token tools</h2>
          <p className="text-xs text-muted-foreground">Sepolia mock tokens · testnet only</p>
        </div>
      </div>

      <Card className="space-y-3 rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <Label>Token</Label>
          <Select value={token} onChange={(e) => setToken(e.target.value)} className="w-28 font-bold"><option>USDT</option><option>NIM</option></Select>
        </div>
        <p className="break-all font-mono text-[11px] text-muted-foreground">{ADDRESSES[token]}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="muted">{DECIMALS[token]} decimals</Badge>
          <Badge variant={me ? 'default' : 'muted'}>{me ? `You ${shortAddr(me)}` : 'No EVM wallet'}</Badge>
        </div>
      </Card>

      <Card className="rounded-3xl p-5">
        <Tabs defaultValue="balance">
          <TabsList className="grid-cols-4">
            <TabsTrigger value="balance"><Search size={13} /> Balance</TabsTrigger>
            <TabsTrigger value="approve"><ShieldCheck size={13} /> Approve</TabsTrigger>
            <TabsTrigger value="transfer"><Send size={13} /> Send</TabsTrigger>
            <TabsTrigger value="faucet"><Coins size={13} /> Mint</TabsTrigger>
          </TabsList>

          <TabsContent value="balance"><BalanceTab token={token} me={me} /></TabsContent>
          <TabsContent value="approve"><ApproveTab token={token} me={me} /></TabsContent>
          <TabsContent value="transfer"><TransferTab token={token} me={me} onDone={balances.refresh} /></TabsContent>
          <TabsContent value="faucet"><FaucetTab token={token} me={me} onDone={balances.refresh} /></TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}

/* ───────── balanceOf(address) ───────── */
function BalanceTab({ token, me }) {
  const [addr, setAddr] = useState(me)
  const [result, setResult] = useState(null)
  const [s, run] = useAction()
  useEffect(() => { setAddr((a) => a || me) }, [me])
  useEffect(() => { setResult(null) }, [token])

  const check = () => run(async () => {
    const who = needAddress(addr, 'Address')
    const raw = await (await tokenContract(token)).balanceOf(who)
    setResult({ who, text: fmt(raw, token), raw: raw.toString() })
  })

  return (
    <div className="space-y-4">
      <Field label="Wallet address" hint="Any address. Defaults to your connected wallet."><AddressInput value={addr} onChange={setAddr} /></Field>
      <Button className="w-full" size="lg" disabled={s.busy || !addr} onClick={check}>
        {s.busy ? <><Loader2 size={17} className="animate-spin" /> Reading…</> : 'Check balance'}
      </Button>
      {result && (
        <div className="rounded-2xl bg-muted/60 p-4 text-center">
          <p className="font-mono text-2xl font-bold">{result.text} <span className="text-sm text-muted-foreground">{token}</span></p>
          <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{result.raw} raw · {shortAddr(result.who)}</p>
        </div>
      )}
      <Result s={s} />
    </div>
  )
}

/* ───────── approve(spender, amount) + allowance(owner, spender) ───────── */
function ApproveTab({ token, me }) {
  const [preset, setPreset] = useState('LOCK')
  const [custom, setCustom] = useState('')
  const [amount, setAmount] = useState('')
  const [allowance, setAllowance] = useState(null)
  const [s, run] = useAction()
  useEffect(() => { setAllowance(null) }, [token, preset, custom])

  const spender = preset === 'CUSTOM' ? custom : ADDRESSES[preset]

  const approve = () => run(async () => {
    const to = needAddress(spender, 'Spender')
    const raw = toRaw(amount, token)
    const c = await tokenContract(token)
    const tx = await c.approve(to, raw)
    await tx.wait()
    setAllowance(fmt(await c.allowance(me, to), token))
    return { note: `Approved ${amount} ${token}`, hash: tx.hash }
  })

  const checkAllowance = () => run(async () => {
    const to = needAddress(spender, 'Spender')
    const owner = needAddress(me, 'Your wallet')
    setAllowance(fmt(await (await tokenContract(token)).allowance(owner, to), token))
  })

  return (
    <div className="space-y-4">
      <Field label="Spender (who may pull your tokens)">
        <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
          {SPENDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          <option value="CUSTOM">Custom address…</option>
        </Select>
        {preset === 'CUSTOM'
          ? <AddressInput value={custom} onChange={setCustom} />
          : <p className="break-all font-mono text-[11px] text-muted-foreground">{ADDRESSES[preset]}</p>}
      </Field>
      <Field label={`Amount (${token})`} hint="Human units, e.g. 100 = 100 USDT. The app converts to raw units.">
        <Input type="number" inputMode="decimal" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono text-lg font-bold" />
      </Field>
      <Button className="w-full" size="lg" disabled={s.busy || !amount || !spender} onClick={approve}>
        {s.busy ? <><Loader2 size={17} className="animate-spin" /> Confirm in wallet…</> : <><ShieldCheck size={16} /> Approve</>}
      </Button>
      <Button className="w-full" variant="soft" disabled={s.busy || !spender} onClick={checkAllowance}>Check current allowance</Button>
      {allowance != null && <p className="text-center text-xs font-semibold">Allowance: <span className="font-mono">{allowance} {token}</span></p>}
      <Result s={s} />
    </div>
  )
}

/* ───────── transfer(to, amount) ───────── */
function TransferTab({ token, me, onDone }) {
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [s, run] = useAction()

  const send = () => run(async () => {
    const dest = needAddress(to, 'Recipient')
    const raw = toRaw(amount, token)
    const c = await tokenContract(token)
    const have = await c.balanceOf(me)
    if (raw > have) throw new Error(`Insufficient balance (you have ${fmt(have, token)} ${token})`)
    const tx = await c.transfer(dest, raw)
    await tx.wait()
    onDone?.()
    return { note: `Sent ${amount} ${token} to ${shortAddr(dest)}`, hash: tx.hash }
  })

  return (
    <div className="space-y-4">
      <Field label="Recipient address" hint="Also use this to fund the swap pool: paste the Swap contract address."><AddressInput value={to} onChange={setTo} /></Field>
      <Field label={`Amount (${token})`}>
        <Input type="number" inputMode="decimal" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono text-lg font-bold" />
      </Field>
      <Button className="w-full" size="lg" disabled={s.busy || !to || !amount} onClick={send}>
        {s.busy ? <><Loader2 size={17} className="animate-spin" /> Confirm in wallet…</> : <><Send size={16} /> Transfer</>}
      </Button>
      <Result s={s} />
    </div>
  )
}

/* ───────── faucet(amount): mints to the connected wallet ───────── */
function FaucetTab({ token, me, onDone }) {
  const [amount, setAmount] = useState('1000')
  const [also, setAlso] = useState('')
  const [s, run] = useAction()

  const mint = () => run(async () => {
    const raw = toRaw(amount, token)
    const dest = also.trim() ? needAddress(also, 'Recipient') : null
    const c = await tokenContract(token)
    const tx = await c.faucet(raw) // the contract mints to msg.sender (you); it cannot mint to another address
    await tx.wait()
    let hash = tx.hash
    let note = `Minted ${amount} ${token} to your wallet`
    if (dest && dest.toLowerCase() !== me.toLowerCase()) {
      const t2 = await c.transfer(dest, raw)
      await t2.wait()
      hash = t2.hash
      note += `, then sent it to ${shortAddr(dest)}`
    }
    onDone?.()
    return { note, hash }
  })

  return (
    <div className="space-y-4">
      <Field label={`Amount to mint (${token})`} hint="Free test tokens. faucet() mints to the wallet that calls it.">
        <Input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono text-lg font-bold" />
      </Field>
      <Field label="Also send to another address (optional)" hint="Mints to you first, then makes a second transfer to this address. Two wallet confirmations.">
        <AddressInput value={also} onChange={setAlso} placeholder="0x… (leave empty to keep it)" />
      </Field>
      <Button className="w-full" size="lg" disabled={s.busy || !amount} onClick={mint}>
        {s.busy ? <><Loader2 size={17} className="animate-spin" /> Confirm in wallet…</> : <><Coins size={16} /> Add {token}</>}
      </Button>
      <Result s={s} />
    </div>
  )
}