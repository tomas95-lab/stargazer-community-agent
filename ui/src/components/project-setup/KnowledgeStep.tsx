import type { ChangeEvent, DragEvent, RefObject } from "react"
import { CheckCircle2, CircleAlert, Download, FileText, FileUp, LoaderCircle, RefreshCw, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ChannelGuidelineForm, GuidelinesFileStatus, ProjectFormState, UpdateProjectField } from "./types"

interface KnowledgeStepProps {
  form: ProjectFormState
  update: UpdateProjectField
  guidelinesFile: GuidelinesFileStatus | null
  extractingGuidelines: boolean
  draggingGuidelines: boolean
  guidelinesInputRef: RefObject<HTMLInputElement | null>
  onDraggingChange: (dragging: boolean) => void
  onDropFile: (event: DragEvent<HTMLDivElement>) => void
  onReadFile: (event: ChangeEvent<HTMLInputElement>) => void
  onClearFile: () => void
  isCsm?: boolean
  importingCommunityGuidelines?: boolean
  onImportCommunityGuidelines?: () => void
  managedChannels?: Array<{ id: string; title: string }>
  syncingChannelId?: string
  syncingAllChannels?: boolean
  onSyncChannel?: (channelId: string) => void
  onSyncAllChannels?: () => void
}

function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function KnowledgeStep({
  form,
  update,
  guidelinesFile,
  extractingGuidelines,
  draggingGuidelines,
  guidelinesInputRef,
  onDraggingChange,
  onDropFile,
  onReadFile,
  onClearFile,
  isCsm = false,
  importingCommunityGuidelines = false,
  onImportCommunityGuidelines,
  managedChannels = [],
  syncingChannelId = "",
  syncingAllChannels = false,
  onSyncChannel,
  onSyncAllChannels,
}: KnowledgeStepProps) {
  const channelGuideline = (channelId: string): ChannelGuidelineForm | undefined => (
    form.channelGuidelines.find((item) => item.channelId === channelId)
  )
  const updateChannelSource = (channelId: string, channelTitle: string, sourceUrl: string) => {
    const existing = channelGuideline(channelId)
    const next: ChannelGuidelineForm = existing
      ? {
          ...existing,
          channelTitle,
          sourceUrl,
          ...(sourceUrl.trim() !== existing.sourceUrl.trim() ? {
            sourceTitle: "",
            sourceAuthor: "",
            text: "",
            characters: 0,
            syncedAt: "",
          } : {}),
        }
      : {
          channelId,
          channelTitle,
          sourceUrl,
          sourceTitle: "",
          sourceAuthor: "",
          text: "",
          characters: 0,
          syncedAt: "",
        }
    update("channelGuidelines", [
      ...form.channelGuidelines.filter((item) => item.channelId !== channelId),
      next,
    ])
  }
  const removeChannelGuideline = (channelId: string) => {
    update("channelGuidelines", form.channelGuidelines.filter((item) => item.channelId !== channelId))
  }
  const readyChannels = managedChannels.filter((channel) => Boolean(channelGuideline(channel.id)?.text.trim())).length

  return (
    <div className="grid gap-5">
      {isCsm ? (
        <section className="overflow-hidden rounded-md border">
          <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="font-medium">Channel instructions</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Assign each channel its own Community source. The agent automatically uses the matching instructions.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-muted-foreground">{readyChannels}/{managedChannels.length} ready</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onSyncAllChannels}
                disabled={syncingAllChannels || !form.channelGuidelines.some((item) => item.sourceUrl.trim())}
              >
                {syncingAllChannels ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                Sync all
              </Button>
            </div>
          </div>
          <div className="divide-y">
            {managedChannels.map((channel) => {
              const guideline = channelGuideline(channel.id)
              const ready = Boolean(guideline?.text.trim())
              const syncing = syncingChannelId === channel.id
              return (
                <details key={channel.id} className="group" open={managedChannels.length <= 3 && !ready}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-muted/30 sm:px-5">
                    {ready
                      ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                      : <CircleAlert className="size-4 shrink-0 text-amber-600" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{channel.title}</span>
                    <span className="font-mono text-xs text-muted-foreground">{channel.id}</span>
                    <span className={`text-xs font-medium ${ready ? "text-emerald-700" : "text-amber-700"}`}>
                      {ready ? "Ready" : guideline?.sourceUrl ? "Sync required" : "Missing"}
                    </span>
                  </summary>
                  <div className="border-t bg-muted/10 px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="url"
                        aria-label={`Instructions URL for ${channel.title}`}
                        value={guideline?.sourceUrl || ""}
                        onChange={(event) => updateChannelSource(channel.id, channel.title, event.target.value)}
                        placeholder="https://community.outlier.ai/t/instructions/12345"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="sm:min-w-28"
                        onClick={() => onSyncChannel?.(channel.id)}
                        disabled={syncingAllChannels || syncing || !guideline?.sourceUrl.trim()}
                      >
                        {syncing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                        Sync
                      </Button>
                      {guideline ? (
                        <Button type="button" size="icon" variant="ghost" onClick={() => removeChannelGuideline(channel.id)} title={`Remove instructions for ${channel.title}`}>
                          <X />
                        </Button>
                      ) : null}
                    </div>
                    {ready ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {guideline?.sourceTitle || "Community instructions"}, {guideline?.characters.toLocaleString()} characters
                        {guideline?.sourceAuthor ? `, by ${guideline.sourceAuthor}` : ""}
                        {guideline?.syncedAt ? `, synced ${new Date(guideline.syncedAt).toLocaleString()}` : ""}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Messages from this channel will use only global context until these instructions are synced.</p>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      ) : null}

      {isCsm ? (
        <details className="rounded-md border bg-muted/10">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium sm:px-5">Global fallback instructions</summary>
          <div className="border-t p-4 sm:p-5">
            <p className="mb-3 text-sm leading-6 text-muted-foreground">
              Optional shared rules used after the channel-specific source. They never replace a configured channel guideline.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="guidelinesSourceUrl"
                type="url"
                value={form.guidelinesSourceUrl}
                onChange={(event) => update("guidelinesSourceUrl", event.target.value)}
                placeholder="https://community.outlier.ai/t/general-instructions/12345"
              />
              <Button
                type="button"
                variant="outline"
                className="sm:min-w-32"
                onClick={onImportCommunityGuidelines}
                disabled={importingCommunityGuidelines || !form.guidelinesSourceUrl.trim()}
              >
                {importingCommunityGuidelines ? <LoaderCircle className="animate-spin" /> : <Download />}
                Import
              </Button>
            </div>
          </div>
        </details>
      ) : null}

      <div
        className={cn(
          "flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-5 py-6 text-center transition-colors",
          draggingGuidelines ? "border-primary bg-accent/40" : "bg-muted/25",
        )}
        onDragEnter={(event) => { event.preventDefault(); onDraggingChange(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDraggingChange(false)
        }}
        onDrop={onDropFile}
      >
        {extractingGuidelines
          ? <LoaderCircle className="size-8 animate-spin text-primary" />
          : <FileUp className="size-8 text-primary" />}
        <div>
          <p className="font-medium">{extractingGuidelines ? "Reading your PDF" : isCsm ? "Or add a supporting PDF" : "Drop the project guidelines here"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Processed privately in your browser. Tables and page context are preserved. PDF up to 12 MB.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => guidelinesInputRef.current?.click()} disabled={extractingGuidelines}>
          <Upload />
          {guidelinesFile || form.projectGuidelines ? "Replace PDF" : "Choose PDF"}
        </Button>
        <input
          ref={guidelinesInputRef}
          id="projectGuidelinesPdf"
          className="sr-only"
          type="file"
          accept=".pdf,application/pdf"
          onChange={onReadFile}
          disabled={extractingGuidelines}
        />
      </div>

      {guidelinesFile ? (
        <div className="flex min-w-0 items-center gap-3 rounded-md border px-3 py-3">
          <FileText className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{guidelinesFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(guidelinesFile.size)}, {guidelinesFile.pages} pages, {guidelinesFile.tables} tables, {guidelinesFile.chunks} sections
            </p>
            {guidelinesFile.warnings.length ? (
              <p className="mt-1 text-xs text-warning">{guidelinesFile.warnings[0]}</p>
            ) : null}
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClearFile} title="Remove guidelines">
            <X />
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="warRoomLink">Support or War Room link <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input
          id="warRoomLink"
          type="url"
          value={form.warRoomLink}
          onChange={(event) => update("warRoomLink", event.target.value)}
          placeholder="https://..."
        />
      </div>

      <details className="rounded-md border" open={!guidelinesFile && !form.projectGuidelines}>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
          Review or paste the extracted context
          {form.projectGuidelines ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {form.projectGuidelines.length.toLocaleString()} characters
            </span>
          ) : null}
        </summary>
        <div className="border-t p-4">
          <Textarea
            id="projectGuidelines"
            className="min-h-64 font-mono text-sm"
            value={form.projectGuidelines}
            onChange={(event) => update("projectGuidelines", event.target.value)}
            placeholder="Upload the PDF or paste verified project instructions here."
          />
        </div>
      </details>
    </div>
  )
}
