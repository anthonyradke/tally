// expo-local-authentication on a scripted phone: whether Face ID is set up, and what the next prompts answer.
export const phone = { hardware: true, enrolled: true, answers: [], asked: 0 }
export async function hasHardwareAsync() { return phone.hardware }
export async function isEnrolledAsync() { return phone.enrolled }
export async function authenticateAsync() {
  phone.asked++
  return phone.answers.shift() ?? { success: false, error: 'user_cancel' }
}
