import path from "path";
import fs from "fs";


export function getReleaseNotes(rnFile:string) {
    let mdContent = ''
    try {
        mdContent = fs.readFileSync(rnFile).toString()
    } catch(e) {
        mdContent = ''
    }
    let b = mdContent.indexOf('# Release Notes')
    if(b !== -1) b = mdContent.indexOf('\n', b)
    let n = mdContent.indexOf('#', b)
    if (n === -1) n = mdContent.length;
    const common = mdContent.substring(b, n).trim()
    b = mdContent.indexOf('# iOS Notes')
    if(b !== -1) b = mdContent.indexOf('\n', b)
    n = mdContent.indexOf('#', b)
    if (n === -1) n = mdContent.length;
    let ios = mdContent.substring(b, n).trim()
    b = mdContent.indexOf('# Android Notes')
    if(b !== -1) b = mdContent.indexOf('\n', b)
    n = mdContent.indexOf('#', b)
    if (n === -1) n = mdContent.length;
    let android = mdContent.substring(b, n).trim()
    b = mdContent.indexOf('# Desktop Notes')
    if(b !== -1) b = mdContent.indexOf('\n', b)
    n = mdContent.indexOf('#', b)
    if (n === -1) n = mdContent.length;
    let desktop = mdContent.substring(b, n).trim()
    b = mdContent.indexOf('# Coming Soon')
    if(b !== -1) b = mdContent.indexOf('\n', b)
    n = mdContent.indexOf('#', b)
    if (n === -1) n = mdContent.length;
    let comingSoon = mdContent.substring(b, n).trim()
    return {
        common,
        ios,
        android,
        desktop,
        comingSoon
    }

}