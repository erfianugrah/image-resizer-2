# Image-Resizer Codebase Refactoring Plan

This document outlines a comprehensive plan for refactoring the entire image-resizer codebase to improve maintainability, extensibility, and testability.

## 1. Architectural Vision

### Core Architecture Principles

1. **Service-Oriented Architecture**
   - Implement clear service boundaries with defined interfaces
   - Establish domain-driven design principles throughout the codebase
   - Apply the Command pattern for transformation operations
   - Utilize dependency injection for service composition

2. **Clean Architecture Layers**
   - **Domain Layer**: Core transformation entities and business rules
   - **Application Layer**: Use cases and transformation orchestration
   - **Infrastructure Layer**: Cloudflare-specific implementations
   - **Interface Layer**: API handlers and request/response mapping

3. **Unified Design Patterns**
   - Adapter pattern for external service compatibility (Akamai, etc.)
   - Strategy pattern for transformation algorithms
   - Builder pattern for constructing transformation chains
   - Factory pattern for parameter creation
   - Repository pattern for caching and storage

## 2. Future Improvements

### Core Domain Model Improvements
- Create `TransformationRequest` and `TransformationResult` domain entities
- Define value objects for each transformation type (Resize, Crop, Watermark, etc.)
- Implement validation rules as domain services
- Design immutable state transitions for transformation pipeline
- Develop unified parameter interfaces
- Create parameter factories for different input formats
- Implement strong typing for all parameters
- Add validation and normalization as part of domain logic

### Service Layer Improvements
- Design `ImageTransformationService` as core orchestrator
- Implement specialized services:
  - `ResizeService`
  - `WatermarkService`
  - `ImageEffectsService`
  - `FormatConversionService`
- Create service interfaces with clear contracts
- Refactor Akamai compatibility into dedicated service
- Design extensible adapter system for multiple vendor formats
- Implement parameter translation pipelines
- Create abstraction for feature flags

### Infrastructure Improvements
- Develop intelligent caching strategy with domain-aware invalidation
- Implement metrics collection for transformation performance
- Create optimized transformation paths for common operations
- Design resource management for large batch operations
- Implement structured logging throughout the codebase
- Create transaction context for request tracing
- Add performance profiling with detailed metrics
- Design comprehensive error handling strategy

## 3. Component Designs

### Image Transformation Pipeline

```typescript
// Transformation pipeline with immutable operations
interface TransformOperation {
  apply(image: ImageContext): ImageContext;
  getMetadata(): OperationMetadata;
}

class ResizeOperation implements TransformOperation {
  constructor(private options: ResizeOptions) {}
  
  apply(image: ImageContext): ImageContext {
    // Implementation of resize that returns new ImageContext
    return image.withDimensions(this.options.width, this.options.height);
  }
  
  getMetadata(): OperationMetadata {
    return {
      type: 'resize',
      parameters: this.options
    };
  }
}

class TransformationPipeline {
  private operations: TransformOperation[] = [];
  
  addOperation(operation: TransformOperation): this {
    this.operations.push(operation);
    return this;
  }
  
  execute(source: ImageSource): Promise<TransformationResult> {
    return this.operations.reduce(
      async (contextPromise, operation) => {
        const context = await contextPromise;
        return operation.apply(context);
      },
      Promise.resolve(new ImageContext(source))
    );
  }
}
```

### Parameter Handling System

```typescript
// Type-safe parameter handling
interface ParameterDefinition<T> {
  name: string;
  parse(value: unknown): T;
  validate(value: T): ValidationResult;
  normalize(value: T): T;
}

class ParameterRegistry {
  private definitions = new Map<string, ParameterDefinition<any>>();
  
  register<T>(definition: ParameterDefinition<T>): this {
    this.definitions.set(definition.name, definition);
    return this;
  }
  
  parse<T>(name: string, value: unknown): T {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new UnknownParameterError(name);
    }
    
    const parsed = definition.parse(value);
    const validation = definition.validate(parsed);
    
    if (!validation.valid) {
      throw new ParameterValidationError(name, validation.errors);
    }
    
    return definition.normalize(parsed);
  }
}
```

### Service Composition

```typescript
// Dependency injection and service composition
interface ServiceIdentifier<T = any> {
  readonly id: symbol;
}

class Container {
  private services = new Map<symbol, any>();
  private factories = new Map<symbol, Factory<any>>();
  
  register<T>(id: ServiceIdentifier<T>, instance: T): this {
    this.services.set(id.id, instance);
    return this;
  }
  
  registerFactory<T>(id: ServiceIdentifier<T>, factory: Factory<T>): this {
    this.factories.set(id.id, factory);
    return this;
  }
  
  resolve<T>(id: ServiceIdentifier<T>): T {
    if (this.services.has(id.id)) {
      return this.services.get(id.id);
    }
    
    if (this.factories.has(id.id)) {
      const factory = this.factories.get(id.id);
      const instance = factory(this);
      this.services.set(id.id, instance);
      return instance;
    }
    
    throw new ServiceNotFoundError(id);
  }
}
```

