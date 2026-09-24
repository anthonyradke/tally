import { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'

/** A quick side-to-side "no", like a refused password. Returns the style to put on the view and the trigger. */
export function useShake() {
  const reduce = useReducedMotion()
  const x = useSharedValue(0)
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }))
  const shake = () => {
    if (reduce) return
    const s = (v: number) => withTiming(v, { duration: 45 })
    x.set(withSequence(s(-11), s(10), s(-8), s(6), s(-3), s(0)))
  }
  return [style, shake] as const
}
