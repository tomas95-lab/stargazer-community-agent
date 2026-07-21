import { useCallback, useEffect, useMemo, useState } from "react"
import { diffLines } from "diff"
import { CheckCircle2, FileClock, FileText, History, LoaderCircle, RotateCcw } from "lucide-react"

import { api, type GuidelineVersion, type GuidelineVersionSummary } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePlatform } from "@/platform"

function formatDate(value: string): string {
  if (!value) return "Unknown date"
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export default function GuidelinesHistory() {
  const { currentProject, refreshProjects } = usePlatform()
  const [versions, setVersions] = useState<GuidelineVersionSummary[]>([])
  const [selected, setSelected] = useState<GuidelineVersion | null>(null)
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState("")
  const canRestore = currentProject?.role === "owner" || currentProject?.role === "admin"

  const load = useCallback(async () => {
    if (!currentProject) return
    setLoading(true)
    setError("")
    try {
      const result = await api.getGuidelineVersions(currentProject.id)
      setVersions(result.versions)
      if (result.versions[0]) {
        const detail = await api.getGuidelineVersion(currentProject.id, result.versions[0].id)
        setSelected(detail.version)
      } else {
        setSelected(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => { void load() }, [load])

  async function selectVersion(version: GuidelineVersionSummary) {
    if (!currentProject) return
    setError("")
    try {
      setSelected((await api.getGuidelineVersion(currentProject.id, version.id)).version)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function restore() {
    if (!currentProject || !selected || !canRestore) return
    if (!window.confirm(`Restore the guidelines saved on ${formatDate(selected.createdAt)}? This will replace the current project guidelines for every QM.`)) return
    setRestoring(true)
    setError("")
    try {
      await api.restoreGuidelineVersion(currentProject.id, selected.id)
      await refreshProjects()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRestoring(false)
    }
  }

  const changes = useMemo(() => diffLines(selected?.content || "", currentProject?.projectGuidelines || ""), [selected, currentProject])
  const added = changes.filter((part) => part.added).reduce((sum, part) => sum + (part.count || 0), 0)
  const removed = changes.filter((part) => part.removed).reduce((sum, part) => sum + (part.count || 0), 0)

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><FileClock className="size-5" /><h2 className="text-2xl font-semibold">Guidelines history</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">Review every saved source, author, and change before restoring project context.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><History className="size-4" />Refresh</Button>
      </div>

      {error ? <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div> : null}

      <div className="grid min-h-[560px] overflow-hidden rounded-lg border bg-background lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="border-b lg:border-b-0 lg:border-r">
          <div className="border-b bg-muted/40 px-4 py-3">
            <p className="text-sm font-semibold">Saved versions</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{versions.length} snapshots</p>
          </div>
          <div className="max-h-[640px] divide-y overflow-y-auto">
            {loading && !versions.length ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading history</div>
            ) : versions.length ? versions.map((version, index) => (
              <button
                key={version.id}
                type="button"
                onClick={() => void selectVersion(version)}
                className={`w-full p-4 text-left transition-colors hover:bg-muted/50 ${selected?.id === version.id ? "bg-accent/70" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{version.changeSummary || "Guidelines update"}</p>
                  {index === 0 ? <Badge variant="secondary">Latest</Badge> : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{formatDate(version.createdAt)}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{version.authorName || version.authorEmail || "Unknown author"}</p>
                <div className="mt-2 flex gap-2 text-xs text-muted-foreground"><span>{version.characters.toLocaleString()} chars</span>{version.sourceFileName ? <span className="truncate">{version.sourceFileName}</span> : null}</div>
              </button>
            )) : (
              <div className="p-6 text-center"><FileText className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No versions yet</p><p className="mt-1 text-xs text-muted-foreground">The next saved guidelines change will create one.</p></div>
            )}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Selected version compared with current</p>
              <div className="mt-1 flex gap-3 text-xs"><span className="text-emerald-700">+{added} lines</span><span className="text-red-700">-{removed} lines</span></div>
            </div>
            {selected && canRestore ? (
              <Button variant="outline" onClick={() => void restore()} disabled={restoring || (added === 0 && removed === 0)}>
                {restoring ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Restore this version
              </Button>
            ) : null}
          </div>

          {selected ? (
            <div className="max-h-[640px] overflow-auto bg-muted/20 p-5 font-mono text-xs leading-5">
              {changes.map((part, index) => (
                <pre key={`${index}-${part.value.slice(0, 20)}`} className={`whitespace-pre-wrap border-l-2 px-3 py-0.5 ${part.added ? "border-emerald-500 bg-emerald-50 text-emerald-950" : part.removed ? "border-red-400 bg-red-50 text-red-950 line-through" : "border-transparent text-muted-foreground"}`}>
                  {part.value}
                </pre>
              ))}
            </div>
          ) : (
            <div className="flex min-h-96 flex-col items-center justify-center p-8 text-center"><CheckCircle2 className="size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Save project guidelines to start version history</p></div>
          )}
        </section>
      </div>
    </div>
  )
}
