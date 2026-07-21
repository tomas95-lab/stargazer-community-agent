import { useLocation } from "react-router-dom"
import { CircleDot, FolderKanban } from "lucide-react"

import { ContextualGuide } from "@/components/contextual-guide"
import { CommandPalette } from "@/components/command-palette"
import { NotificationBell } from "@/components/notification-bell"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { guideForPath } from "@/lib/workspace-guides"
import { usePlatform } from "@/platform"

export function SiteHeader() {
  const { pathname } = useLocation()
  const { currentProject, projects, selectProject } = usePlatform()
  const guide = guideForPath(pathname)

  return (
    <header className="sticky top-0 z-30 flex min-h-(--header-height) shrink-0 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <div className="flex w-full min-w-0 items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Separator orientation="vertical" className="hidden h-5 sm:block" />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">{guide.title}</h1>
          <p className="hidden truncate text-xs text-muted-foreground md:block">{guide.description}</p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <CommandPalette />
          {currentProject ? (
            <Select value={currentProject.id} onValueChange={selectProject}>
              <SelectTrigger className="hidden h-9 w-[210px] bg-background lg:flex" aria-label="Active project">
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
