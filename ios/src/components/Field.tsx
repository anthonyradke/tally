// A text field that owns its own text while you type. A controlled <TextInput value> echoes every keystroke back to
// the native field; when the screen is busy re-rendering (the whole composer redraws on each letter) an echo can land
// out of step and iOS resets the text, dropping the caret at the front ("McD" turns into "onaldsMcD").
// Here the field is uncontrolled: typing never writes back. Only a change from elsewhere (picking a past entry,
// normalising tags on blur) re-seeds it, by remounting with the new text and keeping focus if it had it.
import { type Ref, useEffect, useRef, useState } from 'react'
import { TextInput, type TextInputProps } from 'react-native'

type Props = Omit<TextInputProps, 'value' | 'defaultValue'> & { value: string; ref?: Ref<TextInput> }

export function Field({ value, onChangeText, ref, ...rest }: Props) {
  const input = useRef<TextInput | null>(null)
  const typed = useRef(value) // what the field shows, as far as we know
  const refocus = useRef(false)
  const [seed, setSeed] = useState({ text: value, n: 0 })

  useEffect(() => {
    if (value === typed.current) return
    typed.current = value
    refocus.current = !!input.current?.isFocused()
    setSeed((s) => ({ text: value, n: s.n + 1 }))
  }, [value])

  useEffect(() => {
    if (refocus.current) { refocus.current = false; input.current?.focus() }
  }, [seed.n])

  const setRef = (el: TextInput | null) => {
    input.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  return (
    <TextInput key={seed.n} ref={setRef} defaultValue={seed.text} {...rest}
      onChangeText={(t) => { typed.current = t; onChangeText?.(t) }} />
  )
}
