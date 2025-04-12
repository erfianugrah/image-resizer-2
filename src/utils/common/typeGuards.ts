/**
 * Common Type Guards
 * 
 * This file contains type guard utilities that are used across the application.
 * Instead of duplicating these functions in multiple services, they're centralized here.
 */

/**
 * Type guard to check if a value is an Error
 * 
 * @param value The value to check
 * @returns True if the value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Type guard to check if a value is a non-null object
 * 
 * @param value The value to check
 * @returns True if the value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if a value is a string
 * 
 * @param value The value to check
 * @returns True if the value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a number
 * 
 * @param value The value to check
 * @returns True if the value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard to check if a value is a boolean
 * 
 * @param value The value to check
 * @returns True if the value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard to check if a value is a Record with string keys
 * 
 * @param value The value to check
 * @returns True if the value is a Record with string keys
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value);
}

/**
 * Type guard to check if a value has a property
 * 
 * @param value The value to check
 * @param property The property to check for
 * @returns True if the value has the property
 */
export function hasProperty<K extends string>(value: unknown, property: K): value is { [P in K]: unknown } {
  return isObject(value) && property in value;
}

/**
 * Type guard to check if a value is a function
 * 
 * @param value The value to check
 * @returns True if the value is a function
 */
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Type guard to check if a value is an array
 * 
 * @param value The value to check
 * @returns True if the value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard to check if a value is a string array
 * 
 * @param value The value to check
 * @returns True if the value is a string array
 */
export function isStringArray(value: unknown): value is string[] {
  return isArray(value) && value.every(isString);
}

/**
 * Type guard to check if a value is a number array
 * 
 * @param value The value to check
 * @returns True if the value is a number array
 */
export function isNumberArray(value: unknown): value is number[] {
  return isArray(value) && value.every(isNumber);
}

/**
 * Type guard to check if a value is undefined
 * 
 * @param value The value to check
 * @returns True if the value is undefined
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * Type guard to check if a value is null
 * 
 * @param value The value to check
 * @returns True if the value is null
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * Type guard to check if a value is null or undefined
 * 
 * @param value The value to check
 * @returns True if the value is null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return isNull(value) || isUndefined(value);
}

/**
 * Type guard to check if a value is a Date
 * 
 * @param value The value to check
 * @returns True if the value is a Date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

/**
 * Type guard to check if a value is a valid Date
 * 
 * @param value The value to check
 * @returns True if the value is a valid Date
 */
export function isValidDate(value: unknown): value is Date {
  return isDate(value) && !isNaN(value.getTime());
}

/**
 * Type guard to check if a value is a Promise
 * 
 * @param value The value to check
 * @returns True if the value is a Promise
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return value instanceof Promise || 
    (value !== null && typeof value === 'object' && 'then' in value && typeof (value as any).then === 'function');
}