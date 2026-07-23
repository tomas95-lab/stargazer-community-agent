import { LoaderCircle, Search, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ProjectFormState, UpdateProjectField } from "./types"

interface IdentityStepProps {
  form: ProjectFormState
  update: UpdateProjectField
  editing: boolean
  lookingUpProject: boolean
  onLookupProject: () => void
}

export function IdentityStep({
  form,
  update,
  editing,
  lookingUpProject,
  onLookupProject,
}: IdentityStepProps) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ownerName">Your QM name</Label>
          <Input
            id="ownerName"
            autoComplete="name"
            value={form.ownerName}
            onChange={(event) => update("ownerName", event.target.value)}
            placeholder="How your team knows you"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="projectName">Project name</Label>
          <Input
            id="projectName"
            value={form.projectName}
            onChange={(event) => update("projectName", event.target.value)}
            placeholder="Example: Aurora"
            required
          />
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="projectKey">Shared Project ID</Label>
          <Badge variant="outline">Shared by all QMs</Badge>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="projectKey"
            className="font-mono"
            value={form.projectKey}
            onChange={(event) => update("projectKey", event.target.value)}
            placeholder="Paste the exact ID from your team"
            required
            readOnly={editing}
          />
          {!editing ? (
            <Button
              className="sm:min-w-28"
              type="button"
              variant="outline"
              onClick={onLookupProject}
              disabled={lookingUpProject || !form.projectKey.trim()}
            >
              {lookingUpProject ? <LoaderCircle className="animate-spin" /> : <Search />}
              Find project
            </Button>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Matching IDs share topics, comms, links, guidelines, and project settings.
        </p>
      </div>

      <div className="flex gap-3 rounded-md border bg-muted/40 px-4 py-3">
        <Users className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-sm leading-6 text-muted-foreground">
          Joining an existing project loads its shared configuration. Your Community access remains private to your account, while Gemini is managed by the platform.
        </p>
      </div>
    </div>
  )
}
