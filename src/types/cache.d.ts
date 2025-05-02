/**
 * Global cache type declarations
 */

import { PathPatternTTLCalculator as PathPatternTTLCalculatorType } from '../services/cache/PathPatternTTLCalculator';

declare global {
  /**
   * Make PathPatternTTLCalculator accessible globally
   */
  type PathPatternTTLCalculator = PathPatternTTLCalculatorType;
  var PathPatternTTLCalculator: typeof PathPatternTTLCalculatorType;
}