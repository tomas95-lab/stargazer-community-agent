import type { CSSProperties, ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"

import { AuthProvider, useAuth } from "@/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PlatformProvider, usePlatform } from "@/platform"
import CommsAutomator from "@/pages/CommsAutomator"
import CommunityAgent from "@/pages/CommunityAgent"
import DailySummary from "@/pages/DailySummary"
import Dashboard from "@/pages/Dashboard"
import DirectMessages from "@/pages/DirectMessages"
import Help from "@/pages/Help"
import History from "@/pages/History"
import LinkManager from "@/pages/LinkManager"
import Login from "@/pages/Login"
import MessageComposer from "@/pages/MessageComposer"
import ProjectSetup from "@/pages/ProjectSetup"
import ProjectMemoryPage from "@/pages/ProjectMemory"
import ReviewQueue from "@/pages/ReviewQueue"
import RunDetails from "@/pages/RunDetails"
import Settings from "@/pages/Settings"
import Signup from "@/pages/Signup"
import TestingSandbox from "@/pages/TestingSandbox"
import TopicEditor from "@/pages/TopicEditor"
import WebinarScheduler from "@/pages/WebinarScheduler"

function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (!auth.configured) return children
  if (auth.loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading workspace...
      </main>
    )
  }
  if (!auth.session) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RequireProject({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { loading, projects } = usePlatform()

  if (!auth.configured) return children
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading projects...
      </main>
    )
  }
  if (projects.length === 0) return <Navigate to="/onboarding" replace />
  return children
}

function WorkspaceRoutes() {
  const { currentProject } = usePlatform()

  return (
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
              <Routes key={currentProject?.id || "default-project"}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/topics" element={<TopicEditor />} />
                <Route path="/comms" element={<CommsAutomator />} />
                <Route path="/composer" element={<MessageComposer />} />
                <Route path="/agent" element={<CommunityAgent />} />
                <Route path="/dms" element={<DirectMessages />} />
                <Route path="/webinars" element={<WebinarScheduler />} />
                <Route path="/links" element={<LinkManager />} />
                <Route path="/history" element={<History />} />
                <Route path="/runs" element={<RunDetails />} />
                <Route path="/review" element={<ReviewQueue />} />
                <Route path="/summary" element={<DailySummary />} />
                <Route path="/sandbox" element={<TestingSandbox />} />
                <Route path="/memory" element={<ProjectMemoryPage />} />
                <Route path="/help" element={<Help />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/project" element={<ProjectSetup />} />
                <Route path="*" element={<Dashboard />} />
              </Routes>
            </main>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <PlatformProvider>
                    <ProjectSetup />
                  </PlatformProvider>
                </RequireAuth>
              }
            />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <PlatformProvider>
                    <RequireProject>
                      <WorkspaceRoutes />
                    </RequireProject>
                  </PlatformProvider>
                </RequireAuth>
              }
            />
          </Routes>
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
