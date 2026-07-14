import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import { api, projectSelection, type QmProject } from "@/api"
import { useAuth } from "@/auth"

interface PlatformContextValue {
  loading: boolean
  projects: QmProject[]
  currentProject: QmProject | null
  refreshProjects: () => Promise<void>
  selectProject: (projectId: string) => void
}

const PlatformContext = createContext<PlatformContextValue | null>(null)

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { configured, session } = useAuth()
  const [projects, setProjects] = useState<QmProject[]>([])
  const [loading, setLoading] = useState(configured && Boolean(session))
  const [selectedId, setSelectedId] = useState(projectSelection.getProjectId())

  const refreshProjects = useCallback(async () => {
    if (!configured || !session) {
      setProjects([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const result = await api.getProjects()
      setProjects(result.projects)
      const storedId = projectSelection.getProjectId()
      const next =
        result.projects.find((project) => project.id === storedId) ||
        result.projects.find((project) => project.enabled) ||
        result.projects[0] ||
        null

      if (next) {
        projectSelection.setProjectId(next.id)
        setSelectedId(next.id)
      } else {
        projectSelection.clearProjectId()
        setSelectedId("")
      }
    } catch (err) {
      console.error(err)
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [configured, session])

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  const selectProject = useCallback((projectId: string) => {
    projectSelection.setProjectId(projectId)
    setSelectedId(projectId)
  }, [])

  const currentProject = useMemo(
    () => projects.find((project) => project.id === selectedId) || projects[0] || null,
    [projects, selectedId]
  )

  const value = useMemo<PlatformContextValue>(
    () => ({ loading, projects, currentProject, refreshProjects, selectProject }),
    [loading, projects, currentProject, refreshProjects, selectProject]
  )

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

export function usePlatform() {
  const context = useContext(PlatformContext)
  if (!context) throw new Error("usePlatform must be used inside PlatformProvider")
  return context
}
