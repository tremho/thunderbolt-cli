/**
 * This implements the mechanism by which workers are created and accessed in Jove.
 * This technique works around some limitations of the environments, such as
 * not being able to support Node style workers.
 * This technique is closer to the ECMA standard mechanism for workers, which is originally
 * conceived for a browser context, so we take some liberties.
 * This could probably be updated to be more integrated into Webpack than to use the loose .js files
 * for the resulting worker code, but I couldn't figure that out in a pinch, so that remains a
 * possible update for another day.
 *
 * The way this works is this:
 * Worker files go into a folder named src/workerstuff.
 * These worker files must have the extension .tsw.  Editors should be set up to treat .tsw files as Typescript.
 * (we don't name them .ts because we want to exclude them from the normal typescript build step.
 * again, this could probably be finessed better with configuration of our tsc task).
 * The .tsw files must fit a certain pattern.
 * - must declare a namespace object
 * - must contain a load function
 * - load factory must create a module object that defines the module (see examples)
 * - if imports are needed, these must be imported .js files similarly created
 * - must contain `onMessageFromMain` and `setupWorker` functions
 * - namespace object must export all api functions
 *
 * Look at existing examples for better explanation.
 *
 */

import * as path from "path";
import * as fs from "fs";
import {gatherInfo} from './gatherInfo'
import {tscCompile} from "./build";
import * as ac from 'ansi-colors'

function trace(msg:string) {
    console.log(ac.green.bold("MakeWorker"),"-",ac.blue.italic(msg))
}

export function makeWorkers()
{
    const info = gatherInfo()
    const workerstuff = path.join(info.projPath, 'src', 'workerstuff')
    if(fs.existsSync(workerstuff)) {
        trace(`workerstuff path = ${workerstuff}`);
        const workerFiles:string[] = []
        const files = fs.readdirSync(workerstuff)
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            trace(`considering ${file}`)
            if (file.substring(file.lastIndexOf('.')) === '.tsw') {
                trace(`queueing ${file}`)
                let ren = file.replace(".tsw", ".ts")
                trace(`renaming ${file} to ${ren}`)
                fs.renameSync(path.join(workerstuff, file), path.join(workerstuff, ren));
                workerFiles.push(ren)
            }
        }
        trace(`workerFiles: ${workerFiles}`)
        if (!workerFiles.length) return Promise.resolve();
        const outDir = info.buildPath;
        trace(`outdir: ${outDir}`)
        trace('executing tscCompile')
        const keep = workerFiles.slice();
        return tscCompile({outDir, cwd: workerstuff, target: 'es5', lib: 'es2015,dom'}, workerFiles).then(() => {
            trace(`tscCompile complete, now doing verification and cleanup: ${keep}`)
            for (let file in keep) {
                trace(file);
                let verf = file.replace(".ts", '.js')
                let dverf = path.join(outDir, verf);
                let v = fs.existsSync(dverf)
                if(v) {
                    console.log(ac.blue.italic(verf),ac.green.bold("VERIFIED"));
                } else {
                    // see if we just need to move it
                    let lverf = path.join(workerstuff, verf);
                    if(fs.existsSync(lverf)) {
                        trace("tsc built this locally -- moving to build directory...")
                        fs.renameSync(lverf, dverf);
                        if(fs.existsSync(dverf)) {
                            trace("move successful")
                        } else {
                            trace("failed to move")
                        }
                    } else {
                        console.log(ac.blue.italic(verf), ac.red.bold("FAILED TO BUILD"));
                    }
                }
                let ren = file.replace(".ts", ".tsw")
                trace(`renaming ${file} to ${ren}`)
                fs.renameSync(path.join(workerstuff, file), path.join(workerstuff, ren));
            }
        })
    }
    return Promise.resolve();
}

// cd src/workerstuff
// find tsw files
// rename to ts
// tsc these files
// mv *.js ../../build/front
// rename back to .tsw
