import { CircleDot, FlaskConical, FolderKanban } from "lucide-react"

import { ContextualGuide } from "@/components/contextual-guide"
import { CommandPalette } from "@/components/command-palette"
import { NotificationBell } from "@/components/notification-bell"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { usePlatform } from "@/platform"

export function SiteHeader() {
  const { currentProject, projects, selectProject } = usePlatform()

  return (
    <header className="sticky top-0 z-30 flex min-h-(--header-height) shrink-0 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <div className="flex w-full min-w-0 items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1 shrink-0" />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {currentProject?.settings?.demoMode === true ? (
            <Badge variant="secondary" className="hidden gap-1.5 sm:flex"><FlaskConical className="size-3.5" />Demo mode</Badge>
          ) : null}
          <CommandPalette />
          {currentProject ? (
            <Select value={currentProject.id} onValueChange={selectProject}>
              <SelectTrigger className="h-9 w-[150px] bg-background sm:w-[210px]" aria-label="Active project">
                <FolderKanban className="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="flex min-w-0 items-center gap-2">
                      <CircleDot className={project.enabled ? "size-3 text-emerald-600" : "size-3 text-muted-foreground"} />
                      <span className="truncate">{project.projectName}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <ContextualGuide />
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
