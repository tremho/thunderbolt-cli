
import * as fs from 'fs'
import * as path from 'path'
import {executeCommand} from "../execCmd";
import * as ac from "ansi-colors";

/*
copy launch-icons
 - splash.jpg
 - icon.png | splash.jpg

 cd to
 */

/**
 *
 * @param srcDir our Jove project root
 * @param destDir the nativescript destination root
 */
export function iconPrepNS(srcDir:string, destDir:string, bgcolor:string) {

    const srcLiDir = path.join(srcDir, 'launch-icons')
    const dstLiDir = path.join(destDir, 'launch-icons')
    // console.log('preparing for icon generation...')
    if(!fs.existsSync(dstLiDir)) {
        fs.mkdirSync(dstLiDir)
    }
    const testIfNewer = (src:string, dst:string) => {
        if(fs.existsSync(src)) {
            if(fs.existsSync(dst)) {
                const sstat = fs.lstatSync(src)
                const dstat = fs.lstatSync(dst)
                return sstat.mtimeMs > dstat.ctimeMs // newer if modified after the dest version
            } else {
                return true; // newer if destination does not exist
            }
        } else {
            return false; // not newer if source doesn't exist
        }
    }
    let hasIcon = false
    let hasSplash = false
    let srcFile = path.join(srcLiDir, 'splash.jpg') // will use for splash and also icon unless icon.png exists
    let dstFile = path.join(dstLiDir, 'splash.jpg') // 1024 x 1024
    if(testIfNewer(srcFile, dstFile)) {
        // console.log('copying splash.jpg')
        fs.copyFileSync(srcFile, dstFile)
        hasSplash = true
    }
    srcFile = path.join(srcLiDir, 'icon.png') // will use for icon if exiss, transparency is black on iOS, but transparent on Android
    dstFile = path.join(dstLiDir, 'icon.png') // 1024 x 1024  (512 x 512 will also work)
    if(testIfNewer(srcFile, dstFile)) {
        // console.log('copying icon.png')
        fs.copyFileSync(path.join(srcLiDir, 'icon.png'), path.join(dstLiDir, 'icon.png'))
        hasIcon = true
    }
    const wait:any[] = []
    if(hasSplash) {

        // console.log('generating splash screens')
        let args = [path.join('launch-icons', 'splash.jpg')]
        if(bgcolor) {
            args.push('--background')
            args.push(bgcolor)
        }
        wait.push(executeCommand('ns resources generate splashes', args, destDir))

        const iconsrc = hasIcon ? path.join('launch-icons','icon.png') : path.join('launch-icons','splash.jpg')
        // console.log('generating icons')
        wait.push(executeCommand('ns resources generate icons', [iconsrc], destDir))
    }
    return Promise.all(wait).then(() => {
        // console.log('generation complete')
        copyJoveSplash(srcDir, destDir)
    })

}

// copy the jove-level splash-background.png and splash-content.png to the app folder
function copyJoveSplash(src:string, dest:string) {
    console.log(ac.gray('copyJoveSplash'))
    // if we have a splash, copy the background and content files to the ./build/front (buildPath, web root)
    if(!fs.existsSync(dest)) fs.mkdirSync(dest)
    let splashExpected = false
    let sb = path.join(src, 'splash-background.png')
    if(fs.existsSync(sb)) {
        console.log(ac.gray('copying '+sb))
        splashExpected = true // we will use splash.jpg as content if splash-content.png is not there
        fs.copyFileSync(sb, path.join(dest, 'splash-background.png'))
        console.log(ac.blue('copied '+sb+' to '+path.join(dest, 'splash-background.png')))
    }
    let sc = path.join(src, 'splash-content.png')
    if(!fs.existsSync(sc) && splashExpected) sc = path.join(src, 'splash.jpg')
    if(fs.existsSync(sc)) {
        splashExpected = true
        console.log(ac.gray('copying '+sc))
        fs.copyFileSync(sc, path.join(dest, 'splash-content.png')) // even if we copy the jpg, we use this name. Ext doesn't matter to browser.
        console.log(ac.blue('copied '+sc+' to '+path.join(dest, 'splash-content.png')))
    }

}
