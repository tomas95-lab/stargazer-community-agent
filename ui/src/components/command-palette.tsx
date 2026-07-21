import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Search } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { workspaceGuides } from "@/lib/workspace-guides"

const quickActions = [
  { title: "Compose a message", description: "Create and publish a one-off project communication", path: "/composer" },
  { title: "Scan Community", description: "Review the latest channel messages", path: "/agent" },
  { title: "Review direct messages", description: "Open today's private conversations", path: "/dms" },
  { title: "Add a project", description: "Connect a new Project ID", path: "/projects/new" },
]

export function CommandPalette() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery("")
    setSelected(0)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const items = useMemo(() => {
    const pages = workspaceGuides.map((guide) => ({
      title: guide.shortTitle,
      description: guide.description,
      path: guide.path,
      group: guide.group,
      icon: guide.icon,
    }))
    const actions = quickActions.map((action) => ({ ...action, group: "Quick action", icon: ArrowRight }))
    const needle = query.trim().toLowerCase()
    return [...actions, ...pages].filter((item) => !needle || `${item.title} ${item.description} ${item.group}`.toLowerCase().includes(needle))
  }, [query])

  function choose(path: string) {
    setOpen(false)
    navigate(path)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search workspace"><Search className="size-4" /></Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Trigger asChild>
        <Button variant="outline" size="sm" className="hidden h-9 gap-2 text-muted-foreground sm:flex" aria-label="Search workspace">
          <Search className="size-4" />
          <span className="hidden xl:inline">Search</span>
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] xl:inline">Ctrl K</kbd>
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[14vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-2xl outline-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(value + 1, items.length - 1)) }
            if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(value - 1, 0)) }
            if (event.key === "Enter" && items[selected]) { event.preventDefault(); choose(items[selected].path) }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Search workspace</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Navigate to a page or start a common action.</DialogPrimitive.Description>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSelected(0) }}
              placeholder="Search pages and actions..."
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
          </div>
          <div className="max-h-[55vh] overflow-y-auto p-2" role="listbox">
            {items.length ? items.map((item, index) => (
              <button
                key={`${item.group}:${item.path}:${item.title}`}
                type="button"
                role="option"
                aria-selected={selected === index}
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(item.path)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ${selected === index ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}`}
              >
                <item.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                </span>
                <span className="text-[10px] uppercase text-muted-foreground">{item.group}</span>
              </button>
            )) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matching pages or actions.</p>}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
