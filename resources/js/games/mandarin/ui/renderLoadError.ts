import { CourseUpdateRequiredError } from '../adapters/HttpMandarinGateway'

/** The bootstrap fails before React mounts; keep its recovery control accessible. */
export function renderLoadError(root: HTMLElement, error: unknown, reload: () => void = () => window.location.reload()): void {
  root.replaceChildren()
  const message = document.createElement('p')
  message.setAttribute('role', 'alert')
  message.className = 'p-4 text-sm'
  message.textContent = error instanceof CourseUpdateRequiredError
    ? error.message
    : 'Could not load the course. Check your connection and reload to try again.'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'm-4 rounded-lg bg-[#1e3c34] px-4 py-2 text-white'
  button.textContent = 'Reload'
  button.addEventListener('click', reload)
  root.append(message, button)
}
