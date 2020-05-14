export interface JSSData {
    contents: string;
    input: string;
    output: string;
}

export interface JSSVar {
    name: string;
    origValue: string;
    value: string;
    public: boolean;
    owner: string;
    position: number;
}

export interface JSSStruct {
    name: string;
    type: string;
    contents: string;
    params: {};
}

export interface JSSDefinition {
    type: string;
    name: string;
    contents: string;
}