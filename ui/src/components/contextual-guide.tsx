import { Link, useLocation } from "react-router-dom"
import { BookOpen, Check, Lightbulb, MoveRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { guideForPath } from "@/lib/workspace-guides"

export function ContextualGuide() {
  const { pathname } = useLocation()
  const guide = guideForPath(pathname)
  const Icon = guide.icon

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="px-2 sm:px-3" title="Open page guide">
          <BookOpen className="size-4" />
          <span className="hidden sm:inline">Guide</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-6 text-left">
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg border bg-muted">
            <Icon className="size-5" />
          </div>
          <SheetTitle className="text-xl">{guide.title}</SheetTitle>
          <SheetDescription className="leading-6">{guide.description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-7 px-6 py-6">
          <section>
            <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Recommended flow</p>
            <ol className="space-y-4">
              {guide.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">
                    {index + 1}
                  </span>
                  <p className="pt-0.5 text-sm leading-5 text-foreground">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-lg border bg-muted/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="size-4" />
              Good to know
            </div>
            <div className="space-y-3">
              {guide.tips.map((tip) => (
                <div key={tip} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <p className="text-sm leading-5 text-muted-foreground">{tip}</p>
                </div>
              ))}
            </div>
          </section>

          <SheetClose asChild>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/help">
                Open Help Center
                <MoveRight className="size-4" />
              </Link>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}
