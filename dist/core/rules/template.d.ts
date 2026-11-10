export declare const MAX_TEMPLATE_LENGTH = 255;
export type TokenResolver = (token: string, argument: string | undefined) => string;
export declare function expandTemplate(template: string, allowedTokens: readonly string[], resolve: TokenResolver): string;
export declare function assertValidTemplate(template: string, allowedTokens: readonly string[]): void;
