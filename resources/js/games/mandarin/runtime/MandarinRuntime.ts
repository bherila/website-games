/**
 * Dependency bundle handed to the React tree. Components read it through
 * `useRuntime()`; nothing in `ui/` imports a gateway, storage or audio
 * implementation directly.
 */
import type { PreviewScenario } from '../adapters/previewScenarios'
import type { PreviewStore } from '../adapters/previewStore'
import type { AudioManager } from '../audio/audioManager'
import type { MandarinGateway } from '../contracts/mandarin'
import type { CourseIndex } from '../domain/course'
import type { Course } from '../domain/courseSchema'

export interface MandarinRuntime {
  course: CourseIndex
  gateway: MandarinGateway<Course>
  audio: AudioManager
  store: PreviewStore
  /** Present only for the preview composition root. A live runtime passes null. */
  scenario: PreviewScenario | null
  clientInstanceId: string
  sessionId: string
  now: () => Date
  dispose(): void
}
