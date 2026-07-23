import { Link, useLocation } from "react-router-dom"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { WorkspaceGuide } from "@/lib/workspace-guides"

const modulePaths: Record<string, string[]> = {
  "/agent": ["/agent", "/dms", "/review", "/summary"],
  "/composer": ["/composer", "/comms", "/topics", "/webinars"],
  "/projects": ["/projects", "/projects/new", "/project", "/memory", "/guidelines", "/links"],
}

export function NavMain({ items, label }: { items: WorkspaceGuide[]; label?: string }) {
  const { pathname } = useLocation()

  return (
    <SidebarGroup className="py-1.5">
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = (modulePaths[item.path] || [item.path]).includes(pathname)
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.shortTitle}>
                  <Link to={item.path}>
                    <item.icon />
                    <span>{item.shortTitle}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
