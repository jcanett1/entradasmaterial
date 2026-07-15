import { Plugin } from 'vite';
export interface SourceIdentifierOptions {
    /**
     * Whether to enable the plugin (default: true in development, false in production)
     */
    enabled?: boolean;
    /**
     * Custom prefix for data attributes (default: "data-lov")
     */
    attributePrefix?: string;
    /**
     * Whether to include component props in data-component-content (default: true)
     */
    includeProps?: boolean;
    /**
     * File extensions to process (default: ['.jsx', '.tsx', '.vue'])
     */
    include?: string[];
    /**
     * File patterns to exclude
     */
    exclude?: string[];
}
export declare function sourceIdentifierPlugin(options?: SourceIdentifierOptions): Plugin;
export default sourceIdentifierPlugin;
