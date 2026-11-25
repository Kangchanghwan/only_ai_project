import '../tools.css'
import { trackEvent } from '../ga.js'
import { initHost } from './host.js'

initHost({ track: trackEvent })
