export function pascalCase(name:string) {
    let out = ''
    name.split('-').forEach(p => {
        out += p.charAt(0).toUpperCase()+p.substring(1).toLowerCase()
    })
    return out
}
export function camelCase(name:string) {
    let pc = pascalCase(name)
    return pc.charAt(0).toLowerCase()+pc.substring(1)
}
export function hyphenate(name:string) {
    let out = ''
    let i = 1
    let last = 0
    while(i < name.length) {
        if(name.charAt(i) === name.charAt(i).toUpperCase()) {
            out += name.substring(last, i).toLowerCase()+'-'
            last = i
        }
    }
    return out
}
