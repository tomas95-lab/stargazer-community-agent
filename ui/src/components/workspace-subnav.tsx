import { Link, useLocation } from "react-router-dom"

import { cn } from "@/lib/utils"

type SubnavItem = {
  label: string
  path: string
  matches?: (pathname: string) => boolean
}

const groups: Array<{ paths: string[]; items: SubnavItem[] }> = [
  {
    paths: ["/agent", "/dms", "/review", "/summary"],
    items: [
      { label: "Community", path: "/agent" },
      { label: "Direct messages", path: "/dms" },
      { label: "Review", path: "/review" },
      { label: "Daily summary", path: "/summary" },
    ],
  },
  {
    paths: ["/composer", "/comms", "/topics", "/webinars"],
    items: [
      { label: "Compose", path: "/composer" },
      { label: "Templates", path: "/comms" },
      { label: "Topics", path: "/topics" },
      { label: "Sessions", path: "/webinars" },
    ],
  },
  {
    paths: ["/projects", "/projects/new", "/project", "/memory", "/guidelines", "/links"],
    items: [
      {
        label: "Projects",
        path: "/projects",
        matches: (pathname) => pathname === "/projects" || pathname === "/projects/new",
      },
      { label: "Setup", path: "/project" },
      { label: "Memory", path: "/memory" },
      { label: "Versions", path: "/guidelines" },
      { label: "Links", path: "/links" },
    ],
  },
]

export function WorkspaceSubnav() {
  const { pathname } = useLocation()
  const group = groups.find((entry) => entry.paths.includes(pathname))

  if (!group) return null

  return (
    <nav className="border-b bg-background" aria-label="Workspace section">
      <div className="mx-auto flex w-full max-w-[1600px] gap-1 overflow-x-auto px-4 py-2 lg:px-6">
        {group.items.map((item) => {
          const active = item.matches ? item.matches(pathname) : pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-muted text-foreground",
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
