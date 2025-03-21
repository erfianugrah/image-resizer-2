/**
 * Akamai Image Manager Compatibility Module
 * 
 * This module provides translation functions to convert Akamai Image Manager
 * URL parameters to Cloudflare Image Resizing parameters, allowing for
 * a smoother migration and compatibility with existing Akamai implementations.
 */

import type { TransformOptions } from '../transform';
import { defaultLogger, Logger } from './logging';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

/**
 * Set the logger for the Akamai compatibility module
 * 
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}

/**
 * Translates Akamai Image Manager URL parameters to Cloudflare Image Resizing parameters
 * 
 * @param url URL with Akamai Image Manager parameters
 * @returns Object with Cloudflare Image Resizing parameters
 */
export function translateAkamaiParams(url: URL): TransformOptions {
  const cfParams: TransformOptions = {};
  
  // Parse Akamai im.resize parameter
  const imResize = url.searchParams.get('im.resize');
  if (imResize) {
    const resizeParams = parseImResize(imResize);
    
    // Map width and height directly
    if (resizeParams.width) cfParams.width = parseInt(resizeParams.width.toString());
    if (resizeParams.height) cfParams.height = parseInt(resizeParams.height.toString());
    
    // Map resize mode to fit parameter
    if (resizeParams.mode) {
      switch(resizeParams.mode) {
      case 'fit': cfParams.fit = 'contain'; break;
      case 'stretch': cfParams.fit = 'scale-down'; break;
      case 'fill': cfParams.fit = 'cover'; break;
      case 'crop': cfParams.fit = 'crop'; break;
      case 'pad': cfParams.fit = 'pad'; break;
      }
    }
    
    // Handle aspect, map to fit=scale-down with appropriate dimensions
    if (resizeParams.aspect && typeof resizeParams.aspect === 'string') {
      const [width, height] = resizeParams.aspect.split(':').map(Number);
      if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
        if (!cfParams.width && !cfParams.height) {
          // If no dimensions are specified, use default size with aspect ratio
          cfParams.width = 800;
          cfParams.height = Math.round(800 * (height / width));
        } else if (cfParams.width && !cfParams.height) {
          // If only width is specified, calculate height based on aspect ratio
          cfParams.height = Math.round(cfParams.width * (height / width));
        } else if (!cfParams.width && cfParams.height) {
          // If only height is specified, calculate width based on aspect ratio
          cfParams.width = Math.round(cfParams.height * (width / height));
        }
        // If both dimensions are specified, leave them as is
      }
    }
  }
  
  // Handle aspectCrop from Akamai
  const imAspectCrop = url.searchParams.get('im.aspectCrop');
  if (imAspectCrop) {
    try {
      logger.debug('Processing Akamai aspectCrop parameter', { imAspectCrop });
      logger.breadcrumb('Processing aspectCrop parameter', undefined, { 
        parameter: imAspectCrop,
        parameterLength: imAspectCrop.length,
        allSearchParams: Array.from(url.searchParams.entries()).map(([k, v]) => `${k}=${v}`).join('&'),
        hasExistingCfParams: Object.keys(cfParams).length > 0,
        cfParamsBeforeAspectCrop: JSON.stringify(cfParams)
      });
      
      // Parse aspect crop parameters
      // Parse format could be width:16,height:9,hoffset:0.5,voffset:0.5,allowExpansion:true
      const aspectCropParams: Record<string, string | number | boolean> = {};
      
      // Handle both comma and semicolon separators
      const separator = imAspectCrop.includes(',') ? ',' : ';';
      logger.debug('Using separator', { separator });
      logger.breadcrumb('Using separator for aspectCrop', undefined, { 
        separator,
        parameterStructure: imAspectCrop 
      });
      
      // Start timing the parsing
      const parseStart = Date.now();
      
      imAspectCrop.split(separator).forEach(pair => {
        // Handle both colon and equals separators
        const keyValSeparator = pair.includes(':') ? ':' : '=';
        const [key, value] = pair.split(keyValSeparator).map(s => s.trim());
        
        logger.debug('Processing aspect crop pair', { key, value, keyValSeparator });
        
        if (key && value !== undefined) {
          // Convert boolean strings to booleans
          if (value.toLowerCase() === 'true') {
            aspectCropParams[key] = true;
          } else if (value.toLowerCase() === 'false') {
            aspectCropParams[key] = false;
          } else if (!isNaN(Number(value))) {
            // Convert numeric strings to numbers
            aspectCropParams[key] = Number(value);
          } else {
            aspectCropParams[key] = value;
          }
        }
      });
      
      const parseEnd = Date.now();
      logger.breadcrumb('Parsed aspectCrop parameters', parseEnd - parseStart, aspectCropParams);
      
      logger.debug('Parsed aspect crop parameters', { 
        aspectCropParams, 
        originalParam: imAspectCrop 
      });
      
      // Calculate aspect ratio
      const aspectWidth = typeof aspectCropParams.width === 'number' ? aspectCropParams.width : 1;
      const aspectHeight = typeof aspectCropParams.height === 'number' ? aspectCropParams.height : 1;
      
      logger.debug('Aspect ratio dimensions', { aspectWidth, aspectHeight });
      logger.breadcrumb('AspectCrop dimensions', undefined, { width: aspectWidth, height: aspectHeight });
      
      // Only proceed if we have valid dimensions
      if (aspectWidth > 0 && aspectHeight > 0) {
        // Set the target aspect ratio
        const targetAspect = aspectWidth / aspectHeight;
        logger.debug('Target aspect ratio', { targetAspect });
        
        // Start timing the dimension calculation
        const dimensionStart = Date.now();
        
        // If we have width and height, use them directly
        if (cfParams.width && cfParams.height) {
          logger.debug('Using existing width and height', { 
            width: cfParams.width, 
            height: cfParams.height, 
            currentAspect: cfParams.width / cfParams.height 
          });
          
          // We already have dimensions, just ensure they match the aspect ratio
          // We'll adjust dimensions to match the aspect ratio when needed
          if (aspectCropParams.allowExpansion === true) {
            logger.debug('Allow expansion is true, adjusting dimensions with transparent background');
            logger.breadcrumb('Adjusting dimensions with allowExpansion=true');
            
            // With allowExpansion, we ensure the image fits within the aspect ratio by adding transparent areas
            if (cfParams.width / cfParams.height > targetAspect) {
              // Image is wider than target aspect, adjust height
              const oldHeight = cfParams.height;
              cfParams.height = Math.round(cfParams.width / targetAspect);
              logger.debug('Image is wider than target aspect, adjusting height', { 
                oldHeight, 
                newHeight: cfParams.height 
              });
              logger.breadcrumb('Adjusted height for aspectCrop', undefined, {
                oldHeight,
                newHeight: cfParams.height,
                reason: 'wider than target'
              });
            } else {
              // Image is taller than target aspect, adjust width
              const oldWidth = cfParams.width;
              cfParams.width = Math.round(cfParams.height * targetAspect);
              logger.debug('Image is taller than target aspect, adjusting width', { 
                oldWidth, 
                newWidth: cfParams.width 
              });
              logger.breadcrumb('Adjusted width for aspectCrop', undefined, {
                oldWidth,
                newWidth: cfParams.width,
                reason: 'taller than target'
              });
            }
            // Set background to transparent
            cfParams.background = 'transparent';
          } else {
            logger.debug('Allow expansion is false, using crop fit');
            logger.breadcrumb('Using crop fit for aspectCrop', undefined, {
              fit: 'crop',
              allowExpansion: false
            });
            // Without allowExpansion, we crop to the target aspect ratio
            cfParams.fit = 'crop';
          }
        } else if (cfParams.width) {
          logger.debug('Only width provided, calculating height');
          // We have width but not height, calculate height based on aspect ratio
          cfParams.height = Math.round(cfParams.width / targetAspect);
          logger.debug('Calculated height', { width: cfParams.width, height: cfParams.height });
          logger.breadcrumb('Calculated height from width', undefined, {
            width: cfParams.width,
            calculatedHeight: cfParams.height
          });
        } else if (cfParams.height) {
          logger.debug('Only height provided, calculating width');
          // We have height but not width, calculate width based on aspect ratio
          cfParams.width = Math.round(cfParams.height * targetAspect);
          logger.debug('Calculated width', { width: cfParams.width, height: cfParams.height });
          logger.breadcrumb('Calculated width from height', undefined, {
            height: cfParams.height,
            calculatedWidth: cfParams.width
          });
        } else {
          logger.debug('No dimensions provided, using defaults');
          // We have neither width nor height, use defaults
          cfParams.width = 800;
          cfParams.height = Math.round(800 / targetAspect);
          logger.debug('Set default dimensions', { width: cfParams.width, height: cfParams.height });
          logger.breadcrumb('Using default dimensions', undefined, {
            defaultWidth: 800,
            calculatedHeight: cfParams.height
          });
        }
        
        const dimensionEnd = Date.now();
        logger.breadcrumb('Calculated dimensions for aspectCrop', dimensionEnd - dimensionStart, {
          width: cfParams.width,
          height: cfParams.height,
          targetAspect
        });
        
        // Start timing the gravity calculation
        const gravityStart = Date.now();
        
        // Handle crop positioning (gravity)
        const hoffset = typeof aspectCropParams.hoffset === 'number' ? aspectCropParams.hoffset : 0.5;
        const voffset = typeof aspectCropParams.voffset === 'number' ? aspectCropParams.voffset : 0.5;
        
        logger.debug('Positioning offsets', { hoffset, voffset });
        
        // Map offsets to gravity
        // Cloudflare uses gravity for positioning the crop
        // Map the offset combinations to the closest gravity value
        if (hoffset <= 0.25) {
          if (voffset <= 0.25) {
            cfParams.gravity = 'north-west';
          } else if (voffset >= 0.75) {
            cfParams.gravity = 'south-west';
          } else {
            cfParams.gravity = 'west';
          }
        } else if (hoffset >= 0.75) {
          if (voffset <= 0.25) {
            cfParams.gravity = 'north-east';
          } else if (voffset >= 0.75) {
            cfParams.gravity = 'south-east';
          } else {
            cfParams.gravity = 'east';
          }
        } else {
          if (voffset <= 0.25) {
            cfParams.gravity = 'north';
          } else if (voffset >= 0.75) {
            cfParams.gravity = 'south';
          } else {
            cfParams.gravity = 'center';
          }
        }
        
        const gravityEnd = Date.now();
        logger.breadcrumb('Set gravity for aspectCrop', gravityEnd - gravityStart, {
          gravity: cfParams.gravity,
          hoffset,
          voffset
        });
        
        logger.debug('Set gravity based on offsets', { gravity: cfParams.gravity });
      }
      
      logger.debug('Final transform parameters after aspect crop', { 
        params: cfParams,
        originalParam: imAspectCrop,
        sourceWidth: aspectWidth,
        sourceHeight: aspectHeight
      });
      
      // Calculate total aspectCrop processing time
      const totalProcessingTime = Date.now() - parseStart;
      
      logger.breadcrumb('Completed aspectCrop processing', totalProcessingTime, {
        width: cfParams.width,
        height: cfParams.height,
        fit: cfParams.fit,
        gravity: cfParams.gravity,
        totalParamCount: Object.keys(cfParams).length,
        paramNames: Object.keys(cfParams).join(','),
        computeRatio: aspectWidth && aspectHeight ? (aspectWidth / aspectHeight).toFixed(3) : 'unknown',
        originalAspectCrop: imAspectCrop
      });
      
      // Add a summary breadcrumb to easily identify complex aspectCrop operations
      logger.breadcrumb('AspectCrop summary', undefined, {
        processingTimeMs: totalProcessingTime,
        hasWidthHeight: !!(cfParams.width && cfParams.height),
        hasFit: !!cfParams.fit,
        hasGravity: !!cfParams.gravity,
        finalParamCount: Object.keys(cfParams).length
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error('Failed to parse im.aspectCrop parameter', { 
        error: errorMsg,
        stack: stack,
        aspectCrop: imAspectCrop 
      });
      
      logger.breadcrumb('aspectCrop parsing error', undefined, {
        error: errorMsg,
        parameter: imAspectCrop,
        errorType: error instanceof Error ? error.constructor.name : 'unknown',
        cfParamsAfterError: JSON.stringify(cfParams)
      });
      
      // Add a detailed error breadcrumb to help diagnose the specific issue
      logger.breadcrumb('AspectCrop error details', undefined, {
        errorLocation: error instanceof Error && stack ? stack.split('\n')[1] : 'unknown',
        hadStartedProcessing: true, // We've started processing if we hit this catch block
        cfParamsState: Object.keys(cfParams).join(',') || 'empty',
        aspectCropRaw: imAspectCrop
      });
    }
  }
  
  // Parse quality parameter
  const imQuality = url.searchParams.get('im.quality');
  if (imQuality) {
    // Handle both numeric quality and named quality levels
    if (imQuality.match(/^\d+$/)) {
      cfParams.quality = parseInt(imQuality);
    } else {
      // Map Akamai's named quality levels to Cloudflare's numeric values
      switch (imQuality.toLowerCase()) {
      case 'low': cfParams.quality = 50; break;
      case 'medium': cfParams.quality = 75; break;
      case 'high': cfParams.quality = 90; break;
      case 'chromasubsampling:444': cfParams.quality = 90; break;
      case 'chromasubsampling:420': cfParams.quality = 85; break;
      default: cfParams.quality = 85; // Default value
      }
    }
  }
  
  // Parse format parameter
  const imFormat = url.searchParams.get('im.format');
  if (imFormat) {
    // Map Akamai's format parameter to Cloudflare's format parameter
    switch (imFormat.toLowerCase()) {
    case 'webp': cfParams.format = 'webp'; break;
    case 'jpeg':
    case 'jpg': cfParams.format = 'jpeg'; break;
    case 'png': cfParams.format = 'png'; break;
    case 'gif': cfParams.format = 'gif'; break;
    case 'auto': cfParams.format = 'auto'; break;
    default: cfParams.format = 'auto';
    }
  }
  
  // Handle rotation
  const imRotate = url.searchParams.get('im.rotate');
  if (imRotate) {
    // Cloudflare only supports 90, 180, and 270 degree rotations
    const rotation = parseInt(imRotate);
    if (!isNaN(rotation)) {
      // Normalize to 0, 90, 180, or 270
      const normalizedRotation = ((rotation % 360) + 360) % 360;
      
      // Round to the nearest valid value
      if (normalizedRotation > 45 && normalizedRotation <= 135) {
        cfParams.rotate = 90;
      } else if (normalizedRotation > 135 && normalizedRotation <= 225) {
        cfParams.rotate = 180;
      } else if (normalizedRotation > 225 && normalizedRotation <= 315) {
        cfParams.rotate = 270;
      }
      // If close to 0 or 360, no rotation needed
    }
  }
  
  // Handle cropping
  const imCrop = url.searchParams.get('im.crop');
  if (imCrop) {
    try {
      // Parse crop values x,y,width,height
      const [x, y, width, height] = imCrop.split(',').map(val => parseInt(val));
      if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
        // In Cloudflare, trim is a string with values separated by semicolons
        cfParams.trim = `${y};${x + width};${y + height};${x}`;
      }
    } catch (error) {
      logger.warn('Failed to parse im.crop parameter', { error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  // Handle grayscale
  const imGrayscale = url.searchParams.get('im.grayscale');
  if (imGrayscale === 'true') {
    cfParams.saturation = 0;
  }
  
  // Handle contrast
  const imContrast = url.searchParams.get('im.contrast');
  if (imContrast) {
    const contrast = parseFloat(imContrast);
    if (!isNaN(contrast) && contrast >= 0) {
      cfParams.contrast = contrast;
    }
  }
  
  // Handle brightness
  const imBrightness = url.searchParams.get('im.brightness');
  if (imBrightness) {
    const brightness = parseFloat(imBrightness);
    if (!isNaN(brightness) && brightness >= 0) {
      cfParams.brightness = brightness;
    }
  }
  
  // Handle sharpening
  const imSharpen = url.searchParams.get('im.sharpen') || url.searchParams.get('im.unsharp');
  if (imSharpen) {
    // Parse values - Akamai can use different formats, handle the most common ones
    // Format could be: amount=X or amount=X,radius=Y,threshold=Z
    try {
      let sharpenValue = 0;
      
      if (imSharpen.includes(',')) {
        // Parse complex format
        const parts = imSharpen.split(',');
        for (const part of parts) {
          const [key, value] = part.split('=');
          if (key.trim() === 'amount') {
            sharpenValue = parseFloat(value);
            break;
          }
        }
      } else if (imSharpen.includes('=')) {
        // Parse simple key=value format
        const [key, value] = imSharpen.split('=');
        if (key.trim() === 'amount') {
          sharpenValue = parseFloat(value);
        } else {
          sharpenValue = parseFloat(value);
        }
      } else {
        // Just a value
        sharpenValue = parseFloat(imSharpen);
      }
      
      // Convert to Cloudflare's scale (0-10)
      if (!isNaN(sharpenValue) && sharpenValue > 0) {
        // Scale Akamai's typical 0-100 range to Cloudflare's 0-10 range
        cfParams.sharpen = Math.min(10, sharpenValue > 20 ? sharpenValue / 10 : sharpenValue);
      }
    } catch (error) {
      logger.warn('Failed to parse im.sharpen parameter', { error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  // Handle background color
  const imBackground = url.searchParams.get('im.background');
  if (imBackground) {
    // Map to Cloudflare's background parameter
    cfParams.background = imBackground;
  }
  
  // Handle animation control
  const imFrame = url.searchParams.get('im.frame') || url.searchParams.get('im.animationframeindex');
  if (imFrame !== null) {
    // If specific frame is requested, disable animation
    cfParams.anim = false;
  }
  
  // Only process advanced features if enabled
  let advancedFeaturesEnabled = false;
  try {
    // This will be set when calling the function from index.ts
    advancedFeaturesEnabled = (cfParams as any)?._config?.features?.enableAkamaiAdvancedFeatures === true;
    
    logger.debug('Checking advanced features status', { 
      advancedFeaturesEnabled,
      hasConfig: !!(cfParams as any)?._config
    });
  } catch (error) {
    logger.warn('Error checking advanced features status', { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
  
  // Parse other Akamai parameters that have Cloudflare equivalents
  
  // Check for composite operations but only log a warning if advanced features not enabled
  const basicComposite = url.searchParams.get('im.composite');
  if (basicComposite && !advancedFeaturesEnabled) {
    logger.warn('Akamai composite operations require advanced features to be enabled', { basicComposite });
  }
  
  // Handle metadata
  const imMetadata = url.searchParams.get('im.metadata');
  if (imMetadata) {
    switch (imMetadata.toLowerCase()) {
    case 'none':
    case 'no': 
      cfParams.metadata = 'none';
      break;
    case 'copyright':
    case 'minimal':
      cfParams.metadata = 'copyright';
      break;
    case 'all':
    case 'keep':
      cfParams.metadata = 'keep';
      break;
    default:
      cfParams.metadata = 'none'; // Default to none
    }
  }
  
  // Handle conditional transformations
  const imIfDimension = url.searchParams.get('im.if-dimension');
  if (imIfDimension && advancedFeaturesEnabled) {
    try {
      logger.breadcrumb('Processing if-dimension condition', undefined, { condition: imIfDimension });
      
      // Store condition in metadata for processing during transformation
      cfParams._conditions = cfParams._conditions || [];
      cfParams._conditions.push({
        type: 'dimension',
        condition: imIfDimension
      });
      
      logger.debug('Added dimension condition for processing', { condition: imIfDimension });
    } catch (error) {
      logger.error('Failed to parse im.if-dimension parameter', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  } else if (imIfDimension && !advancedFeaturesEnabled) {
    logger.debug('Skipping if-dimension condition because advanced features are disabled', {
      parameter: imIfDimension
    });
  }
  
  // Handle blur effect
  const imBlur = url.searchParams.get('im.blur');
  if (imBlur && advancedFeaturesEnabled) {
    try {
      const blurAmount = parseFloat(imBlur);
      if (!isNaN(blurAmount) && blurAmount > 0) {
        // Map Akamai's blur (0-100) to Cloudflare's (0-250)
        cfParams.blur = Math.min(250, Math.max(0, blurAmount * 2.5));
        logger.debug('Set blur parameter', { akamaiBlur: blurAmount, cloudflareBlur: cfParams.blur });
        logger.breadcrumb('Applied blur effect', undefined, {
          originalValue: blurAmount,
          translatedValue: cfParams.blur
        });
      }
    } catch (error) {
      logger.error('Failed to parse im.blur parameter', { 
        error: error instanceof Error ? error.message : String(error),
        blur: imBlur
      });
    }
  } else if (imBlur && !advancedFeaturesEnabled) {
    logger.debug('Skipping blur effect because advanced features are disabled', {
      parameter: imBlur
    });
  }
  
  // Handle mirror (horizontal/vertical flip)
  const imMirror = url.searchParams.get('im.mirror');
  if (imMirror && advancedFeaturesEnabled) {
    try {
      const mirrorValue = imMirror.toLowerCase().trim();
      
      if (mirrorValue === 'horizontal' || mirrorValue === 'h') {
        cfParams.flip = true;
        logger.debug('Set horizontal mirror/flip');
        logger.breadcrumb('Applied horizontal mirror/flip', undefined, {
          originalValue: imMirror
        });
      } else if (mirrorValue === 'vertical' || mirrorValue === 'v') {
        cfParams.flop = true;
        logger.debug('Set vertical mirror/flip');
        logger.breadcrumb('Applied vertical mirror/flip', undefined, {
          originalValue: imMirror
        });
      } else if (mirrorValue === 'both' || mirrorValue === 'hv' || mirrorValue === 'vh') {
        // Both horizontal and vertical
        cfParams.flip = true;
        cfParams.flop = true;
        logger.debug('Set both horizontal and vertical mirror/flip');
        logger.breadcrumb('Applied both horizontal and vertical mirror/flip', undefined, {
          originalValue: imMirror
        });
      }
    } catch (error) {
      logger.error('Failed to parse im.mirror parameter', { 
        error: error instanceof Error ? error.message : String(error),
        mirror: imMirror
      });
    }
  } else if (imMirror && !advancedFeaturesEnabled) {
    logger.debug('Skipping mirror effect because advanced features are disabled', {
      parameter: imMirror
    });
  }
  
  // Handle composite (watermark)
  const imComposite = url.searchParams.get('im.composite') || url.searchParams.get('im.watermark');
  if (imComposite && advancedFeaturesEnabled) {
    try {
      logger.breadcrumb('Processing composite parameter', undefined, { parameter: imComposite });
      
      // Parse composite parameters
      const compositeParams = parseCompositeParams(imComposite);
      
      // Skip if no URL is provided
      if (!compositeParams.url) {
        logger.warn('Skipping composite due to missing URL parameter', { compositeParams });
        return cfParams;
      }
      
      // Initialize draw array if needed
      if (!cfParams.draw) {
        cfParams.draw = [];
      }
      
      // Create draw object
      const drawObj: Record<string, any> = {
        url: compositeParams.url,
      };
      
      // Map position parameters
      if (compositeParams.placement) {
        const placement = compositeParams.placement.toLowerCase();
        const offset = compositeParams.offset || 5; // Default offset of 5px
        
        switch (placement) {
        case 'north':
        case 'top':
          drawObj.top = offset;
          break;
        case 'south':
        case 'bottom':
          drawObj.bottom = offset;
          break;
        case 'east':
        case 'right':
          drawObj.right = offset;
          break;
        case 'west':
        case 'left':
          drawObj.left = offset;
          break;
        case 'northeast':
        case 'topright':
          drawObj.top = offset;
          drawObj.right = offset;
          break;
        case 'northwest':
        case 'topleft':
          drawObj.top = offset;
          drawObj.left = offset;
          break;
        case 'southeast':
        case 'bottomright':
          drawObj.bottom = offset;
          drawObj.right = offset;
          break;
        case 'southwest':
        case 'bottomleft':
          drawObj.bottom = offset;
          drawObj.left = offset;
          break;
        case 'center':
        default:
          // Center position is the default in Cloudflare
          break;
        }
      }
      
      // Handle opacity (Cloudflare uses 0-1 range, Akamai uses 0-100)
      if (compositeParams.opacity !== undefined) {
        drawObj.opacity = Math.max(0, Math.min(1, compositeParams.opacity / 100));
      }
      
      // Handle tiling
      if (compositeParams.tile === true) {
        drawObj.repeat = true;
      }
      
      // Add to draw array
      cfParams.draw.push(drawObj);
      logger.debug('Added composite/watermark', { drawObject: drawObj });
      
      logger.breadcrumb('Applied composite watermark', undefined, {
        url: compositeParams.url,
        placement: compositeParams.placement,
        opacity: compositeParams.opacity,
        tile: compositeParams.tile
      });
    } catch (error) {
      logger.error('Failed to parse composite parameter', { 
        error: error instanceof Error ? error.message : String(error),
        composite: imComposite 
      });
    }
  } else if (imComposite && !advancedFeaturesEnabled) {
    logger.debug('Skipping composite/watermark effect because advanced features are disabled', {
      parameter: imComposite
    });
  }

  // Add a comprehensive breadcrumb at the end of translation to see the final parameters
  logger.breadcrumb('Completed Akamai parameter translation', undefined, {
    parameterCount: Object.keys(cfParams).length,
    hasWidth: !!cfParams.width,
    hasHeight: !!cfParams.height,
    width: cfParams.width,
    height: cfParams.height,
    format: cfParams.format,
    fit: cfParams.fit,
    quality: cfParams.quality,
    gravity: cfParams.gravity,
    hasBlur: !!cfParams.blur,
    hasMirror: !!(cfParams.flip || cfParams.flop),
    hasWatermark: !!(cfParams.draw && cfParams.draw.length > 0),
    allParams: Object.keys(cfParams).join(',')
  });
  
  // Add log for potentially problematic parameters
  if (cfParams.width && cfParams.height && cfParams.fit === 'crop') {
    logger.breadcrumb('Using crop fit with explicit dimensions', undefined, {
      width: cfParams.width,
      height: cfParams.height,
      ratio: (cfParams.width / cfParams.height).toFixed(3),
      gravity: cfParams.gravity || 'default'
    });
  }
  
  return cfParams;
}

/**
 * Helper function to parse composite parameters from Akamai format
 * 
 * @param composite Composite parameter string
 * @returns Parsed parameters object
 */
function parseCompositeParams(composite: string): Record<string, any> {
  const result: Record<string, any> = {};
  
  // Split by commas, but handle quoted values
  const parts = splitParameters(composite);
  
  for (const part of parts) {
    // Check for key:value or key=value format
    const separator = part.includes(':') ? ':' : '=';
    const [key, value] = part.split(separator).map(s => s.trim());
    
    if (key && value !== undefined) {
      // Special handling for url parameter
      if (key === 'url') {
        result.url = value;
      } 
      // Handle placement parameter
      else if (key === 'placement') {
        result.placement = value;
      }
      // Handle opacity parameter (convert to 0-100)
      else if (key === 'opacity') {
        const opacityValue = parseFloat(value);
        if (!isNaN(opacityValue)) {
          result.opacity = opacityValue;
        }
      }
      // Handle tile parameter (boolean)
      else if (key === 'tile') {
        result.tile = value.toLowerCase() === 'true';
      }
      // Handle offset parameter
      else if (key === 'offset') {
        const offsetValue = parseFloat(value);
        if (!isNaN(offsetValue)) {
          result.offset = offsetValue;
        }
      }
      // Other parameters
      else {
        // Convert to appropriate type (number, boolean, string)
        if (value.toLowerCase() === 'true') {
          result[key] = true;
        } else if (value.toLowerCase() === 'false') {
          result[key] = false;
        } else if (!isNaN(Number(value))) {
          result[key] = Number(value);
        } else {
          result[key] = value;
        }
      }
    }
  }
  
  return result;
}

/**
 * Split parameters while respecting quoted values
 * 
 * @param params Parameter string
 * @returns Array of parameter parts
 */
function splitParameters(params: string): string[] {
  const result: string[] = [];
  let currentParam = '';
  let inQuotes = false;
  
  for (let i = 0; i < params.length; i++) {
    const char = params[i];
    
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
      currentParam += char;
    } else if (char === ',' && !inQuotes) {
      result.push(currentParam);
      currentParam = '';
    } else {
      currentParam += char;
    }
  }
  
  // Add the last parameter
  if (currentParam) {
    result.push(currentParam);
  }
  
  return result;
}

/**
 * Parse Akamai's im.resize parameter which has format like "width:200,height:300,mode:fit"
 * 
 * @param resize Akamai resize parameter string
 * @returns Parsed parameter object
 */
function parseImResize(resize: string): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  
  // Handle different formats
  // Format 1: key:value,key:value
  // Format 2: key=value,key=value
  // Format 3: width,height (shorthand)
  
  if (resize.includes(':')) {
    // Format 1: key:value,key:value
    resize.split(',').forEach(part => {
      const [key, value] = part.split(':');
      if (key && value) {
        // Convert numeric values
        if (['width', 'height'].includes(key.trim())) {
          const numValue = parseInt(value.trim(), 10);
          result[key.trim()] = isNaN(numValue) ? value.trim() : numValue;
        } else {
          result[key.trim()] = value.trim();
        }
      }
    });
  } else if (resize.includes('=')) {
    // Format 2: key=value,key=value
    resize.split(',').forEach(part => {
      const [key, value] = part.split('=');
      if (key && value) {
        // Convert numeric values
        if (['width', 'height'].includes(key.trim())) {
          const numValue = parseInt(value.trim(), 10);
          result[key.trim()] = isNaN(numValue) ? value.trim() : numValue;
        } else {
          result[key.trim()] = value.trim();
        }
      }
    });
  } else if (resize.match(/^\d+,\d+$/)) {
    // Format 3: width,height (shorthand)
    const [width, height] = resize.split(',').map(part => parseInt(part.trim(), 10));
    if (!isNaN(width)) result.width = width;
    if (!isNaN(height)) result.height = height;
  } else if (resize.match(/^\d+$/)) {
    // Format 4: just a width
    const width = parseInt(resize.trim(), 10);
    if (!isNaN(width)) result.width = width;
  }
  
  return result;
}

/**
 * Detect if a URL is using Akamai Image Manager format
 * 
 * @param url URL to check
 * @returns True if URL appears to use Akamai Image Manager parameters
 */
export function isAkamaiFormat(url: URL): boolean {
  // Check for common Akamai Image Manager parameters
  const akamaiParams = [
    'im.resize', 'im.crop', 'im.quality', 'im.format', 'im.rotate',
    'im.grayscale', 'im.contrast', 'im.brightness', 'im.sharpen',
    'im.background', 'im.metadata', 'im.frame', 'im.composite'
  ];
  
  // Check if any Akamai parameters are present
  return Array.from(url.searchParams.keys())
    .some(key => akamaiParams.some(param => key.toLowerCase() === param.toLowerCase()));
}

/**
 * Parse Akamai Image Manager path format (if using path segment notation)
 * 
 * @param path URL path to parse
 * @returns URL with extracted parameters added to search params
 */
export function parseAkamaiPath(path: string, baseUrl?: string): URL {
  // Handle paths like: /images/im-resize=width:200/image.jpg
  // or: /images/im(resize=width:200,quality=80)/image.jpg
  
  // Create a URL object (either with provided base or dummy base)
  const url = baseUrl 
    ? new URL(path, baseUrl) 
    : new URL(path, 'https://example.com');
  
  // Path with im-param=value format
  const imParamRegex = /\/im-([\w.]+)=([^/]+)/g;
  let match;
  let modified = false;
  
  // Clone the pathname to work with
  let pathname = url.pathname;
  
  // Find all im-param=value patterns
  while ((match = imParamRegex.exec(pathname)) !== null) {
    const [fullMatch, param, value] = match;
    url.searchParams.set(`im.${param}`, value);
    pathname = pathname.replace(fullMatch, '');
    modified = true;
  }
  
  // Path with im(...) format
  const imGroupRegex = /\/im\(([^)]+)\)/g;
  while ((match = imGroupRegex.exec(pathname)) !== null) {
    const [fullMatch, paramsGroup] = match;
    
    // Split the parameter group by commas, unless in quotes
    const params = paramsGroup.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    
    for (const param of params) {
      // Handle param=value format
      const [key, value] = param.split('=');
      if (key && value) {
        url.searchParams.set(`im.${key.trim()}`, value.trim().replace(/"/g, ''));
      }
    }
    
    pathname = pathname.replace(fullMatch, '');
    modified = true;
  }
  
  // Update the pathname if modified
  if (modified) {
    url.pathname = pathname;
  }
  
  return url;
}

/**
 * Convert URL with Akamai parameters to Cloudflare URL format
 * 
 * @param url URL with Akamai parameters
 * @returns URL with Cloudflare parameters
 */
export function convertToCloudflareUrl(url: URL): URL {
  logger.debug('Converting Akamai URL to Cloudflare format', { originalUrl: url.toString() });
  logger.breadcrumb('Converting Akamai URL format', undefined, { originalUrl: url.toString() });
  
  // Create a new URL object to avoid modifying the original
  const cfUrl = new URL(url.toString());
  
  // First check for path-based parameters
  logger.debug('Checking for path-based parameters', { pathname: url.pathname });
  const parseStart = Date.now();
  const parsedUrl = parseAkamaiPath(url.pathname, url.origin);
  const parseEnd = Date.now();
  logger.breadcrumb('Checked path-based parameters', parseEnd - parseStart, { pathname: url.pathname });
  
  // Copy any parameters found in the path to the query string
  const pathParams: Record<string, string> = {};
  for (const [key, value] of parsedUrl.searchParams.entries()) {
    if (key.startsWith('im.') && !cfUrl.searchParams.has(key)) {
      cfUrl.searchParams.set(key, value);
      pathParams[key] = value;
    }
  }
  
  if (Object.keys(pathParams).length > 0) {
    logger.debug('Found path parameters', { pathParams });
  }
  
  // If the path was modified, update it
  if (parsedUrl.pathname !== url.pathname) {
    logger.debug('Path was modified', { 
      originalPath: url.pathname, 
      newPath: parsedUrl.pathname 
    });
    cfUrl.pathname = parsedUrl.pathname;
  }
  
  // Now translate Akamai parameters to Cloudflare parameters
  logger.debug('Translating Akamai parameters to Cloudflare parameters');
  
  // Log all the parameters we're about to translate
  logger.breadcrumb('Starting Akamai parameter translation', undefined, {
    akamaiParams: Array.from(cfUrl.searchParams.entries())
      .filter(([key]) => key.startsWith('im.'))
      .map(([key, value]) => `${key}=${value}`)
      .join('&'),
    hasAspectCrop: cfUrl.searchParams.has('im.aspectCrop'),
    hasResize: cfUrl.searchParams.has('im.resize'),
    allSearchParams: Array.from(cfUrl.searchParams.entries()).length
  });
  
  const translateStart = Date.now();
  const cfParams = translateAkamaiParams(cfUrl);
  const translateEnd = Date.now();
  const translateDuration = translateEnd - translateStart;
  
  logger.debug('Translated parameters', { cfParams });
  logger.breadcrumb('Translated Akamai parameters', translateDuration, { 
    paramCount: Object.keys(cfParams).length,
    translationDurationMs: translateDuration,
    isSlow: translateDuration > 500,
    hasWidth: !!cfParams.width,
    hasHeight: !!cfParams.height,
    hasFit: !!cfParams.fit,
    allParams: Object.keys(cfParams).join(',')
  });
  
  // Remove all Akamai parameters
  const removedParams: string[] = [];
  for (const key of Array.from(cfUrl.searchParams.keys())) {
    if (key.startsWith('im.')) {
      cfUrl.searchParams.delete(key);
      removedParams.push(key);
    }
  }
  
  if (removedParams.length > 0) {
    logger.debug('Removed Akamai parameters', { removedParams });
  }
  
  // Add Cloudflare parameters
  const addedParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(cfParams)) {
    if (value !== undefined && value !== null) {
      // Special handling for objects like trim
      if (typeof value === 'object' && !Array.isArray(value)) {
        if (key === 'trim' && 'top' in value && 'right' in value && 'bottom' in value && 'left' in value) {
          // Convert trim object to string format
          const { top, right, bottom, left } = value as {top: number, right: number, bottom: number, left: number};
          const trimValue = `${top};${right};${bottom};${left}`;
          cfUrl.searchParams.set(key, trimValue);
          addedParams[key] = trimValue;
        } else {
          // General object handling - serialize as JSON
          const jsonValue = JSON.stringify(value);
          cfUrl.searchParams.set(key, jsonValue);
          addedParams[key] = jsonValue;
        }
      } else {
        // For simple values, just convert to string
        const stringValue = String(value);
        cfUrl.searchParams.set(key, stringValue);
        addedParams[key] = stringValue;
      }
    }
  }
  
  if (Object.keys(addedParams).length > 0) {
    logger.debug('Added Cloudflare parameters', { addedParams });
  }
  
  logger.debug('Conversion complete', { convertedUrl: cfUrl.toString() });
  return cfUrl;
}