
import * as fs from 'fs'
import * as path from 'path'
import {executeCommand} from "../execCmd";

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
export function iconPrepNS(srcDir:string, destDir:string) {

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
        wait.push(executeCommand('ns resources generate splashes', [path.join('launch-icons', 'splash.jpg')], destDir))

        const iconsrc = hasIcon ? path.join('launch-icons','icon.png') : path.join('launch-icons','splash.jpg')
        // console.log('generating icons')
        wait.push(executeCommand('ns resources generate icons', [iconsrc], destDir))
    }
    return Promise.all(wait).then(() => {
        // console.log('generation complete')
    })

}