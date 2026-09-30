// Types for odt-builder.mjs, which stays plain JavaScript so that make-odt.mjs runs under node without a build.
export const XMLNS: string;
export function t(text: string): string;
export function p(content?: string): string;
export function para(text: string): string;
export function h(level: number, text: string): string;
export function list(style: string | null, items: Array<string | [string, string]>, attrs?: string): string;
export function cell(content: string, attrs?: string): string;
export const covered: string;
export function row(cells: string[]): string;
export function table(name: string, cols: number, rows: string[], headerRows?: string[]): string;
export function note(id: string, cls: "footnote" | "endnote", citation: string, body: string): string;
export const BODY: string[];
export const AUTOMATIC_STYLES: string[];
export const STYLES: string[];
export interface OdtPartOverrides { body?: string[]; automaticStyles?: string[]; styles?: string[] }
export function structureOdtParts(overrides?: OdtPartOverrides): Record<string, string>;
export function zipOdt(parts: Record<string, string>): Promise<Buffer>;
