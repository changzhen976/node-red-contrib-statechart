import { registerIn } from './in'
import { registerMachine } from './machine'
import { registerOut } from './out'

function register(RED: any): void {
  registerMachine(RED)
  registerIn(RED)
  registerOut(RED)
}

module.exports = register
