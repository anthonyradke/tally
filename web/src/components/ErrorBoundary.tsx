import { Component, type ReactNode } from 'react'
import s from './ErrorBoundary.module.css'

/** Catches a render error so one broken screen shows a way out instead of blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className={s.box} role="alert">
        <p className={s.title}>Something went wrong</p>
        <p className="secondary">{this.state.error.message}</p>
        <button type="button" className={s.btn} onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}
