import { parse } from "https://deno.land/std@0.50.0/flags/mod.ts";
import { JSSData, JSSVar, JSSDefinition } from "./types.d.ts";

const { args } = Deno;
const parsed = parse(args);

const vars: JSSVar[] = [];
const defs: JSSDefinition[] = [];

let inputFile: string = '';
let outputFile: string = '';

//parseJss - parse the css and preprocessed mixins
const parseECSS = async (data: string): Promise<JSSData> => {
    const response: JSSData = {input: inputFile, output: outputFile, contents: ''};
    const firstParse: JSSData = {input: inputFile, output: outputFile, contents: ''};
    const secondParse: JSSData = {input: inputFile, output: outputFile, contents: ''};
    const byLine: string[] = data.split(/\r\n|\r|\n/g);
    for (let [_, line] of byLine.entries()) {

        // convert single line comments into multi-line plain css comments
        if (line.startsWith('//') || line.includes('//')) {
            const comment = line.substring(line.indexOf('//'), line.length).trim();
            line = line.replace(comment, `/* ${comment.replace('//', '').trim()} */`);
        }

        // parse jss variables
        if (line.startsWith('$') && line.replace(/\/\*[\s\S]*?\*\//gm, '').trim().endsWith(';')) {
            vars.push({
                name: line.split(':')[0].split('$')[1],
                value: line.split(':')[1].split(';')[0],
            });
            for (const v of vars) {
                line = line.replace(`$${v.name}:${v.value};`, '');
            }
        }
        
        // do jss variable replacement
        if (!line.startsWith('$') && line.includes('$')) {
            const variable = line.split('$')[1].split(';')[0].trim();
            for (const v of vars) {
                if (variable === v.name) {
                    line = line.replace(`$${v.name}`, v.value.trim());
                }
            }
        }

        firstParse.contents += line.trim() + '\n';
    }

    const firstIter = firstParse.contents.split(/\r\n|\r|\n/g);
    for (let line of firstIter) {
        // parse classes
        if (line.startsWith('.') && line.replace(/\/\*[\s\S]*?\*\//gm, '').trim().endsWith('{')) {
            let styleDef = '';
            const defName: string = line.split('.')[1].split('{')[0].trim();

            const matcher: RegExp = new RegExp(`.${defName} {[^\0]*?}`, 'gm');
            if (line.startsWith(`.${defName}`)) {
                if (matcher.test(firstParse.contents)) {
                    styleDef += firstParse.contents.match(matcher);
                }
            }

            const style: JSSDefinition = {
                type: 'class',
                name: defName,
                contents: styleDef
            };
            defs.push(style);
        }

        // parse ids
        if (line.startsWith('#') && line.replace(/\/\*[\s\S]*?\*\//gm, '').trim().endsWith('{')) {
            let styleDef = '';
            const defName: string = line.split('#')[1].split('{')[0].trim();

            const matcher: RegExp = new RegExp(`#${defName} {[^\0]*?}`, 'gm');
            if (line.startsWith(`#${defName}`)) {
                if (matcher.test(firstParse.contents)) {
                    styleDef += firstParse.contents.match(matcher);
                }
            }

            const style: JSSDefinition = {
                type: 'id',
                name: defName,
                contents: styleDef
            };
            defs.push(style);
        }

        secondParse.contents += line.trim() + '\n';
    }

    const secondIter = firstParse.contents.split(/\r\n|\r|\n/g);
    for (let line of secondIter) {
        // do @ functions
        if (line.trim().startsWith('@')) {
            const action = line.split('@')[1].split('<')[0].trim();
            switch (action) {
                case "extend":
                    line = recurFindExtenders(line);
                    break;
                default:
                    line = '/* invalid action replaced here */';
                    break;
            }
        }
        response.contents += line.trim() + '\n';
    }

    console.log(response.contents);
    return response;
};

const getCSSOperator = (type: string) => {
    return (type === 'id' ? '#' : '.');
};

const recurFindExtenders = (line: string): string => {
    let newLine: string = '';
    const type: string = line.split('<')[1].split('>')[0].trim();
    const extendFrom: string = line.split('>')[1].split(':')[1].split(';')[0].trim();
    for (const d of defs) {
        if (d.type == type && d.name == extendFrom) {
            let defContents = d.contents.replace(`${getCSSOperator(d.type)}${d.name} {`, '').replace('}', '').trim();
            newLine = line.replace(`@extend<${d.type}>: ${d.name};`, defContents).trim();
        } else if (d.name == extendFrom && d.type != type) {
            newLine = `/* did you mean to use type "${getCSSOperator(d.type)}" for @extend selector "${d.name}"? */`;
        }
    }
    if (!newLine.includes('@extend')) {
        return newLine;
    }
    return recurFindExtenders(newLine);
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