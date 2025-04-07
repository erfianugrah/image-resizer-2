/**
 * This test file has been updated to use Zod schema validation instead of
 * the removed SchemaValidator class.
 * 
 * The original SchemaValidator functionality has been replaced with Zod
 * which provides more powerful and type-safe schema validation.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Zod Schema Validation', () => {
  // Create a reusable schema
  const UserSchema = z.object({
    name: z.string(),
    age: z.number().min(0),
    email: z.string().email().optional(),
    isAdmin: z.boolean().default(false),
    roles: z.array(z.string()).default([]),
    address: z.object({
      street: z.string(),
      city: z.string(),
      zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional()
    }).optional()
  });
  
  describe('basic validation', () => {
    it('should validate a simple object successfully', () => {
      const validObject = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
        isAdmin: true,
        roles: ['user', 'editor'],
        address: {
          street: '123 Main St',
          city: 'Anytown',
          zip: '12345'
        }
      };
      
      const result = UserSchema.parse(validObject);
      expect(result).toEqual(validObject);
    });
    
    it('should throw error for invalid object', () => {
      const invalidObject = {
        name: 'John Doe',
        age: -5, // Invalid age (below minimum)
        email: 'not-an-email', // Invalid email format
        isAdmin: true,
        roles: ['user', 'editor'],
        address: {
          street: '123 Main St',
          city: 'Anytown',
          zip: '123' // Invalid zip code
        }
      };
      
      expect(() => UserSchema.parse(invalidObject)).toThrow();
    });
  });
  
  describe('type constraints', () => {
    it('should validate type constraints correctly', () => {
      const TypesSchema = z.object({
        stringProp: z.string(),
        numberProp: z.number(),
        integerProp: z.number().int(),
        booleanProp: z.boolean(),
        arrayProp: z.array(z.any()),
        objectProp: z.record(z.string(), z.any()),
        nullProp: z.null()
      });
      
      const validObject = {
        stringProp: 'test',
        numberProp: 10.5,
        integerProp: 10,
        booleanProp: true,
        arrayProp: [1, 2, 3],
        objectProp: { key: 'value' },
        nullProp: null
      };
      
      const result = TypesSchema.parse(validObject);
      expect(result).toEqual(validObject);
    });
  });
  
  describe('nested validation', () => {
    it('should validate complex nested objects', () => {
      const NestedSchema = z.object({
        user: z.object({
          id: z.number().int(),
          name: z.string(),
          address: z.object({
            street: z.string(),
            city: z.string(),
            zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional()
          }).optional()
        }),
        tags: z.array(z.string())
      });
      
      const validObject = {
        user: {
          id: 1,
          name: 'Jane Smith',
          address: {
            street: '123 Main St',
            city: 'Anytown',
            zip: '12345'
          }
        },
        tags: ['tag1', 'tag2', 'tag3']
      };
      
      const result = NestedSchema.parse(validObject);
      expect(result).toEqual(validObject);
    });
  });
  
  describe('format validation', () => {
    it('should validate date-time format', () => {
      const DateSchema = z.object({
        dateTime: z.string().datetime()
      });
      
      const validObject = {
        dateTime: '2023-01-01T12:00:00Z'
      };
      
      const invalidObject = {
        dateTime: '2023-01-01 12:00:00'
      };
      
      expect(() => DateSchema.parse(validObject)).not.toThrow();
      expect(() => DateSchema.parse(invalidObject)).toThrow();
    });
    
    it('should validate email format', () => {
      const EmailSchema = z.object({
        email: z.string().email()
      });
      
      const validObject = {
        email: 'user@example.com'
      };
      
      const invalidObject = {
        email: 'not-an-email'
      };
      
      expect(() => EmailSchema.parse(validObject)).not.toThrow();
      expect(() => EmailSchema.parse(invalidObject)).toThrow();
    });
    
    it('should validate url format', () => {
      const UrlSchema = z.object({
        url: z.string().url()
      });
      
      const validObject = {
        url: 'https://example.com/path'
      };
      
      const invalidObject = {
        url: 'not-a-url'
      };
      
      expect(() => UrlSchema.parse(validObject)).not.toThrow();
      expect(() => UrlSchema.parse(invalidObject)).toThrow();
    });
  });
  
  describe('union validation', () => {
    it('should validate oneOf schema (using union)', () => {
      const UnionSchema = z.object({
        value: z.union([z.string(), z.number()])
      });
      
      expect(() => UnionSchema.parse({ value: 'string' })).not.toThrow();
      expect(() => UnionSchema.parse({ value: 42 })).not.toThrow();
      expect(() => UnionSchema.parse({ value: true })).toThrow();
    });
    
    it('should validate with refinements (similar to anyOf)', () => {
      const RefinedSchema = z.object({
        value: z.string().refine(
          val => val.length >= 5 || /^[A-Z]+$/.test(val),
          { message: "String must be at least 5 chars long or all uppercase" }
        )
      });
      
      expect(() => RefinedSchema.parse({ value: 'longstring' })).not.toThrow();
      expect(() => RefinedSchema.parse({ value: 'ABC' })).not.toThrow();
      expect(() => RefinedSchema.parse({ value: 'ab' })).toThrow();
    });
    
    it('should validate with multiple refinements (similar to allOf)', () => {
      const AllRefinedSchema = z.object({
        value: z.string()
          .min(3, "String must be at least 3 characters")
          .max(10, "String must be at most 10 characters")
      });
      
      expect(() => AllRefinedSchema.parse({ value: 'valid' })).not.toThrow();
      expect(() => AllRefinedSchema.parse({ value: 'ab' })).toThrow();
      expect(() => AllRefinedSchema.parse({ value: 'toolongstring' })).toThrow();
    });
  });
});