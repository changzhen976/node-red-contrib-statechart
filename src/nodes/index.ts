import { registerMachine } from './machine'
import { registerHub } from './hub'
import { registerEvent } from './event'
import { registerSet } from './set'
import { registerReset } from './reset'
import { registerRead } from './read'
import { registerMonitor } from '../runtime/monitor'

function register(RED: any): void {
  registerMachine(RED)
  registerHub(RED)
  registerEvent(RED)
  registerSet(RED)
  registerReset(RED)
  registerRead(RED)
  registerMonitor(RED)
}

module.exports = register
