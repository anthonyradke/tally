// In-memory AsyncStorage. `failNext` lets a test make the next write fail like a full disk.
const data = new Map()
const storage = {
  failNext: false,
  async getItem(k) { return data.has(k) ? data.get(k) : null },
  async setItem(k, v) { if (storage.failNext) { storage.failNext = false; throw new Error('disk full') } data.set(k, String(v)) },
  async removeItem(k) { data.delete(k) },
  clear() { data.clear() },
}
export default storage
