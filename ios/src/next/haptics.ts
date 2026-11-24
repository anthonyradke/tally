// One vocabulary of feel, used everywhere in the New design: a tick when something is chosen, a tap when a control
// moves, a thump when something lands, and the system's success and warning patterns.
import * as Haptics from 'expo-haptics'

const quiet = () => {}
export const tick = () => { Haptics.selectionAsync().catch(quiet) }
export const tap = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(quiet) }
export const soft = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(quiet) }
export const thump = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(quiet) }
export const success = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(quiet) }
export const warning = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(quiet) }
export const failure = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(quiet) }
