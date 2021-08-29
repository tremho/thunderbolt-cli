#!/usr/bin/env node

import * as ac from 'ansi-colors'
import * as process from 'process'

import {doInit} from "./init"
import {doHelp} from "./help"
import {doBuild} from "./build"
import {doRun} from "./run"
import {doDoc} from "./doc"
import {doTest} from "./test"
import {doValidate} from "./validate"
import {doNativeScript} from "./exportNS"
import {doDist} from "./dist";

const command = process.argv[2] || 'help'
const args = process.argv.slice(3)

function processCommand() {
  printBanner(command)
  switch (command) {
    case 'init':
      return doInit()
    case 'help':
      return doHelp(args[0] || '')
    case 'build':
      return doBuild()
    case 'run':
      return doRun()
    case 'doc':
      return doDoc()
  case 'validate':
      return doValidate()
    case 'test':
      return doTest()
    case 'nativescript':
      return doNativeScript()
    case 'dist':
      return doDist(args)
    default:
      return doUnknown(command)
  }
}

function printBanner(cmd:string) {
    let out = '  ' + ac.green('╭───────────────────────────────────────────────────────────────╮')+'\n'
       out += '  ' + ac.green('|                                                               |')+'\n'
       out += '  ' + ac.green('|                               Jove                            |')+'\n'
       out += '  ' + ac.green('|                                                               |')+'\n'
       out += '  ' + ac.green('╰───────────────────────────────────────────────────────────────╯')+'\n'
       out += '  ' + ac.bold.green(cmd)
       out += '\n'

       console.log(out)
}

function doUnknown(command:string) {
  printBanner('Unknown Command')
  console.log(ac.red.bold(`Unrecognized command ${command || ''}`))
  console.log(ac.grey.dim('try'))
  console.log(ac.blue.dim('help, init, build, run, doc, validate, test, nativescript'))
  console.log('')
}

processCommand()