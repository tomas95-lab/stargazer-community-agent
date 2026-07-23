import type { LucideIcon } from "lucide-react"
import { Bot, Check, CircleAlert, FileText, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { ProjectFormState, UpdateProjectField } from "./types"

const MODE_OPTIONS: Array<{
  value: ProjectFormState["agentMode"]
  title: string
  description: string
  icon: LucideIcon
}> = [
  {
    value: "draft",
    title: "Draft only",
    description: "Gemini prepares answers, but a QM always sends them.",
    icon: FileText,
  },
  {
    value: "supervised",
    title: "Supervised",
    description: "The agent evaluates messages and sends uncertain cases to review.",
    icon: ShieldCheck,
  },
  {
    value: "auto",
    title: "Automatic",
    description: "High-confidence answers can be posted without approval.",
    icon: Bot,
  },
]

interface AutomationStepProps {
  form: ProjectFormState
  update: UpdateProjectField
  completedCount: number
  totalSteps: number
  discourseConnected: boolean
}

export function AutomationStep({
  form,
  update,
  completedCount,
  totalSteps,
  discourseConnected,
}: AutomationStepProps) {
  const confidence = Number(form.minConfidence) || 0
  const ready = completedCount === totalSteps

  return (
    <div className="grid gap-7">
      <div className="grid gap-3">
        <Label>Agent mode</Label>
        <div className="grid gap-3 md:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const selected = form.agentMode === option.value
            const Icon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "min-h-36 rounded-md border p-4 text-left outline-none transition-[border-color,background-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selected ? "border-primary bg-accent/45 shadow-sm" : "bg-background hover:bg-muted/50",
                )}
                aria-pressed={selected}
                onClick={() => {
                  update("agentMode", option.value)
                  update("autoReplyEnabled", option.value === "auto")
                }}
              >
                <span className={cn(
                  "mb-4 flex size-9 items-center justify-center rounded-md border",
                  selected ? "border-primary/30 bg-background text-primary" : "bg-muted text-muted-foreground",
                )}>
                  <Icon className="size-4" />
                </span>
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-4 rounded-md border px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="minConfidence">Minimum confidence</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Lower values answer more often. Start at 50% and adjust after reviewing Quality.
            </p>
          </div>
          <Badge variant="outline">{Math.round(confidence * 100)}%</Badge>
        </div>
        <input
          id="minConfidence"
          className="h-2 w-full cursor-pointer accent-primary"
          type="range"
          min="0.3"
          max="0.95"
          step="0.05"
          value={form.minConfidence}
          onChange={(event) => update("minConfidence", event.target.value)}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>More coverage</span>
          <span>More cautious</span>
        </div>
      </div>

      <div className="grid gap-3 border-t pt-6">
        <div className="flex items-center gap-2">
          {ready
            ? <Check className="size-4 text-success" />
            : <CircleAlert className="size-4 text-warning" />}
          <h3 className="text-sm font-semibold">{ready ? "Ready to save" : "Review before saving"}</h3>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Project</dt>
            <dd className="mt-1 font-medium">{form.projectName || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Community target</dt>
            <dd className="mt-1 font-medium">Category {form.categoryId || "not set"} / Channel {form.channelId || "not set"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Connections</dt>
            <dd className="mt-1 font-medium">{discourseConnected ? "Discourse connected" : "Manual Discourse key"} / Gemini included</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Guidelines</dt>
            <dd className="mt-1 font-medium">{form.projectGuidelines.length.toLocaleString()} characters</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
