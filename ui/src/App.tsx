import type { CSSProperties, ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"

import { AuthProvider, useAuth } from "@/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import CommsAutomator from "@/pages/CommsAutomator"
import CommunityAgent from "@/pages/CommunityAgent"
import Dashboard from "@/pages/Dashboard"
import DirectMessages from "@/pages/DirectMessages"
import History from "@/pages/History"
import LinkManager from "@/pages/LinkManager"
import LoginPage from "@/pages/Login"
import MessageComposer from "@/pages/MessageComposer"
import PlatformSetup from "@/pages/PlatformSetup"
import ProjectMemoryPage from "@/pages/ProjectMemory"
import ReviewQueue from "@/pages/ReviewQueue"
import RunDetails from "@/pages/RunDetails"
import Settings from "@/pages/Settings"
import SignupPage from "@/pages/Signup"
import TestingSandbox from "@/pages/TestingSandbox"
import TopicEditor from "@/pages/TopicEditor"
import WebinarScheduler from "@/pages/WebinarScheduler"

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </main>
  )
}

function ProtectedDashboard() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.loading) return <LoadingScreen />
  if (!auth.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return (
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
                  <Route path="/composer" element={<MessageComposer />} />
                  <Route path="/agent" element={<CommunityAgent />} />
                  <Route path="/dms" element={<DirectMessages />} />
                  <Route path="/webinars" element={<WebinarScheduler />} />
                  <Route path="/links" element={<LinkManager />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/runs" element={<RunDetails />} />
                  <Route path="/review" element={<ReviewQueue />} />
                  <Route path="/sandbox" element={<TestingSandbox />} />
                  <Route path="/memory" element={<ProjectMemoryPage />} />
                  <Route path="/platform" element={<PlatformSetup />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Dashboard />} />
                </Routes>
              </main>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function PublicRoute({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.loading) return <LoadingScreen />
  if (auth.user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
          <Route path="/*" element={<ProtectedDashboard />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
