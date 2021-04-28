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
const command = process.argv[2]
const args = process.argv.slice(3)

function processCommand() {
  switch (command) {
    case 'init':
      return doInit()
    case 'help':
      printBanner()
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
    default:
      return doUnknown(command)
  }
}

function printBanner() {
    let out = '  ' + ac.green('╭───────────────────────────────────────────────────────────────╮')+'\n'
       out += '  ' + ac.green('|                                                               |')+'\n'
       out += '  ' + ac.green('|                     Thunderbolt Framework                     |')+'\n'
       out += '  ' + ac.green('|                                                               |')+'\n'
       out += '  ' + ac.green(`| ${ac.magenta(`version ${ac.gray(`1.0.0`)}`)}                                                 |`) +'\n'
       out += '  ' + ac.green('|                                                               |')+'\n'
       out += '  ' + ac.green('╰───────────────────────────────────────────────────────────────╯')+'\n'

       console.log(out)
}

function doUnknown(command:string) {
  printBanner()
  console.log(ac.red.bold(`Unrecognized command ${command || ''}`))
  console.log(ac.grey.dim('try'))
  console.log(ac.blue.dim('help, init, build, run, doc, validate, test, nativescript'))
  console.log('')
}

processCommand()