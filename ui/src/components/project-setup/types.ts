export interface ProjectFormState {
  ownerName: string
  projectKey: string
  projectName: string
  communityBaseUrl: string
  categoryId: string
  categorySlug: string
  channelId: string
  discourseUsername: string
  discourseApiClientId: string
  discourseApiKey: string
  projectGuidelines: string
  warRoomLink: string
  agentMode: "draft" | "supervised" | "auto"
  autoReplyEnabled: boolean
  minConfidence: string
}

export type PersistedProjectFormState = Omit<ProjectFormState, "discourseApiKey">

export interface GuidelinesFileStatus {
  name: string
  size: number
  pages: number
  characters: number
  tables: number
  chunks: number
  warnings: string[]
}

export type UpdateProjectField = <K extends keyof ProjectFormState>(
  key: K,
  value: ProjectFormState[K],
) => void
