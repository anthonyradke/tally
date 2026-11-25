// How things move in the New design, after Face ID, Apple Pay and SwiftUI's defaults: quick ease-out curves and
// critically damped springs. Nothing overshoots or wobbles; changes are carried by fades and short travel.
import { Easing, FadeIn, FadeOut, Keyframe, LinearTransition } from 'react-native-reanimated'

/** Fast start, long soft landing (UIKit's default for presentations). */
export const EASE = Easing.bezier(0.2, 0.8, 0.2, 1)

/** Items sliding to new places in a list or row. */
export const SETTLE = LinearTransition.springify().duration(380).dampingRatio(1)

/** Content appearing: a fade with a short rise. */
export const rise = (delay = 0, by = 10) => new Keyframe({
  0: { opacity: 0, transform: [{ translateY: by }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE },
}).duration(520).delay(delay)

export const fadeIn = (delay = 0) => FadeIn.duration(260).delay(delay).easing(EASE)
export const fadeOut = FadeOut.duration(160)

/** A digit changing in place, like SwiftUI's numeric text: the new one comes in from below while the old one leaves
 *  toward the top (reversed when the number goes down), both fading. `h`: the line height. */
export const digitIn = (down: boolean, h: number) => new Keyframe({
  0: { opacity: 0, transform: [{ translateY: (down ? -1 : 1) * h * 0.4 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE },
}).duration(300)
export const digitOut = (down: boolean, h: number) => new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: (down ? 1 : -1) * h * 0.4 }], easing: EASE },
}).duration(220)
