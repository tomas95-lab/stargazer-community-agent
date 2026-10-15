import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Play, Trash2 } from 'lucide-react'
import { api, type RedashQuery, type RedashRun, type DiagnosticPreview } from '@/api'
import { useAuth } from '@/auth'
import { usePlatform } from '@/platform'
import { Checkbox } from '@/components/ui/checkbox'
import { canUseRedash } from '@/lib/redash-access'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export default function RedashDebugger() {
  const { user } = useAuth()
  const { currentProject } = usePlatform()
  const allowed = canUseRedash(user)
  const [connected, setConnected] = useState(false)
  const [queries, setQueries] = useState<RedashQuery[]>([])
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('existing')
  const [name, setName] = useState('')
  const [queryId, setQueryId] = useState('')
  const [sql, setSql] = useState('')
  const [parameters, setParameters] = useState('')
  const [selected, setSelected] = useState('')
  const [result, setResult] = useState<RedashRun['result']>()
  const [status, setStatus] = useState('')
  const [testUsername, setTestUsername] = useState('')
  const [testMessage, setTestMessage] = useState('I am EQ')
  const [testResult, setTestResult] = useState<DiagnosticPreview['draft']>()
  const [testStatus, setTestStatus] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    if (allowed) api.getRedash().then(data => { if (mounted.current) { setConnected(data.connected); setQueries(data.queries) } }).catch(err => { if (mounted.current) setError(err.message) })
    return () => { mounted.current = false }
  }, [allowed])
  if (!allowed) return <Navigate to="/" replace />
  const diagnosticQueries = queries.filter(query => query.diagnosticProjectId === currentProject?.projectKey)
  const unifiedQuery = diagnosticQueries.find(query => query.diagnosticRole === 'unified' && query.diagnosticVersion === 3)
  const diagnosticsReady = Boolean(unifiedQuery)
  const diagnosticsEnabled = unifiedQuery?.diagnosticEnabled === true
  const refresh = async () => { const data = await api.getRedash(); setConnected(data.connected); setQueries(data.queries) }
  const perform = async (work: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await work() } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Request failed.') }
    finally { if (mounted.current) setBusy(false) }
  }
  const testDraft = async () => {
    setTestResult(undefined)
    setTestStatus('Checking contributor identity...')
    try {
      let progress = await api.previewRedashDraft(testUsername, testMessage)
      for (let n = 0; progress.status === 'pending' && progress.token && n < 100 && mounted.current; n++) {
        setTestStatus(progress.stage === 'identity' ? 'Checking contributor identity...' : 'Checking access, tasks, throttle and performance...')
        await new Promise(resolve => setTimeout(resolve, 2500))
        if (!mounted.current) return
        progress = await api.pollRedashDraft(progress.token)
      }
      if (!mounted.current) return
      if (!progress.draft) throw new Error('The diagnostic did not finish in time. Nothing was sent.')
      setTestResult(progress.draft)
    } finally { if (mounted.current) setTestStatus('') }
  }
  const run = async () => {
    setResult(undefined); setStatus('Running diagnostic...')
    try {
      let values: Record<string, unknown> = {}
      if (parameters.trim()) {
        try { values = JSON.parse(parameters) } catch { throw new Error('Parameters must be valid JSON, for example {"project_id":"123"}.') }
        if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Parameters must be a JSON object.')
      }
      let response = await api.runRedashQuery(selected, values)
      const job = response.job
      for (let attempt = 0; job && !response.result && attempt < 30 && mounted.current; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        if (!mounted.current) return
        response = await api.pollRedashJob(job)
      }
      if (!mounted.current) return
      if (!response.result) throw new Error('Query is still running. Check its status in Redash before rerunning.')
      if (!Array.isArray(response.result.rows) || !Array.isArray(response.result.columns)) throw new Error('The server returned an invalid table. Refresh the page and run the query again.')
      setResult(response.result)
      setStatus(`${response.result.rows.length} rows returned`)
    } finally { if (mounted.current) setStatus('') }
  }
  return <div className="space-y-8 px-4 lg:px-6">
    <header><h1 className="text-2xl font-semibold">Contributor diagnostics</h1><p className="mt-1 text-sm text-muted-foreground">Private Redash workspace for Tomas Ruiz</p></header>
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
    <section className="space-y-3 border-b pb-6">
      <h2 className="font-semibold">Experimental account diagnostics</h2>
      <p className="text-sm text-muted-foreground">Account diagnostics for your connection. Queries use warehouse snapshots, which may lag live account state.</p>
      <Button variant="outline" disabled={busy || !connected} onClick={() => void perform(async () => { await api.prepareRedashDiagnostics(); await refresh() })}>{diagnosticsReady ? 'Update unified query' : 'Prepare unified query'}</Button>
      <label className="flex items-center gap-3 text-sm"><Checkbox checked={diagnosticsEnabled} disabled={busy || !diagnosticsReady || !connected} onCheckedChange={enabled => void perform(async () => { await api.configureRedashDiagnostics(enabled === true); await refresh() })} />Enable account diagnostics for {currentProject?.projectName}</label>
      <label className="flex items-center gap-3 text-sm"><Checkbox checked={diagnosticsEnabled && unifiedQuery?.diagnosticAutoReply === true} disabled={busy || !diagnosticsEnabled || !connected} onCheckedChange={enabled => void perform(async () => { await api.configureRedashDiagnostics(true, enabled === true); await refresh() })} />Automatically reply to confirmed cases using my connection</label>
      <p className="text-xs text-muted-foreground">One query checks access, task availability, throttles and quality. Drafts can include scores and confirmed limits. Older queries are retained for rollback.</p>
    </section>
    <section className="space-y-4 border-b pb-6">
      <h2 className="font-semibold">Test a contributor draft</h2>
      <p className="text-sm text-muted-foreground">Project: {currentProject?.projectName}. This test does not enable automation or send a message.</p>
      <form className="grid max-w-3xl gap-3" onSubmit={event => { event.preventDefault(); void perform(testDraft) }}>
        <label className="text-sm">Community username<Input className="mt-1" placeholder="latam.coder779" value={testUsername} onChange={event => { setTestUsername(event.target.value); setTestResult(undefined) }} required disabled={busy} /></label>
        <label className="text-sm">Contributor message<Textarea className="mt-1" value={testMessage} onChange={event => { setTestMessage(event.target.value); setTestResult(undefined) }} maxLength={3000} required disabled={busy} /></label>
        <Button className="justify-self-start" disabled={busy || !connected || !diagnosticsReady}><Play className="size-4" />{testStatus ? 'Generating draft...' : 'Generate test draft'}</Button>
      </form>
      {!diagnosticsReady && <p className="text-xs text-muted-foreground">Prepare the diagnostic queries above before testing. You can leave experimental drafts disabled.</p>}
      {testStatus && <p role="status" className="text-sm text-muted-foreground">{testStatus}</p>}
      {testResult && <div className="max-w-3xl space-y-2 rounded-md border p-4"><p className="text-xs font-medium text-muted-foreground">DRAFT ONLY · QM REVIEW REQUIRED</p><p className="whitespace-pre-wrap text-sm leading-6">{testResult.reply}</p><div className="border-t pt-3"><p className="text-xs font-medium">Diagnostic reason · QM only</p><p className="mt-1 text-sm text-muted-foreground">{testResult.reason}</p></div></div>}
    </section>
    <section className="space-y-4 border-b pb-6">
      <h2 className="font-semibold">Redash connection</h2>
      <p className="text-sm text-muted-foreground">redash.scale.com · {connected ? 'Connected' : 'Not connected'}</p>
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void perform(async () => { await api.connectRedash(key); setKey(''); await refresh() }) }}>
        <Input className="max-w-md" type="password" aria-label="Redash User API key" placeholder="Redash User API key" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} />
        <Button disabled={busy || !key.trim()}>{connected ? 'Replace key' : 'Connect'}</Button>
        {connected && <Button type="button" variant="outline" disabled={busy} onClick={() => void perform(async () => { await api.disconnectRedash(); setResult(undefined); await refresh() })}>Disconnect</Button>}
      </form>
      <p className="text-xs text-muted-foreground">Find your User API key in your Redash profile. It is stored encrypted and never returned to this page.</p>
    </section>
    <section className="space-y-4 border-b pb-6">
      <h2 className="font-semibold">Diagnostic queries</h2>
      <form className="grid max-w-3xl gap-3" onSubmit={event => { event.preventDefault(); void perform(async () => {
        await api.saveRedashQuery({ name, ...(mode === 'existing' ? { queryId } : { sql }) }); setName(''); setSql(''); setQueryId(''); await refresh()
      }) }}>
        <label className="text-sm">Query source<select className="mt-1 block h-9 w-full rounded-md border bg-background px-3" value={mode} onChange={event => setMode(event.target.value)}><option value="existing">Existing Redash query</option><option value="new">Create SQL query in Redash</option></select></label>
        <Input aria-label="Query name" placeholder="Query name (e.g. EQ diagnosis)" required value={name} onChange={event => setName(event.target.value)} />
        {mode === 'existing' ? <Input aria-label="Redash query ID" placeholder="Redash query ID" required value={queryId} onChange={event => setQueryId(event.target.value)} /> : <>
          <Textarea aria-label="SQL query" placeholder="Enter your SQL query" rows={8} required value={sql} onChange={event => setSql(event.target.value)} />
          <p className="text-xs text-muted-foreground">Uses your last-used Redash database automatically. SQL runs with your Redash permissions.</p>
        </>}
        <Button className="justify-self-start" disabled={busy || !connected}>Save query</Button>
      </form>
      <ul className="divide-y">{queries.map(query => <li key={query.id} className="flex items-center justify-between gap-3 py-3"><div><span className="text-sm font-medium">{query.name}</span><a className="ml-3 text-xs text-muted-foreground underline" href={`https://redash.scale.com/queries/${query.queryId}`} target="_blank" rel="noreferrer">Query {query.queryId}</a></div><Button variant="ghost" size="icon" title="Remove query from workspace" disabled={busy} onClick={() => void perform(async () => { await api.deleteRedashQuery(query.id); if (selected === query.id) setSelected(''); await refresh() })}><Trash2 className="size-4" /></Button></li>)}</ul>
    </section>
    <section className="space-y-4">
      <h2 className="font-semibold">Run query</h2>
      <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); void perform(run) }}>
        <select aria-label="Diagnostic query" className="h-9 max-w-full rounded-md border bg-background px-3 text-sm" value={selected} onChange={event => { setSelected(event.target.value); setResult(undefined); setParameters('') }} required><option value="">Select query</option>{queries.map(query => <option key={query.id} value={query.id}>{query.name}</option>)}</select>
        <details className="w-full"><summary className="cursor-pointer text-sm text-muted-foreground">Optional parameter overrides</summary><Textarea className="mt-2" aria-label="Optional query parameters" placeholder='{"project_id":"123"}' value={parameters} onChange={event => setParameters(event.target.value)} /></details>
        <Button disabled={busy || !connected || !selected}><Play className="size-4" />Run diagnostic</Button>
      </form>
      {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
      {result && <div><p className="mb-3 text-sm text-muted-foreground">{result.rows.length} rows · {result.retrieved_at || 'Fresh execution'}</p><div className="max-h-[32rem] overflow-auto rounded-md border"><table className="w-full text-left text-sm"><thead><tr>{result.columns.map(column => <th key={column.name} className="whitespace-nowrap border-b p-3">{column.name}</th>)}</tr></thead><tbody>{result.rows.map((row, index) => <tr key={index}>{result.columns.map(column => <td key={column.name} className="max-w-md whitespace-pre-wrap break-words border-b p-3">{row[column.name] == null ? '-' : typeof row[column.name] === 'object' ? JSON.stringify(row[column.name]) : String(row[column.name])}</td>)}</tr>)}</tbody></table></div>{!result.rows.length && <p className="py-3 text-sm">No matching records.</p>}</div>}
    </section>
  </div>
}
