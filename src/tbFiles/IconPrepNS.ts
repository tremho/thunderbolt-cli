
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
    console.log('transferring files for generation')
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
    let hasProduct = false
    let srcFile = path.join(srcLiDir, 'splash.jpg')
    let dstFile = path.join(dstLiDir, 'splash.jpg')
    if(testIfNewer(srcFile, dstFile)) {
        console.log('copying product.jpg')
        fs.copyFileSync(srcFile, dstFile)
        hasProduct = true
    }
    srcFile = path.join(srcLiDir, 'icon.png')
    dstFile = path.join(dstLiDir, 'icon.png')
    if(testIfNewer(srcFile, dstFile)) {
        console.log('copying icon.png')
        fs.copyFileSync(path.join(srcLiDir, 'icon.png'), path.join(dstLiDir, 'icon.png'))
        hasIcon = true
    }
    const wait = []
    if(hasProduct) {
        console.log('generating splash screens')
        wait.push(executeCommand('ns resources generate splashes', ['splash.jpg'], destDir))
    }
    if(hasIcon) {
        console.log('generating icons')
        wait.push(executeCommand('ns resources generate icons', ['icon.png'], destDir))
    }
    return Promise.all(wait).then(() => {
        console.log('generation complete')
    })

}