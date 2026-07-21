import { lazy, Suspense } from "react"
import type { CSSProperties, ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"

import { AuthProvider, useAuth } from "@/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { PlatformProvider, usePlatform } from "@/platform"
import Login from "@/pages/Login"
import Signup from "@/pages/Signup"

const CommsAutomator = lazy(() => import("@/pages/CommsAutomator"))
const CommunityAgent = lazy(() => import("@/pages/CommunityAgent"))
const DailySummary = lazy(() => import("@/pages/DailySummary"))
const Dashboard = lazy(() => import("@/pages/Dashboard"))
const DirectMessages = lazy(() => import("@/pages/DirectMessages"))
const Help = lazy(() => import("@/pages/Help"))
const GuidelinesHistory = lazy(() => import("@/pages/GuidelinesHistory"))
const History = lazy(() => import("@/pages/History"))
const LinkManager = lazy(() => import("@/pages/LinkManager"))
const MessageComposer = lazy(() => import("@/pages/MessageComposer"))
const Projects = lazy(() => import("@/pages/Projects"))
const ProjectSetup = lazy(() => import("@/pages/ProjectSetup"))
const ProjectMemoryPage = lazy(() => import("@/pages/ProjectMemory"))
const QualityDashboard = lazy(() => import("@/pages/QualityDashboard"))
const ReviewQueue = lazy(() => import("@/pages/ReviewQueue"))
const RunDetails = lazy(() => import("@/pages/RunDetails"))
const Settings = lazy(() => import("@/pages/Settings"))
const TestingSandbox = lazy(() => import("@/pages/TestingSandbox"))
const TopicEditor = lazy(() => import("@/pages/TopicEditor"))
const WebinarScheduler = lazy(() => import("@/pages/WebinarScheduler"))

function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (!auth.configured) return children
  if (auth.loading) {
    return <WorkspaceLoading label="Loading your workspace" />
  }
  if (!auth.session) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function RequireProject({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { loading, projects } = usePlatform()

  if (!auth.configured) return children
  if (loading) {
    return <WorkspaceLoading label="Loading your projects" />
  }
  if (projects.length === 0) return <Navigate to="/onboarding" replace />
  return children
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <main className="flex min-h-screen bg-background">
      <aside className="hidden w-72 border-r bg-sidebar p-4 md:block">
        <Skeleton className="h-10 w-48" />
        <div className="mt-8 space-y-3">
          {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-8 w-full" />)}
        </div>
      </aside>
      <section className="flex-1 p-6">
        <div className="flex items-center gap-3 border-b pb-5">
          <Skeleton className="size-8" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl space-y-4" aria-live="polite">
          <p className="text-sm text-muted-foreground">{label}...</p>
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </section>
    </main>
  )
}

function PageLoading() {
  return (
    <div className="space-y-5 px-4 lg:px-6" aria-label="Loading page">
      <div className="space-y-2"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-80 max-w-full" /></div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}

function WorkspaceRoutes() {
  const { currentProject } = usePlatform()

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 16)",
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 py-5 md:gap-6 md:py-7">
              <Suspense fallback={<PageLoading />}>
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
                <Route path="/guidelines" element={<GuidelinesHistory />} />
                <Route path="/quality" element={<QualityDashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/new" element={<ProjectSetup forceNew />} />
                <Route path="/help" element={<Help />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/project" element={<ProjectSetup />} />
                <Route path="*" element={<Dashboard />} />
              </Routes>
              </Suspense>
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
                    <Suspense fallback={<WorkspaceLoading label="Loading project setup" />}><ProjectSetup /></Suspense>
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
          <Toaster richColors closeButton />
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
