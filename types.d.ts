export interface JSSData {
    contents: string;
    input: string;
    output: string;
}

export interface JSSVar {
    name: string;
    value: string;
}


export interface JSSDefinition {
    type: string;
    name: string;
    contents: string;
}