import type { CSSProperties } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import CommsAutomator from "@/pages/CommsAutomator"
import CommunityAgent from "@/pages/CommunityAgent"
import Dashboard from "@/pages/Dashboard"
import History from "@/pages/History"
import LinkManager from "@/pages/LinkManager"
import Settings from "@/pages/Settings"
import TopicEditor from "@/pages/TopicEditor"
import WebinarScheduler from "@/pages/WebinarScheduler"

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 72)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as CSSProperties
          }
        >
          <AppSidebar variant="inset" />
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <main className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/topics" element={<TopicEditor />} />
                    <Route path="/comms" element={<CommsAutomator />} />
                    <Route path="/agent" element={<CommunityAgent />} />
                    <Route path="/webinars" element={<WebinarScheduler />} />
                    <Route path="/links" element={<LinkManager />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Dashboard />} />
                  </Routes>
                </main>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}
