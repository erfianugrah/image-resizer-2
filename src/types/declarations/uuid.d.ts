/**
 * Type declarations for uuid module
 */
declare module 'uuid' {
  /**
   * Generate a v4 UUID (random)
   */
  export function v4(): string;
  
  /**
   * Generate a v5 UUID (namespace)
   */
  export function v5(name: string, namespace: string | number[]): string;
  
  /**
   * Validate a UUID
   */
  export function validate(uuid: string): boolean;
  
  /**
   * Parse a UUID
   */
  export function parse(uuid: string): number[];
  
  /**
   * Convert array to UUID
   */
  export function unparse(arr: number[]): string;
  
  /**
   * Generate a v1 UUID (timestamp)
   */
  export function v1(): string;
}