export interface VueTransformerOptions {
    attributePrefix: string;
    includeProps: boolean;
}
export declare function transformVue(code: string, id: string, options: VueTransformerOptions): {
    code: string;
    map: import("magic-string").SourceMap;
} | null;
