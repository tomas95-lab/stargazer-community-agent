import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ProjectFormState, UpdateProjectField } from "./types"

interface CommunityStepProps {
  form: ProjectFormState
  update: UpdateProjectField
  categoryUrl: string
  onCategoryUrlChange: (value: string) => void
  onExtractCategory: () => void
}

export function CommunityStep({
  form,
  update,
  categoryUrl,
  onCategoryUrlChange,
  onExtractCategory,
}: CommunityStepProps) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="categoryUrl">Category URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="categoryUrl"
            value={categoryUrl}
            onChange={(event) => onCategoryUrlChange(event.target.value)}
            placeholder="https://community.outlier.ai/c/project-name/123"
          />
          <Button
            className="sm:min-w-28"
            type="button"
            variant="outline"
            onClick={onExtractCategory}
            disabled={!categoryUrl.trim()}
          >
            <Sparkles />
            Extract
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste the category URL and the form will fill its ID, slug, and Community host.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="categoryId">Category ID</Label>
          <Input
            id="categoryId"
            inputMode="numeric"
            value={form.categoryId}
            onChange={(event) => update("categoryId", event.target.value)}
            placeholder="123"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="categorySlug">Category slug</Label>
          <Input
            id="categorySlug"
            value={form.categorySlug}
            onChange={(event) => update("categorySlug", event.target.value)}
            placeholder="project-name"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="channelId">Community channel ID</Label>
          <Input
            id="channelId"
            inputMode="numeric"
            value={form.channelId}
            onChange={(event) => update("channelId", event.target.value)}
            placeholder="Open the project chat and copy its ID"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="discourseUsername">Your Discourse username</Label>
          <Input
            id="discourseUsername"
            autoComplete="username"
            value={form.discourseUsername}
            onChange={(event) => update("discourseUsername", event.target.value.replace(/^@/, ""))}
            placeholder="Without the @ symbol"
            required
          />
        </div>
      </div>

      <details className="group rounded-md border">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
          Advanced Community settings
        </summary>
        <div className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="communityBaseUrl">Community base URL</Label>
            <Input
              id="communityBaseUrl"
              value={form.communityBaseUrl}
              onChange={(event) => update("communityBaseUrl", event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="discourseApiClientId">API client ID</Label>
            <Input
              id="discourseApiClientId"
              value={form.discourseApiClientId}
              onChange={(event) => update("discourseApiClientId", event.target.value)}
              required
            />
          </div>
        </div>
      </details>
    </div>
  )
}
