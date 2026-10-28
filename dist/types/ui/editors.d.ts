import type { BuiltInEditor, Column, CustomEditor } from '../types.js';
export declare const EDITORS: Record<BuiltInEditor, CustomEditor>;
export declare function resolveEditor(column: Column, isFormula: boolean): CustomEditor;
//# sourceMappingURL=editors.d.ts.map