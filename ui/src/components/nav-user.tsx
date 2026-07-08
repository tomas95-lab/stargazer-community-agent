import {
  IconDotsVertical,
  IconHistory,
  IconLink,
  IconLogout,
  IconSettings,
  IconUserCircle,
} from "@tabler/icons-react"
import { Link } from "react-router-dom"

import { useAuth } from "@/auth"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavUser({
  user: fallbackUser,
}: {
  user?: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const auth = useAuth()
  const name = String(auth.user?.user_metadata?.name || auth.user?.email || fallbackUser?.name || "Stargazer")
  const email = auth.user?.email || fallbackUser?.email || "Community Ops"
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "SG"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
                <Avatar className="h-8 w-8 rounded-lg grayscale">
                  <AvatarImage src={fallbackUser?.avatar || ""} alt={name} />
                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={fallbackUser?.avatar || ""} alt={name} />
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/agent">
                <IconUserCircle />
                Community Agent
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/links">
                  <IconLink />
                  Links
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/history">
                  <IconHistory />
                  History
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <IconSettings />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void auth.signOut()}>
              <IconLogout />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
