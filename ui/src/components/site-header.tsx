import { useLocation } from "react-router-dom"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NotificationBell } from "@/components/notification-bell"
import { usePlatform } from "@/platform"

const TITLES: Record<string, string> = {
  "/": "Project Dashboard",
  "/topics": "Topics",
  "/comms": "Comms Automator",
  "/composer": "Message Composer",
  "/agent": "Community Agent",
  "/dms": "DM Review",
  "/webinars": "Sessions",
  "/links": "Link Manager",
  "/history": "History",
  "/runs": "Run Details",
  "/review": "Human Review Queue",
  "/sandbox": "Testing Sandbox",
  "/memory": "Project Memory",
  "/help": "Help",
  "/settings": "Settings",
  "/project": "Project Settings",
}

export function SiteHeader() {
  const { pathname } = useLocation()
  const { currentProject, projects, selectProject } = usePlatform()
  const title = TITLES[pathname] ?? "Project"

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          {projects.length > 1 ? (
            <select
              className="h-8 max-w-52 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={currentProject?.id || ""}
              onChange={(event) => {
                selectProject(event.target.value)
              }}
              aria-label="Active project"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.projectName} ({project.projectKey})
                </option>
              ))}
            </select>
          ) : currentProject ? (
            <span className="hidden max-w-52 truncate text-sm text-muted-foreground sm:inline">
              {currentProject.projectName} ({currentProject.projectKey})
            </span>
          ) : null}
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
