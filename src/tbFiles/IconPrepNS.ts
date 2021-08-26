
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
    let hasIcon = false
    if(fs.existsSync(path.join(srcLiDir, 'product.jpg'))) {
        console.log('copying product.jpg')
        fs.copyFileSync(path.join(srcLiDir, 'product.jpg'), path.join(dstLiDir, 'splash.jpg'))
    }
    if(fs.existsSync(path.join(srcLiDir, 'icon.png'))) {
        console.log('copying icon.png')
        fs.copyFileSync(path.join(srcLiDir, 'icon.png'), path.join(dstLiDir, 'icon.png'))
        hasIcon = true
    }
    console.log('generating splash screens')
    const wait = []
    wait.push(executeCommand('ns resources generate splashes', ['splash.jpg'], destDir))
    const iconSrc = hasIcon ? 'icon.png' : 'product.jpg'
    wait.push(executeCommand('ns resources generate icons', [iconSrc], destDir))
    return Promise.all(wait).then(() => {
        console.log('generation complete')
    })

}