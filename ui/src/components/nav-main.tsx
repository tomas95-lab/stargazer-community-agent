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

export function NavMain({ items, label }: { items: WorkspaceGuide[]; label?: string }) {
  const { pathname } = useLocation()

  return (
    <SidebarGroup className="py-1.5">
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = pathname === item.path || (item.path === "/projects" && pathname === "/projects/new")
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
