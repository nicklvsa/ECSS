import { parse } from "https://deno.land/std@0.50.0/flags/mod.ts";
import { JSSData, JSSVar, JSSDefinition, JSSStruct } from "./types.d.ts";

const { args } = Deno;
const parsed = parse(args);

const vars: JSSVar[] = [];
const defs: JSSDefinition[] = [];
const structs: JSSStruct[] = [];

let inputFile: string = '';
let outputFile: string = '';

//parseJss - parse the css and preprocessed mixins
const parseECSS = async (data: string): Promise<JSSData> => {
    const response: JSSData = {input: inputFile, output: outputFile, contents: ''};
    const firstParse: JSSData = {input: inputFile, output: outputFile, contents: ''};
    const secondParse: JSSData = {input: inputFile, output: outputFile, contents: ''};
    const thirdParse: JSSData = {input: inputFile, output: outputFile, contents: ''};
    const byLine: string[] = data.split(/\r\n|\r|\n/g);
    for (let [_, line] of byLine.entries()) {

        // convert single line comments into multi-line plain css comments
        if (line.startsWith('//') || line.includes('//')) {
            const comment = line.substring(line.indexOf('//'), line.length).trim();
            line = line.replace(comment, `/* ${comment.replace('//', '').trim()} */`);
        }

        // parse jss variables
        if (line.startsWith('$') && line.replace(/\/\*[\s\S]*?\*\//gm, '').trim().endsWith(';')) {
            const val = line.split(':')[1].split(';')[0];
            vars.push({
                name: line.split(':')[0].split('$')[1],
                value: val,
                origValue: val,
                public: true,
                owner: 'JSS',
                position: 0,
            });
            for (const v of vars) {
                line = line.replace(`$${v.name}:${v.value};`, '');
            }
        }
        
        // do jss variable replacement
        if (!line.startsWith('$') && line.includes('$')) {
            const variable = line.split('$')[1].split(';')[0].trim();
            for (const v of vars) {
                if (variable === v.name && v.owner === 'JSS' && v.public) {
                    line = line.replace(`$${v.name}`, v.value.trim());
                }
            }
        }

        firstParse.contents += line.trim() + '\n';
    }

    const firstIter = firstParse.contents.split(/\r\n|\r|\n/g);
    for (let line of firstIter) {
        // parse classes
        if (line.startsWith('.') && !line.startsWith('#') && line.replace(/\/\*[\s\S]*?\*\//gm, '').trim().endsWith('{')) {
            const defName: string = line.split('.')[1].split('{')[0].trim();

            const matcher: RegExp = new RegExp(`\\.${defName} {[^\0]*?}`, 'gm');
            if (line.startsWith(`.${defName}`)) {
                if (matcher.test(firstParse.contents)) {
                    const style: JSSDefinition = {
                        type: 'class',
                        name: defName,
                        contents: firstParse.contents.match(matcher)!.toString() || '',
                    };
                    defs.push(style);
                }
            }
        }

        // parse ids
        if (line.startsWith('#') && !line.startsWith('.') && line.replace(/\/\*[\s\S]*?\*\//gm, '').trim().endsWith('{')) {
            const defName: string = line.split('#')[1].split('{')[0].trim();

            const matcher: RegExp = new RegExp(`#${defName} {[^\0]*?}`, 'gm');
            if (line.startsWith(`#${defName}`)) {
                if (matcher.test(firstParse.contents)) {
                    const style: JSSDefinition = {
                        type: 'id',
                        name: defName,
                        contents: firstParse.contents.match(matcher)!.toString() || '',
                    };
                    defs.push(style);
                }
            }
        }

        secondParse.contents += line.trim() + '\n';
    }

    const secondIter = secondParse.contents.split(/\r\n|\r|\n/g);
    for (let line of secondIter) {
        // do @ functions
        if (line.trim().startsWith('@')) {
            const action = line.split('@')[1].split('<')[0].trim();
            switch (action) {
                case "impl":
                    line = recurFindExtenders(line);
                    break;
                case "struct":
                    let structDef = '';

                    const type: string = line.split('<')[1].split('>')[0].trim(); // if empty, will assume all types
                    const structName: string = line.split('>')[1].split('(')[0].trim();
                    const structParams: string = line.split('(')[1].split(')')[0].trim(); // comma separate list
                    const matcher: RegExp = new RegExp(`@struct<${type}> ${structName} \\(${structParams.replace(/\$/g, '\\$').replace('(', '\\(').replace(')', '\\)')}\\) {[^\0]*?}`, 'gm');

                    if (line.startsWith(`@struct`)) {
                        if (matcher.test(secondParse.contents)) {
                            structDef += secondParse.contents.match(matcher);
                        }
                    }

                    const parseParams = structParams.split(',');
                    parseParams.forEach((e, i, a) => {
                        a[--i] += ',';
                    });

                    if (parseParams.length > 0) {
                        for (let [i, param] of parseParams.entries()) {
                            param = param.trim();
                            if (param.startsWith('$')) {

                                if (param.includes(':')) {
                                    if (param.includes(',')) {
                                        const val = param.split(':')[1].split(',')[0];
                                        const variable: JSSVar = {
                                            name: param.split(':')[0].split('$')[1],
                                            value: val,
                                            origValue: val,
                                            public: false,
                                            owner: structName,
                                            position: i,
                                        }
                                        vars.push(variable);
                                    } else {
                                        const val = param.split(':')[1];
                                        const variable: JSSVar = {
                                            name: param.split(':')[0].split('$')[1],
                                            value: val,
                                            origValue: val,
                                            public: false,
                                            owner: structName,
                                            position: i,
                                        }
                                        vars.push(variable);
                                    }
                                } else {
                                    if (param.includes(',')) {
                                        const variable: JSSVar = {
                                            name: param.split('$')[1].split(',')[0],
                                            value: '',
                                            origValue: '',
                                            public: false,
                                            owner: structName,
                                            position: i,
                                        }
                                        vars.push(variable);
                                    } else {
                                        const variable: JSSVar = {
                                            name: param.split('$')[1],
                                            value: '',
                                            origValue: '',
                                            public: false,
                                            owner: structName,
                                            position: i,
                                        }
                                        vars.push(variable);
                                    }
                                }
                            }
                        }
                    }

                    let def: JSSDefinition = {
                        name: structName,
                        type: 'struct',
                        contents: structDef,
                    };

                    defs.push(def);
                    break;
                case "if":
                    
                    let compare = line.split('>')[1].split('{')[0].trim();
                    const ifMatcher: RegExp = new RegExp(`@if<> ${compare.replace('$', '\\$')} {[^\0]*?}`, 'gm');

                    for (const v of vars) {
                        if (compare.includes(`$${v.name}`)) {
                            compare = compare.replace(`$${v.name}`, typeof v.value == 'number' ? v.value : `'${v.value.trim()}'`);
                        }
                    }

                    if (line.startsWith(`@if`)) {
                        if (ifMatcher.test(secondParse.contents)) {
                            let def: JSSDefinition = {
                                name: compare,
                                type: 'if',
                                contents: secondParse.contents.match(ifMatcher)!.toString() || '',
                            };
                            defs.push(def);
                        }
                    }
                    break;
                default:
                    line = '/* invalid action replaced here */';
                    break;
            }
        }
        thirdParse.contents += line.trim() + '\n';
    }

    for (const d of defs) {
        if (d.type === 'struct') {
            thirdParse.contents = thirdParse.contents.replace(d.contents, '');
        }
        if (d.type === 'if') {
            if (eval(d.name)) {
                const replacer = d.contents.split('\n')[0];
                thirdParse.contents = thirdParse.contents.replace(replacer, '').replace('}', '');
            } else {
                thirdParse.contents = thirdParse.contents.replace(d.contents, '');
            }
        }
    }

    const thirdIter = thirdParse.contents.split(/\r\n|\r|\n/g);
    for (let line of thirdIter) {
        for (const d of defs) {
            if (d.type === 'struct') {
                const replacer = d.contents.split('\n')[0];
                if (line.startsWith(replacer)) {
                    line = line.replace(replacer, '');
                }
                for (const v of vars) {
                    if (line.includes(`$${v.name}`) && v.owner == d.name && !v.public) {
                        line = line.replace(`$${v.name}`, v.value.trim());
                    }
                }
            }
        }
        response.contents += line.trim() + '\n';
    }

    console.log(response.contents);
    return response;
};

const recurFindExtenders = (line: string): string => {
    let newLine: string = '';
    let type: string = line.split('<')[1].split('>')[0].trim();; 
    let extendFrom: string = line.split('>')[1].split(':')[1].split(';')[0].trim(); 
    for (const d of defs) {
        if (d.type == type && d.name == extendFrom && d.type !== 'struct' && d.type !== 'if') {
            let defContents = d.contents.replace(`${getCSSOperator(d.type)}${d.name} {`, '').replace('}', '').trim();
            newLine = line.replace(`@impl<${d.type}>: ${d.name};`, defContents).trim();
        } else if (d.type == 'struct') {
            const newExt = extendFrom.split('(')[0].trim();
            if (d.name == newExt) {
                try {
                    const args = extendFrom.split('(')[1].split(')')[0];
                    const name = extendFrom.replace(`(${args})`, '');
                    if (args.length > 0) {
                        const argIter = args.split(',');
                        for (let i = 0; i < argIter.length; i++) {
                            for (const v of vars) {
                                if (v.position == i && v.owner == name && !v.public) {
                                    // console.log(d.contents);
                                    if (argIter[i].trim() !== '_') {
                                        v.value = argIter[i];
                                    }
                                    if (argIter[i].trim().startsWith('$')) {
                                        const varReplacer = argIter[i].trim().split('$')[1].trim();
                                        v.value = getVar(varReplacer, 'JSS');
                                    }
                                }
                            }
                        }
                        newLine = line.replace(`@impl<${d.type}>: ${d.name}(${args});`, d.contents.replace('}', '')).trim();
                    }
                } catch (e) {
                    for (const v of vars) {
                        if (!v.public) {
                            v.value = v.origValue;
                        }
                    }
                    let defContents = d.contents.replace(`${getCSSOperator(d.type)}${d.name} {`, '').replace('}', '').trim();
                    newLine = line.replace(`@impl<${d.type}>: ${d.name};`, defContents).trim();
                }
            }
        }
    }
    
    if (!newLine.includes('@impl')) {
        return newLine;
    }
    return recurFindExtenders(newLine);
};

const getVar = (name: string, owner: string): string => {
    for (const v of vars) {
        if (v.name === name && v.owner === owner) {
            return v.value;
        }
    }
    return '';
};

const getCSSOperator = (type: string) => {
    let operator = '';
    switch (type) {
        case 'id':
            operator = '#';
            break;
        case 'class':
            operator = '.';
            break;
        case 'struct':
            break;
        default:
            operator = '.';
            break;
    }
    return operator;
};

const writeOutput = async (data: JSSData): Promise<void> => {
    const encoder = new TextEncoder();
    const encData = encoder.encode(data.contents);
    Deno.writeFile(data.output, encData, {create: true});
};

const readInput = async (fileInput: string): Promise<string> => {
    const decoder = new TextDecoder("utf-8");
    const encData = await Deno.readFile(fileInput);
    return decoder.decode(encData);
};

const displayFormattedHelp = () => {
    return `
        JSS v0.1
        -> Help <-
        Available cli arguments:
            -h, --help: "display this help message"
            -i, --input: "define the beginning of the input file"
            -o, --output: "define the beginning of the ouput file"
    `;
}

//parseJss main entry point
if (import.meta.main) {
    (async () => {
        switch (Object.keys(parsed)[1]) {
            case "h":
            case "help":
                console.log(displayFormattedHelp());    
                break;
    
            case "i":
            case "input":
                if (Object.keys(parsed).length > 1) {
                    inputFile = parsed.i || parsed.input;
                }
                break;
    
            case "o":
            case "output":
                if (Object.keys(parsed).length > 2) {
                    outputFile = parsed.o || parsed.output;
                }
                break;
            
            default:
                console.log(displayFormattedHelp());    
                break;
        }

        if (inputFile !== '' && inputFile.length > 0) {

            const data = await readInput(inputFile);
            const response = await parseECSS(data);

            if (outputFile !== '' && outputFile.length > 0) {
                await writeOutput(response);
            }
        }

    })();
}