import { Link } from "react-router-dom"
import { Orbit } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
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
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip={`${projectName} · Community Agent`}
              className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
            >
              <Link to="/" aria-label={`${projectName} Community Agent`}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                  <Orbit className="size-4" />
                </span>
                <span className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-sm font-semibold">Community Agent</span>
                  <span className="block truncate text-xs text-sidebar-foreground/60">{projectName}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
