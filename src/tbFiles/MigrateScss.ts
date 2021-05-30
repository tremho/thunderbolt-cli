
const emSize = 15;

export function translateScss(scss:string, className:string):string {
    let out = ''
    const lines = scss.split('\n')
    lines.forEach(line => {
        let indent = 0
        while(line.charAt(indent) === ' ') indent++
        line = line.trim()
        if(line.substring(0, 5) === ':host') {
            line = line.replace(':host', '.'+className)
        }
        if(line.indexOf('px') !== -1) {
            line = line.replace('px', '')
        }
        //
        let di = line.indexOf(':')
        if(di !== -1) {
            let prop = line.substring(0, di)
            let expression = line.substring(di + 1)
            let xexp = translateScssExpression(expression)
            line = prop + ': ' + xexp
        }
        if(indent) out += ' '.repeat(indent)
        out += line+'\n'
    })
    // console.log("---------------")
    // console.log(scss)
    // console.log("------")
    // console.log(out)
    // console.log("==============")
    return out
}

export function translateScssExpression(expression:string):string {
    let out = ''
    const parts = expression.trim().split(' ')
    parts.forEach(exp => {
        let digs = ''
        let unit = ''
        let i = -1;
        const cc0 = '0'.charCodeAt(0)
        const cc9 = '9'.charCodeAt(0)
        while (++i < exp.length) {
            if ((exp.charCodeAt(i) >= cc0 && exp.charCodeAt(i) <= cc9)
                || exp.charAt(i) === '.' || exp.charAt(i) === '-') {
                digs += exp.charAt(i)
            }
            else break;
        }
        let value:number|string = Number(digs)
        if(!digs || isNaN(value)) {
            // console.log('passing through '+expression)
            value = '';
            unit = exp
        }  else {
            unit = exp.substring(i)
            let hasSemicolon = (unit.charAt(unit.length - 1) === ';')
            if (hasSemicolon) unit = unit.substring(0, unit.length - 1)
            if (unit === 'px') unit = ''
            else if (unit === 'em' || unit === 'rem') {
                value *= emSize
                unit = ''
            } else if (unit === 'in') {
                value *= 96 // pixels per inch per CSS
                unit = ''
            } else if (unit === 'pt') {
                value *= 96 / 72 // one point is 1/72 inch
                unit = ''
            } else if (unit === 'pc') {
                // pica is 12 points
                value *= 12 * 96 / 72
                unit = ''
            } else if (unit === 'cm') {
                // cm to inch to pixel
                value *= 0.39370079 * 96
                unit = ''
            } else if (unit === 'mm') {
                // mm to inch to pixel
                value *= 0.039370079 * 96
                unit = ''
            }
            if (hasSemicolon) unit += ';'
        }
        // console.log('converted '+expression+' to '+ value + unit)
        if (out) out += ' '
        out += value + unit
    })
    return out
}