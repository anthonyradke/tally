// lib/sound.ts loads its .wav files with require(); tests never play anything.
export const play = () => {}
export const loadSounds = async () => {}
export const useSounds = Object.assign(() => true, { getState: () => ({ on: false, set() {} }), setState() {} })
