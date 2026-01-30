class RoomHealthService {
  constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
  }

  async checkRoom(roomNr) {
    try {
      const response = await fetch(
        `${this.apiUrl}/api/room/${roomNr}/status`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (!response.ok) return { exists: false, userCount: 0 }
      const data = await response.json()
      return { exists: data.exists, userCount: data.userCount }
    } catch (error) {
      return { exists: false, userCount: 0, error: error.message }
    }
  }
}

export const roomHealthService = new RoomHealthService()
