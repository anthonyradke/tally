// Links into Tally (tally://…) open as they come; iOS's own Face ID lock, when it's on, runs before Tally does.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  return path
}
