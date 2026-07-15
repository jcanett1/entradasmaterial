import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';
/**
 * 从 JSX 路径中提取组件信息
 */
export declare function extractComponentInfo(path: NodePath<t.JSXOpeningElement>, filePath: string): {
    name: string;
    props: Record<string, any>;
};
/**
 * 格式化组件内容为 URL 编码的 JSON 字符串
 */
export declare function formatComponentContent(props: Record<string, any>): string;
/**
 * 判断是否为 React 组件（首字母大写）
 */
export declare function isReactComponent(name: string): boolean;
/**
 * 判断是否为 HTML 标签
 */
export declare function isHTMLTag(name: string): boolean;