## 4. Akamai Compatibility Layer Refactoring

The current Akamai compatibility layer will be completely redesigned as follows:

```typescript
// Akamai adapter hierarchy
interface ParameterAdapter<TSource, TTarget> {
  canHandle(source: TSource): boolean;
  adapt(source: TSource, context: AdapterContext): TTarget;
}

class AkamaiParameterRegistry {
  private adapters: ParameterAdapter<AkamaiParameter, TransformParameter>[] = [];
  
  registerAdapter(adapter: ParameterAdapter<AkamaiParameter, TransformParameter>): this {
    this.adapters.push(adapter);
    return this;
  }
  
  adaptParameters(source: AkamaiParameters, context: AdapterContext): TransformParameters {
    const result = new TransformParameters();
    
    for (const param of Object.values(source)) {
      const adapter = this.adapters.find(a => a.canHandle(param));
      if (adapter) {
        const transformed = adapter.adapt(param, context);
        result.add(transformed);
      }
    }
    
    return result;
  }
}

// Example adapter
class AkamaiCompositeAdapter implements ParameterAdapter<AkamaiCompositeParameter, DrawParameter> {
  canHandle(source: AkamaiParameter): boolean {
    return source.name === 'composite' || source.name === 'watermark';
  }
  
  adapt(source: AkamaiCompositeParameter, context: AdapterContext): DrawParameter {
    // Translation logic
    return new DrawParameter({
      url: source.url,
      positioning: this.mapPositioning(source.placement, source.offset),
      opacity: source.opacity ? source.opacity / 100 : undefined,
      // other mappings
    });
  }
  
  private mapPositioning(placement?: string, offset?: number): PositioningOptions {
    // Mapping logic
  }
}
```

## 5. Testing Strategy

### Unit Testing

- Test each domain entity and value object in isolation
- Mock dependencies for service tests
- Use parameterized tests for input variations
- Implement property-based testing for complex logic

### Integration Testing

- Test service compositions with real dependencies
- Verify parameter translation accuracy
- Test complete transformation chains
- Confirm compatibility with various input formats

### Performance Testing

- Benchmark core transformation operations
- Measure memory usage during transformations
- Test cache hit/miss scenarios
- Evaluate concurrent request handling

## 6. Implementation Considerations

### Risk Mitigation

- Maintain backward compatibility throughout refactoring
- Implement feature flags for gradual rollout
- Create comprehensive test coverage before changing live code
- Establish metrics baseline for performance comparison
- Develop rollback strategy for critical failures

## 7. Component Implementations

### URL & Request Processing

- Create `RequestParser` service with pluggable format handlers
- Implement `ParameterExtractor` for different parameter formats
- Develop `UrlNormalizer` for consistent URL handling
- Build `RequestValidator` to enforce constraints

### Transformation Logic

- Design `TransformationEngine` as the core processor
- Implement operation-specific handlers (resize, crop, etc.)
- Create composable transformation chain
- Build error recovery mechanism

### Caching System

- Implement intelligent cache key generation
- Design cache hierarchy with multiple levels
- Create cache invalidation strategy
- Build performance monitoring for cache effectiveness

### Response Generation

- Develop response formatter system
- Implement content negotiation
- Create error response handling
- Build debugging information formatter

## 8. Key Interfaces

```typescript
// Key interfaces for the refactored system

interface ImageSource {
  getUrl(): URL;
  getMetadata(): Promise<ImageMetadata>;
  getStream(): Promise<ReadableStream>;
}

interface TransformationService {
  transform(
    source: ImageSource, 
    parameters: TransformParameters
  ): Promise<TransformationResult>;
}

interface ParameterParser<T> {
  parse(input: unknown): T;
  validate(value: T): ValidationResult;
}

interface TransformationResult {
  image: ProcessedImage;
  metadata: ResultMetadata;
  debugInfo?: DebugInformation;
}

interface CacheService {
  get(key: string): Promise<CachedItem | null>;
  set(key: string, value: CachedItem, options: CacheOptions): Promise<void>;
  invalidate(pattern: string): Promise<void>;
}
```

This document will serve as the blueprint for the full codebase refactoring effort.