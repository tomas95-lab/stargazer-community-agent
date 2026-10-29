import { useEffect, useRef, useState } from 'react'
import { Database, LoaderCircle, Play } from 'lucide-react'
import { api, type DemoDiagnosticProfile, type DemoDiagnosticResult } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const QUESTIONS = ['I am EQ. Why am I not seeing tasks?', 'What is my quality score?', 'Could I have another chance?']

export default function DemoDiagnostics() {
  const [profiles, setProfiles] = useState<DemoDiagnosticProfile[]>([])
  const [username, setUsername] = useState('')
  const [message, setMessage] = useState(QUESTIONS[0])
  const [result, setResult] = useState<DemoDiagnosticResult>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    api.getDemoDiagnostics().then(data => {
      if (!mounted.current) return
      setProfiles(data.profiles); setUsername(data.profiles[0]?.username || '')
    }).catch(err => { if (mounted.current) setError(err.message) })
      .finally(() => { if (mounted.current) setLoading(false) })
    return () => { mounted.current = false }
  }, [])
  async function run() {
    setBusy(true); setError(''); setResult(undefined)
    try {
      const next = await api.previewDemoDiagnostic(username, message)
      if (mounted.current) setResult(next)
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Demo preview failed.') }
    finally { if (mounted.current) setBusy(false) }
  }
  const evidence = result?.evidence
  return <div className="space-y-6 px-4 lg:px-6">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2"><Database className="size-5" /><h1 className="text-2xl font-semibold">Contributor diagnostics</h1><Badge variant="secondary">Demo</Badge></div>
      <p className="text-sm text-muted-foreground">Aurora Community Demo · Fictional contributors and simulated drafts. No Redash connection or AI calls.</p>
    </header>
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
    <section className="border-y py-5">
      <form className="grid max-w-3xl gap-4" onSubmit={event => { event.preventDefault(); void run() }}>
        <label className="grid gap-2 text-sm font-medium" htmlFor="demo-contributor">Fictional contributor
          <select id="demo-contributor" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm font-normal" disabled={loading || busy} required value={username} onChange={event => { setUsername(event.target.value); setResult(undefined) }}>
            {loading && <option value="">Loading contributors...</option>}
            {profiles.map(profile => <option key={profile.id} value={profile.username}>{profile.name} · {profile.scenario}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium" htmlFor="demo-message">Contributor message
          <Textarea id="demo-message" value={message} rows={3} maxLength={3000} required disabled={busy} onChange={event => { setMessage(event.target.value); setResult(undefined) }} className="font-normal" />
        </label>
        <div className="flex flex-wrap gap-2">{QUESTIONS.map(question => <Button key={question} type="button" variant="outline" size="sm" disabled={busy} className="h-auto min-h-8 whitespace-normal text-left" onClick={() => { setMessage(question); setResult(undefined) }}>{question}</Button>)}</div>
        <Button type="submit" disabled={loading || busy || !username || !message.trim()} className="justify-self-start">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}{busy ? 'Simulating...' : 'Run simulated diagnostic'}</Button>
      </form>
    </section>
    {result && evidence && <div aria-live="polite" className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Contributor draft</h2><Badge variant="outline">Simulated · Not sent</Badge></div>
        <p className="whitespace-pre-wrap break-words text-sm leading-7">{result.draft.reply}</p>
        <div className="border-t pt-4"><h3 className="text-xs font-medium uppercase text-muted-foreground">QM explanation</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{result.draft.reason}</p></div>
      </section>
      <section className="min-w-0 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <h2 className="font-semibold">Simulated evidence</h2>
        <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 text-sm">
          {[
            ['Contributor', evidence.contributor], ['Account', evidence.accountStatus],
            ['Project queue', evidence.projectHasTasks ? 'Tasks available' : 'Empty'],
            ['Active throttle', evidence.activeThrottle ? 'Yes' : 'No'],
            ['Task limit', evidence.taskLimit === null ? 'Not applicable' : `${evidence.taskLimit} / ${evidence.windowHours}h`],
            ['Overall QMS', evidence.overallQms], ['Recent QMS', evidence.recentQms],
            ['Recent scores', evidence.recentScores.join(', ')], ['Recent PDR', `${evidence.pdrPercent}%`],
            ...(evidence.resetsAt ? [['Limit resets', new Date(evidence.resetsAt).toLocaleString()]] : []),
          ].map(([label, value]) => <div key={label} className="contents"><dt className="border-b py-3 text-muted-foreground">{label}</dt><dd className="break-words border-b py-3 font-medium">{value}</dd></div>)}
        </dl>
      </section>
    </div>}
  </div>
}
