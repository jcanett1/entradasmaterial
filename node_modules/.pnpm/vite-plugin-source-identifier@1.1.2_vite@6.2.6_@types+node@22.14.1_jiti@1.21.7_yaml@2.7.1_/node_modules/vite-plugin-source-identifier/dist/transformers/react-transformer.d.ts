export interface ReactTransformerOptions {
    attributePrefix: string;
    includeProps: boolean;
}
export declare function transformJsx(code: string, id: string, options: ReactTransformerOptions): Promise<{
    code: string;
    map: {
        version: number;
        sources: string[];
        names: string[];
        sourceRoot?: string | undefined;
        sourcesContent?: string[] | undefined;
        mappings: string;
        file: string;
    } | null | undefined;
} | null>;
