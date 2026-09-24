// Native-only modules: pure logic imports them but never calls them in tests.
const noop = () => Promise.resolve()
export const selectionAsync = noop, notificationAsync = noop, impactAsync = noop
export const NotificationFeedbackType = {}, ImpactFeedbackStyle = {}
export const router = { push: noop, back: noop, replace: noop, canGoBack: () => false }
export const Platform = { OS: 'ios' }
export default {}
