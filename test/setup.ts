// Test setup file for vitest
// This file is automatically loaded before test files

// Mock global objects that might not be available in the test environment
globalThis.Response = class Response {
  status: number;
  statusText: string;
  headers: Headers;
  body: any;
  
  constructor(body?: any, init?: ResponseInit) {
    this.status = init?.status || 200;
    this.statusText = init?.statusText || '';
    this.headers = new Headers(init?.headers);
    this.body = body;
  }
  
  json() {
    return Promise.resolve(this.body);
  }
  
  text() {
    return Promise.resolve(typeof this.body === 'string' ? this.body : JSON.stringify(this.body));
  }
  
  // Add any other methods you need for testing
} as any;

// Mock Headers class if necessary
if (typeof Headers === 'undefined') {
  globalThis.Headers = class Headers {
    private headers: Map<string, string> = new Map();
    
    constructor(init?: HeadersInit) {
      if (init) {
        if (init instanceof Headers) {
          init.forEach((value, key) => this.set(key, value));
        } else if (Array.isArray(init)) {
          init.forEach(([key, value]) => this.set(key, value));
        } else {
          Object.entries(init).forEach(([key, value]) => this.set(key, value));
        }
      }
    }
    
    append(name: string, value: string): void {
      this.set(name, value);
    }
    
    delete(name: string): void {
      this.headers.delete(name.toLowerCase());
    }
    
    get(name: string): string | null {
      return this.headers.get(name.toLowerCase()) || null;
    }
    
    has(name: string): boolean {
      return this.headers.has(name.toLowerCase());
    }
    
    set(name: string, value: string): void {
      this.headers.set(name.toLowerCase(), value);
    }
    
    forEach(callbackfn: (value: string, key: string, parent: Headers) => void): void {
      this.headers.forEach((value, key) => callbackfn(value, key, this));
    }
  } as any;
}

// Mock any other globals or setup test environment as needed