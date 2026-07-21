import { Link } from "react-router-dom"
import { Inbox, MessageSquarePlus, Orbit } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { useAuth } from "@/auth"
import { usePlatform } from "@/platform"
import { guidesForGroup } from "@/lib/workspace-guides"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { currentProject } = usePlatform()
  const { user } = useAuth()
  const projectName = currentProject?.projectName || "Select a project"
  const userName = user?.user_metadata?.name || user?.email?.split("@")[0] || "QM"

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="gap-3 border-b border-sidebar-border px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Community Agent">
              <Link to="/" className="group/brand">
                <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                  <Orbit className="size-4" />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-semibold">Community Agent</span>
                  <span className="block truncate text-xs text-sidebar-foreground/60">{projectName}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 overflow-hidden group-data-[collapsible=icon]:grid-cols-1">
          <Button asChild size="sm" className="justify-start group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:px-0">
            <Link to="/composer">
              <MessageSquarePlus className="size-4" />
              <span className="group-data-[collapsible=icon]:hidden">Compose</span>
            </Link>
          </Button>
          <Button asChild size="icon" variant="outline" className="size-8 group-data-[collapsible=icon]:hidden">
            <Link to="/agent" title="Open Community inbox">
              <Inbox className="size-4" />
              <span className="sr-only">Open Community inbox</span>
            </Link>
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <NavMain items={guidesForGroup("Overview")} />
        <NavMain label="Inbox" items={guidesForGroup("Inbox")} />
        <NavMain label="Content" items={guidesForGroup("Content")} />
        <NavMain label="Project" items={guidesForGroup("Project")} />
        <SidebarSeparator className="mx-3 w-auto" />
        <NavMain label="System" items={guidesForGroup("System")} />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <NavUser
          user={{
            name: userName,
            email: user?.email || currentProject?.projectKey || "QM workspace",
            avatar: "",
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
