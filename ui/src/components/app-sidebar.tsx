import * as React from "react"
import { Link } from "react-router-dom"
import {
  IconBook2,
  IconCalendarEvent,
  IconDashboard,
  IconHistory,
  IconInnerShadowTop,
  IconLink,
  IconListDetails,
  IconMessage,
  IconRobot,
  IconSettings,
} from "@tabler/icons-react"

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "Stargazer",
    email: "Community Ops",
    avatar: "",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: IconDashboard,
    },
    {
      title: "Topics",
      url: "/topics",
      icon: IconListDetails,
    },
    {
      title: "Comms",
      url: "/comms",
      icon: IconMessage,
    },
    {
      title: "Community Agent",
      url: "/agent",
      icon: IconRobot,
    },
    {
      title: "Sessions",
      url: "/webinars",
      icon: IconCalendarEvent,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "/settings",
      icon: IconSettings,
    },
  ],
  documents: [
    {
      name: "Link Manager",
      url: "/links",
      icon: IconLink,
    },
    {
      name: "Run History",
      url: "/history",
      icon: IconHistory,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link to="/">
                <IconInnerShadowTop className="size-5!" />
                <span className="text-base font-semibold">Stargazer</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} label="Resources" />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
