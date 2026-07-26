/** Zero-padded HH:MM from a game minute-of-day; shared by the HUD clock and toast timestamps. */
export function clockTimeLabel(minute: number): string {
  const whole = Math.floor(minute)
  const hh = String(Math.floor(whole / 60)).padStart(2, '0')
  const mm = String(whole % 60).padStart(2, '0')
  return `${hh}:${mm}`
}
