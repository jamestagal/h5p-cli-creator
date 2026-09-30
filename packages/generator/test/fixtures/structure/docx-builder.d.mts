// Types for docx-builder.mjs, which stays plain JavaScript so that make-docx.mjs runs under node without a build.
export const W: string;
export function run(text: string): string;
export function p(content: string, props?: string): string;
export function para(text: string): string;
export function heading(level: number, text: string): string;
export function item(numId: number | string, ilvl: number | string, text: string): string;
export function tc(content: string, props?: string): string;
export function tr(cells: string[], header?: boolean): string;
export function tbl(rows: string[], cols: number): string;
export function footnoteRef(id: number | string): string;
export function endnoteRef(id: number | string): string;
export const BODY: string[];
export const ABSTRACT_NUMS: string[];
export const NUMS: string[];
export const STYLES: string[];
export const FOOTNOTES: string[];
export const ENDNOTES: string[];
export interface PartOverrides { body?: string[]; abstractNums?: string[]; nums?: string[]; styles?: string[]; footnotes?: string[]; endnotes?: string[] }
export function structureParts(overrides?: PartOverrides): Record<string, string>;
export function zipDocx(parts: Record<string, string>): Promise<Buffer>;
