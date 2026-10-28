import { useEffect, useId, useState } from 'react'
import { Check, Code2, Copy, LoaderCircle, RefreshCw } from 'lucide-react'
import { api, type RedashQuery, type RedashSqlSource as SqlSource } from '@/api'
import { Button } from '@/components/ui/button'

export default function RedashSqlSource({ query }: { query: RedashQuery }) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<SqlSource>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setSource(undefined)
    setError('')
    setCopied(false)
    api.getRedashQuerySql(query.id, controller.signal)
      .then(value => { if (!controller.signal.aborted) setSource(value) })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load SQL.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open, query.id, reload])

  const copy = async () => {
    if (!source) return
    try { await navigator.clipboard.writeText(source.sql); setCopied(true); setError('') }
    catch { setError('Could not copy SQL. Select the query text to copy it.') }
  }

  return <div className="mt-2 min-w-0">
    <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={panelId}
      aria-label={`${open ? 'Hide' : 'View'} SQL for ${query.name}`}
      onClick={() => { setOpen(value => !value); setSource(undefined); setError(''); setCopied(false) }}>
      <Code2 className="size-4" />{open ? 'Hide SQL' : 'View SQL'}
    </Button>
    {open ? <section id={panelId} aria-label={`SQL source for ${query.name}`} className="mt-3 min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">SQL · Read only</p>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon" title="Reload SQL" aria-label="Reload SQL"
            disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" title={copied ? 'SQL copied' : 'Copy SQL'}
            aria-label={copied ? 'SQL copied' : 'Copy SQL'} disabled={!source || loading} onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>
      {loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />Loading SQL...
      </p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {source ? <>
        {source.parameters.length ? <p className="break-words text-xs text-muted-foreground">
          Parameters: <code>{source.parameters.join(', ')}</code>
        </p> : null}
        <pre tabIndex={0} aria-label="Saved SQL query" className="max-h-[32rem] max-w-full overflow-auto rounded-md border bg-muted/30 p-4 text-xs leading-5">
          <code>{source.sql}</code>
        </pre>
      </> : null}
    </section> : null}
  </div>
}
