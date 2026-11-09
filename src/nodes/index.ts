import { registerIn } from './in'
import { registerMachine } from './machine'
import { registerOut } from './out'
import { registerMonitor } from '../runtime/monitor'

function register(RED: any): void {
  registerMachine(RED)
  registerIn(RED)
  registerOut(RED)
  registerMonitor(RED)
}

module.exports = register
