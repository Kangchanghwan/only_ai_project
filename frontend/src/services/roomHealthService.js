class RoomHealthService {
  constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  }

  async checkRoom(roomNr, { retries = 2, retryDelay = 1000 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(
          `${this.apiUrl}/api/room/${roomNr}/status`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (!response.ok) return { exists: false, userCount: 0, reachable: true }
        const data = await response.json()
        return { exists: data.exists, userCount: data.userCount, reachable: true }
      } catch (error) {
        console.warn(`[RoomHealthService] 룸 상태 확인 실패 (${attempt + 1}/${retries + 1}):`, error.message)
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, retryDelay))
        }
      }
    }
    return { exists: false, userCount: 0, reachable: false }
  }
}

export const roomHealthService = new RoomHealthService()
