# Security & Production Readiness Fix Plan

**Created**: 2025-12-10
**Status**: IN PROGRESS
**Priority**: CRITICAL

---

## Critical Issues (Must Fix Before Merge)

### 1. ✅ SSRF Vulnerability in Overlay URLs
**Severity**: 🔴 Critical
**Files**:
- `src/parameters/parsers/AkamaiParser.ts`
- `src/parameters/parsers/StandardParser.ts`

**Fix**:
- Add URL validation helper
- Whitelist allowed protocols (http, https only)
- Blacklist internal networks (RFC1918, link-local, loopback)
- Blacklist cloud metadata endpoints
- Add tests for attack vectors

**Estimated Effort**: 2-3 hours

---

### 2. ✅ Cache Key Instability (JSON.stringify ordering)
**Severity**: 🔴 Critical
**Files**:
- `src/services/cache/kv/SimpleKVTransformCacheManager.ts`

**Fix**:
- Create deterministic object serialization
- Sort keys before stringifying
- Add test for parameter order variations

**Estimated Effort**: 1-2 hours

---

### 3. ✅ Memory Cache Serves Stale Data
**Severity**: 🔴 Critical
**Files**:
- `src/services/cache/kv/SimpleKVTransformCacheManager.ts`

**Fix**:
- Add TTL tracking to LRUCache
- Check expiration on get()
- Auto-evict expired entries
- Add test for TTL expiration

**Estimated Effort**: 2 hours

---

### 4. ✅ False Negatives in Transformation Detection
**Severity**: 🔴 Critical
**Files**:
- `src/services/cache/kv/SimpleKVTransformCacheManager.ts`

**Fix**:
- Improve transformation detection logic
- Handle lossless conversions
- Handle rotate/flip operations
- Add tests for edge cases

**Estimated Effort**: 1-2 hours

---

## High Priority Issues (Fix Before Production)

### 5. ✅ Config Merge Without Schema Validation
**Severity**: 🟠 High
**Files**:
- `src/services/config/configBridge.ts`

**Fix**:
- Add SchemaValidator.validate() after merge
- Handle validation errors gracefully
- Add test for malformed config

**Estimated Effort**: 1 hour

---

### 6. ✅ No Dimension Limits for Overlays
**Severity**: 🟠 High
**Files**:
- `src/parameters/parsers/AkamaiParser.ts`

**Fix**:
- Add maximum dimension constants
- Validate overlay dimensions
- Add test for oversized overlays

**Estimated Effort**: 30 minutes

---

### 7. ⚠️ KV Namespace Null Pointer Risk
**Severity**: 🟠 High
**Files**:
- `src/services/cache/kv/KVTransformCacheManagerFactory.ts`

**Fix**:
- Create mock KV namespace for disabled state
- Remove unsafe type casts
- Add runtime checks

**Estimated Effort**: 30 minutes

---

## Medium Priority Issues (Monitor After Deployment)

### 8. ⚠️ Performance: Multiple KV Reads
**Severity**: 🟡 Medium
**Files**:
- `src/services/cache/kv/SimpleKVTransformCacheManager.ts`

**Fix**:
- Optimize format selection order
- Reduce unnecessary format checks
- Add performance metrics

**Estimated Effort**: 2 hours

---

### 9. 📝 Size Code Cache Migration
**Severity**: 🟡 Medium (Breaking Change)
**Impact**: Cache invalidation on deployment

**Mitigation**:
- Document breaking change
- Consider cache warming script
- Monitor cache miss rate post-deployment

**Estimated Effort**: Documentation only

---

## Testing Requirements

### Security Tests
- [ ] SSRF attack vectors (file://, internal IPs)
- [ ] Overlay URL validation
- [ ] Config injection attempts

### Edge Case Tests
- [ ] Path + Query + Size code priority
- [ ] Memory cache TTL expiration
- [ ] Transform detection edge cases
- [ ] Parameter order variations in cache keys

### Integration Tests
- [ ] Config validation with malformed KV data
- [ ] Oversized overlay dimensions
- [ ] Multiple format KV lookups

---

## Implementation Order

1. **Phase 1 - Security (Critical)**: Fix 1, 6
2. **Phase 2 - Cache Stability (Critical)**: Fix 2, 3, 4
3. **Phase 3 - Robustness (High)**: Fix 5, 7
4. **Phase 4 - Optimization (Medium)**: Fix 8
5. **Phase 5 - Testing**: All test suites
6. **Phase 6 - Documentation**: Migration notes

---

## Success Criteria

- ✅ All TypeScript checks pass
- ✅ All existing tests pass (149/149)
- ✅ All new security tests pass
- ✅ All edge case tests pass
- ✅ No SSRF vulnerabilities
- ✅ Cache keys are stable
- ✅ Memory cache respects TTL
- ✅ Transformation detection handles edge cases

---

## Rollback Plan

If issues occur in production:
1. Revert to previous commit
2. Disable KV transform cache (set enabled: false)
3. Clear KV cache namespace
4. Monitor origin traffic

---

## Timeline

**Estimated Total**: 10-12 hours
**Target Completion**: Same day

---

## Sign-off

- [ ] Code review completed
- [ ] All tests passing
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Ready for staging deployment
