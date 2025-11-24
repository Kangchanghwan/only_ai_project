/**
 * Environment-aware logging utility
 * In production, only errors are logged to reduce noise and improve performance
 */

const isProduction = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'

/**
 * Format timestamp in ISO format
 */
const getTimestamp = (): string => {
  return new Date().toISOString()
}

/**
 * Logger utility with environment-based filtering
 */
export const logger = {
  /**
   * Log general information (disabled in production and test)
   */
  log: (...args: any[]): void => {
    if (!isProduction && !isTest) {
      console.log(`[${getTimestamp()}]`, ...args)
    }
  },

  /**
   * Log informational messages (enabled in all environments except test)
   */
  info: (...args: any[]): void => {
    if (!isTest) {
      console.info(`[${getTimestamp()}] INFO:`, ...args)
    }
  },

  /**
   * Log warnings (enabled in all environments)
   */
  warn: (...args: any[]): void => {
    if (!isTest) {
      console.warn(`[${getTimestamp()}] WARN:`, ...args)
    }
  },

  /**
   * Log errors (enabled in all environments)
   */
  error: (...args: any[]): void => {
    if (!isTest) {
      console.error(`[${getTimestamp()}] ERROR:`, ...args)
    }
  },

  /**
   * Log debug messages (only in development)
   */
  debug: (...args: any[]): void => {
    if (!isProduction && !isTest && process.env.DEBUG) {
      console.debug(`[${getTimestamp()}] DEBUG:`, ...args)
    }
  },
}

export default logger
