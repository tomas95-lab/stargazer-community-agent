import {
  CircleAlert,
  Check,
  ExternalLink,
  LoaderCircle,
  Sparkles,
  ShieldCheck,
} from "lucide-react"

import type { DiscourseAuthStatus } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ProjectFormState, UpdateProjectField } from "./types"

interface ConnectionsStepProps {
  form: ProjectFormState
  update: UpdateProjectField
  discourseConnected: boolean
  discourseStatus: DiscourseAuthStatus | null
  connectingDiscourse: boolean
  onConnectDiscourse: () => void
  authorizationPending: boolean
  authorizationCode: string
  onAuthorizationCodeChange: (value: string) => void
  onVerifyAuthorization: () => void
  verifyingAuthorization: boolean
  accessVerified: boolean
  onCheckAccess: () => void
  platformGeminiReady: boolean
  geminiModel: string
}

export function ConnectionsStep({
  form,
  update,
  discourseConnected,
  discourseStatus,
  connectingDiscourse,
  onConnectDiscourse,
  authorizationPending,
  authorizationCode,
  onAuthorizationCodeChange,
  onVerifyAuthorization,
  verifyingAuthorization,
  accessVerified,
  onCheckAccess,
  platformGeminiReady,
  geminiModel,
}: ConnectionsStepProps) {
  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-md border p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-md border",
              discourseConnected ? "border-success/30 bg-success/10 text-success" : "bg-muted",
            )}>
              {discourseConnected ? <Check /> : <ShieldCheck />}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">Outlier Community</h3>
                <Badge variant={discourseConnected ? "secondary" : "outline"}>
                  {discourseConnected ? "Connected" : "Action required"}
                </Badge>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {discourseStatus?.username
                  ? `Authorized as ${discourseStatus.username}. The raw key stays server-side.`
                  : "Authorize the app to read and reply with your Community account."}
              </p>
              {discourseStatus?.error ? (
                <p className="mt-2 flex items-start gap-2 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{discourseStatus.error}</span>
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant={discourseConnected ? "outline" : "default"}
            onClick={onConnectDiscourse}
            disabled={connectingDiscourse}
          >
            {connectingDiscourse ? <LoaderCircle className="animate-spin" /> : <ExternalLink />}
            {discourseConnected ? "Reconnect" : "Connect Discourse"}
          </Button>
        </div>

        {authorizationPending && !discourseConnected ? (
          <div className="grid gap-3 border-t pt-4">
            <div>
              <Label htmlFor="discourseAuthorizationCode">Authorization code</Label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                After you select Authorize in Community, copy the complete code shown there and paste it here. This is not your API key.
              </p>
            </div>
            <Textarea
              id="discourseAuthorizationCode"
              value={authorizationCode}
              onChange={(event) => onAuthorizationCodeChange(event.target.value)}
              placeholder="Paste the long authorization code from Community"
              className="min-h-28 resize-y font-mono text-xs"
              spellCheck={false}
            />
            <Button
              type="button"
              onClick={onVerifyAuthorization}
              disabled={verifyingAuthorization || !authorizationCode.trim()}
            >
              {verifyingAuthorization ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
              Verify connection
            </Button>
          </div>
        ) : null}

        {discourseConnected ? (
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Project access</p>
              <p className="text-xs text-muted-foreground">
                {accessVerified ? "Category and channel are accessible." : "Check the selected category and channel before continuing."}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onCheckAccess} disabled={verifyingAuthorization}>
              {verifyingAuthorization ? <LoaderCircle className="animate-spin" /> : accessVerified ? <Check /> : <ShieldCheck />}
              {accessVerified ? "Check again" : "Check access"}
            </Button>
          </div>
        ) : null}

        {!discourseConnected && !authorizationPending ? (
          <details className="rounded-md border bg-muted/30">
            <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium">
              Advanced: use an existing User API Key
            </summary>
            <div className="grid gap-2 border-t p-3">
              <Label htmlFor="discourseApiKey">Discourse User API Key</Label>
              <p className="text-xs text-muted-foreground">
                Paste an actual User API Key only. Do not paste the long authorization code here.
              </p>
              <Input
                id="discourseApiKey"
                type="password"
                autoComplete="off"
                value={form.discourseApiKey}
                onChange={(event) => update("discourseApiKey", event.target.value)}
                placeholder="Stored encrypted server-side"
              />
            </div>
          </details>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-md border p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md border",
            platformGeminiReady ? "border-success/30 bg-success/10 text-success" : "bg-muted",
          )}>
            {platformGeminiReady ? <Check /> : <Sparkles />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Gemini AI</h3>
              <Badge variant={platformGeminiReady ? "secondary" : "outline"}>
                {platformGeminiReady ? "Included" : "Platform setup pending"}
              </Badge>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              The platform provides Gemini automatically. Daily fair-use limits protect capacity across QMs and projects.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Model: {geminiModel || "Gemini Flash-Lite"}. No Google AI Studio account or personal key is required.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
