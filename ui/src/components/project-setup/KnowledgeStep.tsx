import type { ChangeEvent, DragEvent, RefObject } from "react"
import { FileText, FileUp, LoaderCircle, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { GuidelinesFileStatus, ProjectFormState, UpdateProjectField } from "./types"

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
}: KnowledgeStepProps) {
  return (
    <div className="grid gap-5">
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
          <p className="font-medium">{extractingGuidelines ? "Reading your PDF" : "Drop the project guidelines here"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tables and page context are preserved. PDF up to 12 MB.
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
