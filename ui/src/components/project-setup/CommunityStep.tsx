import { LoaderCircle, Search, Sparkles } from "lucide-react"

import type { DiscoursePublicChannel } from "@/api"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ProjectFormState, UpdateProjectField } from "./types"

interface CommunityStepProps {
  form: ProjectFormState
  update: UpdateProjectField
  categoryUrl: string
  onCategoryUrlChange: (value: string) => void
  onExtractCategory: () => void
  isCsm?: boolean
  availableChannels?: DiscoursePublicChannel[]
  discoveringChannels?: boolean
  onDiscoverChannels?: () => void
}

export function CommunityStep({
  form,
  update,
  categoryUrl,
  onCategoryUrlChange,
  onExtractCategory,
  isCsm = false,
  availableChannels = [],
  discoveringChannels = false,
  onDiscoverChannels,
}: CommunityStepProps) {
  const channelList = form.managedChannelIds.join("\n")
  const updateChannels = (value: string) => {
    const channels = value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)
    update("managedChannelIds", channels)
    update("channelId", channels[0] || "")
  }
  const toggleChannel = (channelId: string, selected: boolean) => {
    const channels = selected
      ? Array.from(new Set([...form.managedChannelIds, channelId])).slice(0, 30)
      : form.managedChannelIds.filter((item) => item !== channelId)
    update("managedChannelIds", channels)
    update("channelId", channels[0] || "")
  }

  return (
    <div className="grid gap-6">
      <div className={isCsm ? "hidden" : "grid gap-2"}>
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
        {isCsm ? (
          <div className="grid gap-2 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="managedChannelIds">Community channel IDs</Label>
              <Button type="button" size="sm" variant="outline" onClick={onDiscoverChannels} disabled={discoveringChannels}>
                {discoveringChannels ? <LoaderCircle className="animate-spin" /> : <Search />}
                Discover channels
              </Button>
            </div>
            {availableChannels.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded-md border bg-background p-2">
                {availableChannels.map((channel) => {
                  const selected = form.managedChannelIds.includes(channel.id)
                  return (
                    <label key={channel.id} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60">
                      <Checkbox checked={selected} onCheckedChange={(checked) => toggleChannel(channel.id, checked === true)} />
                      <span className="min-w-0 flex-1 truncate text-sm">{channel.title}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{channel.id}</span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <Textarea
                id="managedChannelIds"
                className="min-h-40 font-mono"
                value={channelList}
                onChange={(event) => updateChannels(event.target.value)}
                placeholder={"761050\n761051\n761052"}
                required
              />
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              {form.managedChannelIds.length}/30 selected. The first selected channel is the primary destination for manual sends; the agent scans every selected channel.
            </p>
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="categoryId">Category ID {isCsm ? <span className="font-normal text-muted-foreground">(optional)</span> : null}</Label>
          <Input
            id="categoryId"
            inputMode="numeric"
            value={form.categoryId}
            onChange={(event) => update("categoryId", event.target.value)}
            placeholder="123"
            required={!isCsm}
          />
        </div>
        <div className={isCsm ? "hidden" : "grid gap-2"}>
          <Label htmlFor="categorySlug">Category slug</Label>
          <Input
            id="categorySlug"
            value={form.categorySlug}
            onChange={(event) => update("categorySlug", event.target.value)}
            placeholder="project-name"
          />
        </div>
        <div className={isCsm ? "hidden" : "grid gap-2"}>
          <Label htmlFor="channelId">Community channel ID</Label>
          <Input
            id="channelId"
            inputMode="numeric"
            value={form.channelId}
            onChange={(event) => update("channelId", event.target.value)}
            placeholder="Open the project chat and copy its ID"
            required={!isCsm}
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
