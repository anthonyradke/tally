// In-memory expo-secure-store (the keychain).
const data = new Map()
export async function getItemAsync(k) { return data.has(k) ? data.get(k) : null }
export async function setItemAsync(k, v) { data.set(k, String(v)) }
export async function deleteItemAsync(k) { data.delete(k) }
