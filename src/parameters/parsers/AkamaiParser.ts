/**
 * Akamai parameter parser
 *
 * Handles Akamai Image Manager syntax like:
 * - im=AspectCrop=(1,1)
 * - im.resize=width:400
 */

import { ParameterParser } from "../interfaces";
import { Logger } from "../../utils/logging";
import { TransformParameter } from "../../utils/path";
import { parameterRegistry } from "../registry";
import { defaultLogger } from "../../utils/logging";

export class AkamaiParser implements ParameterParser {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }

  /**
   * This parser can handle URLs with Akamai Image Manager parameters
   */
  canParse(input: string | URLSearchParams | Request): boolean {
    let searchParams: URLSearchParams;

    if (input instanceof Request) {
      const url = new URL(input.url);
      searchParams = url.searchParams;
    } else if (input instanceof URLSearchParams) {
      searchParams = input;
    } else if (typeof input === "string") {
      // If string starts with ?, remove it
      const queryString = input.startsWith("?") ? input.substring(1) : input;
      try {
        searchParams = new URLSearchParams(queryString);
      } catch (e) {
        return false;
      }
    } else {
      return false;
    }

    // Check for 'im' parameter or parameters starting with 'im.'
    if (
      searchParams.has("im") ||
      Array.from(searchParams.keys()).some((key) => key.startsWith("im."))
    ) {
      return true;
    }

    // Check for specific Akamai parameters
    const akamaiSpecificParams = [
      "imwidth",
      "imheight",
      "impolicy",
      "imcolor",
      "imquality",
      "imformat",
      "imbypass",
      "imcrop",
      "imrotate",
      "imdensity",
    ];

    for (const param of akamaiSpecificParams) {
      if (searchParams.has(param)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parse Akamai-style parameters
   */
  parse(input: string | URLSearchParams | Request): TransformParameter[] {
    this.logger.breadcrumb("AkamaiParser parsing parameters");

    let searchParams: URLSearchParams;

    if (input instanceof Request) {
      const url = new URL(input.url);
      searchParams = url.searchParams;
    } else if (input instanceof URLSearchParams) {
      searchParams = input;
    } else if (typeof input === "string") {
      // If string starts with ?, remove it
      const queryString = input.startsWith("?") ? input.substring(1) : input;
      searchParams = new URLSearchParams(queryString);
    } else {
      this.logger.error("Unsupported input type for AkamaiParser");
      return [];
    }

    const parameters: TransformParameter[] = [];
    
    // We don't need to handle standard 'overlay' parameter here - that should be 
    // handled by the StandardParser. The AkamaiParser should focus on Akamai formats.

    // Check for im.composite or im.watermark parameter
    if (searchParams.has("im.composite") || searchParams.has("im.watermark")) {
      const compositeValue = searchParams.get("im.composite") || searchParams.get("im.watermark") || "";
      
      // Check if the composite parameter contains a placement value
      if (compositeValue.includes("placement:") || compositeValue.includes("placement=")) {
        // Extract the placement value from format like placement:southeast or placement=southeast 
        const placementMatch = compositeValue.match(/placement[=:](\w+)/i);
        if (placementMatch && placementMatch[1]) {
          const placementValue = placementMatch[1];
          
          // Pass the placement as gravity - formatter in registry will handle translation
          parameters.push({
            name: "gravity",
            value: placementValue,
            source: "akamai",
            priority: 90
          });
          
          this.logger.debug('Found placement in im.composite parameter', {
            placement: placementValue
          });
        }
      }
    }
    
    // Check for gravity parameter directly
    if (searchParams.has('gravity')) {
      const gravityValue = searchParams.get('gravity') || '';
      // Add as gravity parameter - formatter in registry will handle translation
      parameters.push({
        name: "gravity",
        value: gravityValue,
        source: "akamai",
        priority: 90
      });
      
      this.logger.debug('Found gravity parameter', {
        value: gravityValue
      });
    }
    
    // Parse dot notation: im.resize=width:400
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith("im.")) {
        const akamaiParam = key.substring(3); // Remove 'im.'
        this.logger.debug("Found Akamai dot notation parameter", {
          param: akamaiParam,
          value,
        });

        const transformParams = this.parseDotNotation(akamaiParam, value);
        parameters.push(...transformParams);
      }
    }

    // Parse equals notation: im=AspectCrop=(1,1)
    if (searchParams.has("im")) {
      const imValue = searchParams.get("im") || "";
      this.logger.debug("Found Akamai equals notation parameter", {
        value: imValue,
      });

      // Check for Akamai Composite native syntax (case sensitive)
      if (imValue.startsWith("Composite") || imValue.startsWith("Watermark")) {
        this.logger.debug("Found Akamai native Composite/Watermark syntax", { imValue });
        
        // Extract all parameters from the Composite syntax
        // Example: Composite,image=(url=http://..),placement=southeast,opacity=0.8
        
        this.logger.info("Processing Akamai Composite syntax", { 
          value: imValue
        });
        
        // Extract image URL from Akamai native syntax
        // Format: image=(url=http://...)
        const nativeUrlMatch = imValue.match(/image=\(url[=:]([^)]+)\)/i);
        if (nativeUrlMatch && nativeUrlMatch[1]) {
          parameters.push({
            name: "overlay",
            value: nativeUrlMatch[1],
            source: "akamai",
            priority: 90
          });
          
          this.logger.info("Extracted overlay URL from Akamai native Composite syntax", {
            url: nativeUrlMatch[1]
          });
        } else {
          // Try alternate format: image=(url=http) or image=http
          const alternateUrlMatch = imValue.match(/image=([^,]+)/i);
          if (alternateUrlMatch && alternateUrlMatch[1]) {
            // Clean up the URL - remove parentheses if present
            let url = alternateUrlMatch[1].trim();
            if (url.startsWith('(') && url.endsWith(')')) {
              url = url.substring(1, url.length - 1);
            }
            
            parameters.push({
              name: "overlay",
              value: url,
              source: "akamai",
              priority: 90
            });
            
            this.logger.info("Extracted alternate overlay URL format from Composite syntax", {
              url
            });
          }
        }
        
        // Extract placement/gravity from native syntax
        const nativePlacementMatch = imValue.match(/placement[=:](\w+)/i);
        if (nativePlacementMatch && nativePlacementMatch[1]) {
          parameters.push({
            name: "gravity",
            value: nativePlacementMatch[1],
            source: "akamai",
            priority: 90
          });
          
          this.logger.info("Extracted placement from Akamai native Composite syntax", {
            placement: nativePlacementMatch[1]
          });
        }
        
        // Extract other parameters from Composite
        // Opacity
        const nativeOpacityMatch = imValue.match(/opacity[=:]([.\d]+)/i);
        if (nativeOpacityMatch && nativeOpacityMatch[1]) {
          const opacityValue = parseFloat(nativeOpacityMatch[1]);
          if (!isNaN(opacityValue) && opacityValue >= 0 && opacityValue <= 1) {
            parameters.push({
              name: "draw",
              value: JSON.stringify([{ opacity: opacityValue }]),
              source: "akamai",
              priority: 85
            });
            
            this.logger.debug("Extracted opacity from Akamai native Composite syntax", {
              opacity: opacityValue
            });
          }
        }
        
        // Width/Height
        const nativeWidthMatch = imValue.match(/width[=:](\d+)/i);
        const nativeHeightMatch = imValue.match(/height[=:](\d+)/i);
        const nativeScaleMatch = imValue.match(/scale[=:]([.\d]+)/i);
        
        if (nativeWidthMatch || nativeHeightMatch || nativeScaleMatch) {
          const drawParams: Record<string, number> = {};
          
          if (nativeWidthMatch && nativeWidthMatch[1]) {
            drawParams.width = parseInt(nativeWidthMatch[1], 10);
          }
          
          if (nativeHeightMatch && nativeHeightMatch[1]) {
            drawParams.height = parseInt(nativeHeightMatch[1], 10);
          }
          
          if (nativeScaleMatch && nativeScaleMatch[1]) {
            const scale = parseFloat(nativeScaleMatch[1]);
            if (!isNaN(scale) && !drawParams.width) {
              // Convert scale (0-1) to percentage width
              drawParams.width = Math.round(scale * 100);
            }
          }
          
          if (Object.keys(drawParams).length > 0) {
            parameters.push({
              name: "draw",
              value: JSON.stringify([drawParams]),
              source: "akamai",
              priority: 85
            });
            
            this.logger.debug("Extracted size parameters from Akamai native Composite syntax", {
              size: drawParams
            });
          }
        }
        
        // Handle x/y offsets and size in the Composite syntax
        const nativeXMatch = imValue.match(/(?:x|dx)[=:](-?\d+)/i);
        const nativeYMatch = imValue.match(/(?:y|dy)[=:](-?\d+)/i);
        const nativeSizeMatch = imValue.match(/(?:size|width)[=:](\d+)/i);
        
        // Create a draw parameter that will be used later
        const drawParams: Record<string, number | string> = {
          url: "PLACEHOLDER_URL" // Will be replaced with the actual URL
        };
        
        // First add the URL if we found one
        if (nativeUrlMatch && nativeUrlMatch[1]) {
          drawParams.url = nativeUrlMatch[1];
        }
        
        // Add positioning based on placement
        if (nativePlacementMatch && nativePlacementMatch[1]) {
          const placement = nativePlacementMatch[1].toLowerCase();
          
          // Get the x/y values
          const xOffset = nativeXMatch && nativeXMatch[1] ? 
            parseInt(nativeXMatch[1], 10) : 20; // Default to 20px if not specified
          
          const yOffset = nativeYMatch && nativeYMatch[1] ? 
            parseInt(nativeYMatch[1], 10) : 20; // Default to 20px if not specified
          
          this.logger.info("Processing Akamai position parameters", {
            placement,
            xOffset,
            yOffset
          });
          
          // Apply offsets based on placement
          if (placement.includes('south') || placement === 'bottom') {
            drawParams.bottom = yOffset;
          } else if (placement.includes('north') || placement === 'top') {
            drawParams.top = yOffset;
          }
          
          if (placement.includes('east') || placement === 'right') {
            drawParams.right = xOffset;
          } else if (placement.includes('west') || placement === 'left') {
            drawParams.left = xOffset;
          }
          
          // For center, use both top and left
          if (placement === 'center') {
            drawParams.top = yOffset;
            drawParams.left = xOffset;
          }
        }
        
        // Add size parameter if specified
        if (nativeSizeMatch && nativeSizeMatch[1]) {
          const size = parseInt(nativeSizeMatch[1], 10);
          if (!isNaN(size) && size > 0) {
            drawParams.width = size;
            
            this.logger.info("Added size parameter to watermark", {
              width: size
            });
          }
        }
        
        // If we have a valid URL and at least one positioning parameter, create the draw parameter
        if (drawParams.url !== "PLACEHOLDER_URL" && 
            (drawParams.top !== undefined || 
             drawParams.bottom !== undefined || 
             drawParams.left !== undefined || 
             drawParams.right !== undefined)) {
          
          // Create the actual draw parameter
          parameters.push({
            name: "draw",
            value: JSON.stringify([drawParams]),
            source: "akamai",
            priority: 95 // High priority to override any other draw parameters
          });
          
          this.logger.info("Created complete draw parameter from Composite syntax", {
            drawParams: JSON.stringify(drawParams)
          });
        }
      } else {
        // Handle regular transforms (not Composite/Watermark)
        // Parse the main transform first
        const transformParams = this.parseEqualsNotation(imValue);
        parameters.push(...transformParams);

        // Check for nested parameters within the im= value
        // Formats like im=AspectCrop=(1,1),f=m,width=800
        if (
          imValue.includes("f=") || imValue.includes("w=") ||
          imValue.includes("h=") ||
          imValue.includes("r=") || imValue.includes("p=") ||
          imValue.includes("width=") ||
          imValue.includes("height=")
        ) {
          this.logger.debug("Found nested parameters in im= value", { imValue });

          // Parse nested compact parameters (f=, w=, etc.)
          const nestedParams = this.parseNestedParameters(imValue);
          parameters.push(...nestedParams);
        }
      }
    }

    // Parse specific Akamai parameters
    const akamaiSpecificMappings = {
      "imwidth": "width",
      "imheight": "height",
      "imquality": "quality",
      "imformat": "format",
      "imrotate": "rotate",
    };
    
    // Check for overlay-specific width parameter (width for the overlay)
    if (searchParams.has("overlay") && searchParams.has("width")) {
      // If we have both overlay and width, the width is for the overlay
      const overlayWidth = searchParams.get("width");
      if (overlayWidth) {
        const numValue = parseInt(overlayWidth, 10);
        if (!isNaN(numValue)) {
          this.logger.debug('Found overlay width parameter', {
            width: numValue
          });
          
          // Add the width directly as a parameter with source 'akamai'
          // It will be properly handled by mergeDrawParameters later
          parameters.push({
            name: "width",
            value: numValue,
            source: "akamai",
            priority: 82
          });
          
          // Remove the width parameter from searchParams so it doesn't get processed again
          searchParams.delete("width");
        }
      }
    }

    // Add debug logging for Akamai parameters
    this.logger.debug("Checking for Akamai specific parameters", {
      searchParams: Array.from(searchParams.entries()).map(([k, v]) =>
        `${k}=${v}`
      ).join(", "),
      hasImwidth: searchParams.has("imwidth"),
    });

    for (
      const [akamaiParam, cloudflareParam] of Object.entries(
        akamaiSpecificMappings,
      )
    ) {
      if (searchParams.has(akamaiParam)) {
        const value = searchParams.get(akamaiParam) || "";
        this.logger.debug(`Found Akamai specific parameter: ${akamaiParam}`, {
          value,
        });

        // Convert value to appropriate type
        let parsedValue: string | number | boolean = value;

        // Handle numeric parameters
        if (
          ["width", "height", "quality", "rotate"].includes(cloudflareParam)
        ) {
          const numValue = parseInt(value, 10);
          if (!isNaN(numValue)) {
            parsedValue = numValue;
          }
        }

        // For imwidth and imheight, pass through as is (we'll convert in the processor)
        if (akamaiParam === "imwidth" || akamaiParam === "imheight") {
          const numValue = parseInt(value, 10);
          if (!isNaN(numValue)) {
            this.logger.debug(`Processing ${akamaiParam} parameter`, {
              rawValue: value,
              parsedValue: numValue,
            });

            parameters.push({
              name: akamaiParam, // Keep original name
              value: numValue,
              source: "akamai",
              priority: 90, // Higher priority for direct parameters
            });
          }
          continue; // Skip the default mapping for these parameters
        }

        parameters.push({
          name: cloudflareParam,
          value: parsedValue,
          source: "akamai",
          priority: 90, // Higher priority for direct parameters
        });
      }
    }

    // Handle special Akamai parameters
    if (searchParams.has("impolicy")) {
      const policy = searchParams.get("impolicy") || "";
      if (policy.toLowerCase() === "letterbox") {
        parameters.push({
          name: "fit",
          value: "pad",
          source: "akamai",
          priority: 80,
        });
      } else if (policy.toLowerCase() === "cropfit") {
        parameters.push({
          name: "fit",
          value: "cover",
          source: "akamai",
          priority: 80,
        });
      }
    }

    if (searchParams.has("imcolor")) {
      const color = searchParams.get("imcolor") || "";
      parameters.push({
        name: "background",
        value: `#${color}`,
        source: "akamai",
        priority: 80,
      });
    }

    if (searchParams.has("imcrop")) {
      const crop = searchParams.get("imcrop") || "";
      if (crop.includes(",")) {
        // Format is usually x,y,width,height
        const parts = crop.split(",").map((p) => parseInt(p, 10));
        if (parts.length === 4) {
          // Convert to trim format (top,right,bottom,left)
          parameters.push({
            name: "trim",
            value: `${parts[1]};${parts[0] + parts[2]};${parts[1] + parts[3]};${
              parts[0]
            }`,
            source: "akamai",
            priority: 80,
          });
        }
      }
    }

    // Merge draw parameters if needed - THIS IS THE CRITICAL STEP
    this.logger.info('About to call mergeDrawParameters', {
      hasOverlay: parameters.some(p => p.name === 'overlay'),
      hasGravity: parameters.some(p => p.name === 'gravity'),
      paramCount: parameters.length
    });
    
    this.mergeDrawParameters(parameters);
    
    this.logger.info('After mergeDrawParameters call', {
      hasDraw: parameters.some(p => p.name === 'draw'),
      parameters: parameters.map(p => p.name).join(', ')
    });
    
    this.logger.breadcrumb("AkamaiParser completed parsing", undefined, {
      parameterCount: parameters.length,
    });

    return parameters;
  }
  
  /**
   * Merge multiple draw parameters into a single coherent parameter
   * This ensures that all overlay properties (width, opacity, position) 
   * are applied to the right overlay object
   */
  private mergeDrawParameters(parameters: TransformParameter[]): void {
    // Add debug logging to see if this method is being called
    this.logger.info('mergeDrawParameters called', {
      paramCount: parameters.length,
      hasOverlay: parameters.some(p => p.name === 'overlay'),
      hasGravity: parameters.some(p => p.name === 'gravity'),
      hasDx: parameters.some(p => p.name === 'dx'),
      hasDy: parameters.some(p => p.name === 'dy'),
      params: parameters.map(p => p.name).join(', ')
    });
    
    // Find all existing draw parameters - we'll need to merge their properties
    const drawParams = parameters.filter(param => param.name === 'draw');
    
    // Find the overlay parameter if it exists
    const overlayParam = parameters.find(param => param.name === 'overlay');
    
    // If we don't have an overlay, nothing to do
    if (!overlayParam) {
      this.logger.info('No overlay parameter found, skipping draw merging');
      return;
    }
    
    // Find gravity parameter for overlay positioning
    const gravityParam = parameters.find(param => param.name === 'gravity');
    
    // Find dx/dy parameters for overlay positioning
    const dxParam = parameters.find(param => param.name === 'dx');
    const dyParam = parameters.find(param => param.name === 'dy');
    
    this.logger.info('Setting up overlay/watermark with draw syntax', {
      hasGravity: !!gravityParam,
      hasDx: !!dxParam,
      hasDy: !!dyParam,
      hasExistingDraw: drawParams.length > 0,
      overlay: String(overlayParam.value),
      gravityValue: gravityParam ? String(gravityParam.value) : null,
      dxValue: dxParam ? String(dxParam.value) : null,
      dyValue: dyParam ? String(dyParam.value) : null
    });
    
    // Create a draw object with overlay URL
    const drawObj: Record<string, string | number | boolean> = {
      url: String(overlayParam.value)
    };
    
    // If we have a width parameter for the overlay
    const widthParam = parameters.find(p => p.name === 'width' && p.source === 'akamai');
    if (widthParam && widthParam.value !== undefined) {
      const widthValue = typeof widthParam.value === 'string' ? 
        parseInt(widthParam.value, 10) : Number(widthParam.value);
        
      if (!isNaN(widthValue)) {
        drawObj.width = widthValue;
        
        this.logger.debug('Added width to draw object', {
          width: widthValue
        });
        
        // Remove the width parameter so it doesn't get applied to the main image
        const widthIndex = parameters.findIndex(p => p === widthParam);
        if (widthIndex !== -1) {
          parameters.splice(widthIndex, 1);
        }
      }
    }
    
    // Handle positioning based on gravity
    if (gravityParam && typeof gravityParam.value === 'string') {
      const gravity = String(gravityParam.value).toLowerCase();
      
      // Map common gravity/placement values to Cloudflare's positioning properties
      const gravityMap: Record<string, [string | null, string | null]> = {
        'southeast': ['bottom', 'right'],
        'southwest': ['bottom', 'left'],
        'northeast': ['top', 'right'],
        'northwest': ['top', 'left'],
        'south': ['bottom', null],
        'north': ['top', null],
        'east': [null, 'right'],
        'west': [null, 'left'],
        'center': [null, null],
        'bottomright': ['bottom', 'right'],
        'bottomleft': ['bottom', 'left'],
        'topright': ['top', 'right'],
        'topleft': ['top', 'left']
      };
      
      // Get vertical and horizontal positioning
      const [verticalPos, horizontalPos] = gravityMap[gravity] || [null, null];
      
      // Get offsets from dx/dy parameters
      const dxValue = dxParam && dxParam.value ? 
        (typeof dxParam.value === 'string' ? parseInt(dxParam.value, 10) : Number(dxParam.value)) : 
        20; // Default offset
        
      const dyValue = dyParam && dyParam.value ? 
        (typeof dyParam.value === 'string' ? parseInt(dyParam.value, 10) : Number(dyParam.value)) : 
        20; // Default offset
      
      // Apply positioning to draw object
      if (verticalPos === 'bottom') {
        drawObj.bottom = dyValue;
      } else if (verticalPos === 'top') {
        drawObj.top = dyValue;
      }
      
      if (horizontalPos === 'right') {
        drawObj.right = dxValue;
      } else if (horizontalPos === 'left') {
        drawObj.left = dxValue;
      }
      
      this.logger.info('Mapped gravity to positioning', {
        gravity,
        verticalPos,
        horizontalPos,
        dxValue,
        dyValue,
        drawObj: JSON.stringify(drawObj)
      });
    } 
    // Default to bottom-right if no gravity specified
    else {
      const dxValue = dxParam && dxParam.value ? 
        (typeof dxParam.value === 'string' ? parseInt(dxParam.value, 10) : Number(dxParam.value)) : 
        20; // Default offset
        
      const dyValue = dyParam && dyParam.value ? 
        (typeof dyParam.value === 'string' ? parseInt(dyParam.value, 10) : Number(dyParam.value)) : 
        20; // Default offset
      
      drawObj.bottom = dyValue;
      drawObj.right = dxValue;
      
      this.logger.info('Using default bottom-right positioning', {
        bottom: dyValue,
        right: dxValue
      });
    }
    
    // Process any existing draw parameters and merge their properties
    let mergedDrawArray: Record<string, any>[] = [drawObj];
    
    // Try to merge any existing draw parameters
    if (drawParams.length > 0) {
      this.logger.info('Found existing draw parameters to merge', {
        count: drawParams.length
      });
      
      // Process and merge each existing draw parameter
      drawParams.forEach(drawParam => {
        try {
          // Parse the draw parameter value
          let existingDrawObjects: Record<string, any>[] = [];
          
          if (typeof drawParam.value === 'string') {
            existingDrawObjects = JSON.parse(drawParam.value);
            if (!Array.isArray(existingDrawObjects)) {
              existingDrawObjects = [existingDrawObjects];
            }
          } else if (Array.isArray(drawParam.value)) {
            existingDrawObjects = drawParam.value;
          }
          
          // Handle each draw object
          if (existingDrawObjects.length > 0) {
            for (const existingObj of existingDrawObjects) {
              // If it has a URL that's different from our main overlay, treat it as a separate overlay
              if (existingObj.url && existingObj.url !== drawObj.url) {
                mergedDrawArray.push({...existingObj});
                this.logger.debug('Added separate overlay from existing draw parameter', {
                  url: existingObj.url
                });
                continue;
              }
              
              // For objects without URLs or with the same URL, merge properties carefully
              if (!existingObj.url || existingObj.url === drawObj.url) {
                const positionKeys = {
                  horizontal: ['left', 'right'],
                  vertical: ['top', 'bottom']
                };
                
                // Track whether we've already set positioning along each axis
                const hasPositioning = {
                  horizontal: positionKeys.horizontal.some(key => drawObj[key] !== undefined),
                  vertical: positionKeys.vertical.some(key => drawObj[key] !== undefined)
                };
                
                // Merge properties safely
                Object.entries(existingObj).forEach(([key, value]) => {
                  if (key === 'url') return; // Skip URL property
                  
                  // Handle horizontal positioning (left/right)
                  if (positionKeys.horizontal.includes(key) && !hasPositioning.horizontal) {
                    drawObj[key] = value;
                  }
                  // Handle vertical positioning (top/bottom)
                  else if (positionKeys.vertical.includes(key) && !hasPositioning.vertical) {
                    drawObj[key] = value;
                  }
                  // For all other non-positioning properties, merge them
                  else if (!positionKeys.horizontal.includes(key) && !positionKeys.vertical.includes(key)) {
                    drawObj[key] = value;
                  }
                });
                
                this.logger.debug('Merged properties from existing draw parameter', {
                  properties: Object.keys(existingObj).join(', '),
                  hasHorizontal: hasPositioning.horizontal,
                  hasVertical: hasPositioning.vertical
                });
              }
            }
          }
        } catch (error) {
          this.logger.warn('Failed to parse existing draw parameter', {
            error: (error as Error).message,
            value: drawParam.value
          });
        }
      });
    }
    
    // Now create a single draw parameter with all merged objects
    const finalDrawValue = JSON.stringify(mergedDrawArray);
    
    // Create the draw parameter with JSON array of objects
    parameters.push({
      name: 'draw',
      value: finalDrawValue,
      source: 'akamai',
      priority: 95
    });
    
    this.logger.info('Created final draw parameter for overlay', {
      drawObj: JSON.stringify(drawObj),
      finalValue: finalDrawValue
    });
    
    // Remove all existing draw parameters (we've merged them)
    const drawIndicesToRemove = parameters
      .map((param, index) => param.name === 'draw' && param.value !== finalDrawValue ? index : -1)
      .filter(index => index !== -1)
      .sort((a, b) => b - a); // Sort descending to remove from end to beginning
    
    drawIndicesToRemove.forEach(index => {
      parameters.splice(index, 1);
    });
    
    // Parameters to remove (we've handled these with the draw parameter)
    const paramsToRemove = ['overlay', 'gravity', 'dx', 'dy'];
    
    // Remove all the parameters we've handled
    for (const paramName of paramsToRemove) {
      const indicesToRemove = parameters
        .map((param, index) => param.name === paramName ? index : -1)
        .filter(index => index !== -1)
        .sort((a, b) => b - a); // Sort descending to remove from end to beginning
      
      indicesToRemove.forEach(index => {
        parameters.splice(index, 1);
      });
    }
    
    this.logger.info('Parameters after draw processing', {
      remaining: parameters.map(p => p.name).join(', ')
    });
  }

  /**
   * Parse Akamai dot notation parameters (im.resize=width:400)
   */
  private parseDotNotation(
    akamaiParam: string,
    value: string,
  ): TransformParameter[] {
    const parameters: TransformParameter[] = [];

    // Handle common Akamai parameters
    switch (akamaiParam.toLowerCase()) {
      case "resize":
        // Check if value is like width:400
        if (value.includes(":")) {
          const [subParam, subValue] = value.split(":");

          if (subParam === "width" || subParam === "height") {
            const numValue = parseInt(subValue, 10);
            if (!isNaN(numValue)) {
              parameters.push({
                name: subParam,
                value: numValue,
                source: "akamai",
                priority: 80, // Higher priority for explicit parameters
              });
            }
          }
        }
        // Add fit parameter for resize
        parameters.push({
          name: "fit",
          value: "scale-down",
          source: "akamai",
          priority: 75,
        });
        break;

      case "crop":
        // Handle Akamai crop parameters
        if (value.includes(":")) {
          const [subParam, subValue] = value.split(":");

          if (subParam === "width" || subParam === "height") {
            const numValue = parseInt(subValue, 10);
            if (!isNaN(numValue)) {
              parameters.push({
                name: subParam,
                value: numValue,
                source: "akamai",
                priority: 80,
              });
            }
          }
        }

        // Add fit parameter for crop
        parameters.push({
          name: "fit",
          value: "crop",
          source: "akamai",
          priority: 75,
        });
        break;

      case "composite":
      case "watermark":
        this.logger.debug('Processing im.composite/watermark parameter', {
          value
        });
        
        // For im.composite or im.watermark, parse the value
        // Format could be: placement:southeast,opacity:0.5,image:(url:https://...)
        
        // Extract placement/gravity
        const placementMatch = value.match(/placement[=:](\w+)/i);
        if (placementMatch && placementMatch[1]) {
          parameters.push({
            name: "gravity",
            value: placementMatch[1],
            source: "akamai",
            priority: 85,
          });
          
          this.logger.debug('Found placement in im.composite/watermark parameter', {
            placement: placementMatch[1]
          });
        }
        
        // Extract image URL
        const imageUrlMatch = value.match(/image[=:]\(url[=:]([^)]+)\)/i);
        if (imageUrlMatch && imageUrlMatch[1]) {
          parameters.push({
            name: "overlay",
            value: imageUrlMatch[1],
            source: "akamai",
            priority: 85,
          });
          
          this.logger.debug('Found image URL in im.composite/watermark parameter', {
            url: imageUrlMatch[1]
          });
        } else {
          // Try simpler format: image:url or image=url
          const simpleUrlMatch = value.match(/image[=:]([^,\s)]+)/i);
          if (simpleUrlMatch && simpleUrlMatch[1]) {
            parameters.push({
              name: "overlay",
              value: simpleUrlMatch[1],
              source: "akamai",
              priority: 85,
            });
            
            this.logger.debug('Found simple image URL in im.composite/watermark parameter', {
              url: simpleUrlMatch[1]
            });
          } else {
            // Try overlay format
            const overlayMatch = value.match(/overlay[=:]([^,\s)]+)/i);
            if (overlayMatch && overlayMatch[1]) {
              parameters.push({
                name: "overlay",
                value: overlayMatch[1],
                source: "akamai",
                priority: 85,
              });
              
              this.logger.debug('Found overlay URL in im.composite/watermark parameter', {
                url: overlayMatch[1]
              });
            }
          }
        }
        
        // Extract opacity
        const opacityMatch = value.match(/opacity[=:]([.\d]+)/i);
        if (opacityMatch && opacityMatch[1]) {
          const opacityValue = parseFloat(opacityMatch[1]);
          if (!isNaN(opacityValue) && opacityValue >= 0 && opacityValue <= 1) {
            parameters.push({
              name: "draw",
              value: JSON.stringify([{ opacity: opacityValue }]),
              source: "akamai",
              priority: 84,
            });
            
            this.logger.debug('Found opacity in im.composite/watermark parameter', {
              opacity: opacityValue
            });
          }
        }
        
        // Extract positioning offsets (dx, dy, x, y)
        const xMatch = value.match(/(?:x|dx)[=:](-?\d+)/i);
        const yMatch = value.match(/(?:y|dy)[=:](-?\d+)/i);
        
        if (xMatch || yMatch) {
          const drawParams: Record<string, number> = {};
          
          if (xMatch && xMatch[1]) {
            drawParams.left = parseInt(xMatch[1], 10);
          }
          
          if (yMatch && yMatch[1]) {
            drawParams.top = parseInt(yMatch[1], 10);
          }
          
          if (Object.keys(drawParams).length > 0) {
            parameters.push({
              name: "draw",
              value: JSON.stringify([drawParams]),
              source: "akamai",
              priority: 83,
            });
            
            this.logger.debug('Found positioning offsets in im.composite/watermark parameter', {
              offsets: drawParams
            });
          }
        }
        
        // Extract width/height for the overlay
        const widthMatch = value.match(/width[=:](\d+)/i);
        const heightMatch = value.match(/height[=:](\d+)/i);
        const scaleMatch = value.match(/scale[=:]([.\d]+)/i);
        
        if (widthMatch || heightMatch || scaleMatch) {
          const drawParams: Record<string, number> = {};
          
          if (widthMatch && widthMatch[1]) {
            drawParams.width = parseInt(widthMatch[1], 10);
          }
          
          if (heightMatch && heightMatch[1]) {
            drawParams.height = parseInt(heightMatch[1], 10);
          }
          
          if (scaleMatch && scaleMatch[1]) {
            const scale = parseFloat(scaleMatch[1]);
            if (!isNaN(scale) && !drawParams.width) {
              // If scale is specified but not width, use it as a percentage of width
              drawParams.width = Math.round(scale * 100);
            }
          }
          
          if (Object.keys(drawParams).length > 0) {
            parameters.push({
              name: "draw",
              value: JSON.stringify([drawParams]),
              source: "akamai",
              priority: 82,
            });
            
            this.logger.debug('Found size parameters in im.composite/watermark parameter', {
              size: drawParams
            });
          }
        }
        break;

      case "blur":
        parameters.push({
          name: "blur",
          value: value ? parseInt(value, 10) : 50,
          source: "akamai",
          priority: 75,
        });
        break;

      case "quality":
        parameters.push({
          name: "quality",
          value: parseInt(value, 10),
          source: "akamai",
          priority: 75,
        });
        break;

      case "rotate":
        parameters.push({
          name: "rotate",
          value: parseInt(value, 10),
          source: "akamai",
          priority: 75,
        });
        break;

      case "format":
        parameters.push({
          name: "format",
          value: value.toLowerCase(),
          source: "akamai",
          priority: 75,
        });
        break;
    }

    return parameters;
  }

  /**
   * Parse nested parameters inside an im= value
   * Example: im=AspectCrop=(1,1),f=m,width=800
   */
  private parseNestedParameters(imValue: string): TransformParameter[] {
    const parameters: TransformParameter[] = [];

    // Split by commas outside of parentheses
    // This is a simplified approach - for a robust solution, a proper parser is needed
    let inParens = 0;
    let currentPart = "";
    const parts: string[] = [];

    for (let i = 0; i < imValue.length; i++) {
      const char = imValue[i];

      if (char === "(") {
        inParens++;
        currentPart += char;
      } else if (char === ")") {
        inParens--;
        currentPart += char;
      } else if (char === "," && inParens === 0) {
        // Found a top-level comma, split here
        if (currentPart.trim()) {
          parts.push(currentPart.trim());
        }
        currentPart = "";
      } else {
        currentPart += char;
      }
    }

    // Add the last part
    if (currentPart.trim()) {
      parts.push(currentPart.trim());
    }

    // Process each part that looks like a parameter (has = in it)
    for (const part of parts) {
      const equalsIndex = part.indexOf("=");
      if (equalsIndex > 0) {
        const paramName = part.substring(0, equalsIndex).trim();
        const paramValue = part.substring(equalsIndex + 1).trim();

        this.logger.debug("Found nested parameter", {
          name: paramName,
          value: paramValue,
        });

        // Map common nested parameters
        switch (paramName.toLowerCase()) {
          case "f":
            // Size code
            parameters.push({
              name: "f",
              value: paramValue,
              source: "akamai",
              priority: 80,
            });
            break;

          case "w":
          case "width":
            // Width parameter
            const widthValue = parseInt(paramValue, 10);
            if (!isNaN(widthValue)) {
              parameters.push({
                name: "width",
                value: widthValue,
                source: "akamai",
                priority: 80,
              });
            }
            break;

          case "h":
          case "height":
            // Height parameter
            const heightValue = parseInt(paramValue, 10);
            if (!isNaN(heightValue)) {
              parameters.push({
                name: "height",
                value: heightValue,
                source: "akamai",
                priority: 80,
              });
            }
            break;

          case "r":
          case "aspect":
            // Aspect ratio
            parameters.push({
              name: "aspect",
              value: paramValue,
              source: "akamai",
              priority: 80,
            });
            break;

          case "p":
          case "focal":
            // Focal point
            parameters.push({
              name: "focal",
              value: paramValue,
              source: "akamai",
              priority: 80,
            });
            break;

          case "quality":
          case "q":
            // Quality parameter
            const qualityValue = parseInt(paramValue, 10);
            if (!isNaN(qualityValue)) {
              parameters.push({
                name: "quality",
                value: qualityValue,
                source: "akamai",
                priority: 80,
              });
            }
            break;

          case "format":
            // Format parameter
            parameters.push({
              name: "format",
              value: paramValue.toLowerCase(),
              source: "akamai",
              priority: 80,
            });
            break;

          default:
            // For other parameters, try to pass them through as-is
            parameters.push({
              name: paramName.toLowerCase(),
              value: paramValue,
              source: "akamai",
              priority: 70, // Lower priority for unknown parameters
            });
        }
      }
    }

    return parameters;
  }

  /**
   * Parse Akamai equals notation parameters (im=AspectCrop=(1,1))
   */
  private parseEqualsNotation(imValue: string): TransformParameter[] {
    const parameters: TransformParameter[] = [];

    // Extract the transform type and parameters
    const firstParenIndex = imValue.indexOf("(");
    const firstCommaIndex = imValue.indexOf(",");
    const firstEqualsIndex = imValue.indexOf("=", 1); // Skip the im= at the start

    let transformType = "";
    let remainingParams = "";

    // Determine the format of the parameter
    if (
      firstParenIndex > 0 &&
      (firstParenIndex < firstEqualsIndex || firstEqualsIndex === -1)
    ) {
      // Format: AspectCrop(1,1)
      transformType = imValue.substring(0, firstParenIndex).trim();
      remainingParams = imValue.substring(firstParenIndex);
    } else if (
      firstCommaIndex > 0 &&
      (firstCommaIndex < firstEqualsIndex || firstEqualsIndex === -1)
    ) {
      // Format: AspectCrop,param1=val1,param2=val2
      transformType = imValue.substring(0, firstCommaIndex).trim();
      remainingParams = imValue.substring(firstCommaIndex + 1);
    } else if (firstEqualsIndex > 0) {
      // Format: transform=value
      transformType = imValue.substring(0, firstEqualsIndex).trim();
      remainingParams = imValue.substring(firstEqualsIndex + 1);
    } else {
      // Just a transform name like "Grayscale"
      transformType = imValue.trim();
      remainingParams = "";
    }

    // Handle specific transformations
    switch (transformType.toLowerCase()) {
      case "aspectcrop":
        // Extract aspect ratio from formats like AspectCrop=(16,9) or AspectCrop(16,9)
        let aspectMatch = remainingParams.match(/\((\d+),(\d+)\)/);
        if (aspectMatch) {
          const aspectWidth = aspectMatch[1];
          const aspectHeight = aspectMatch[2];

          parameters.push({
            name: "aspect",
            value: `${aspectWidth}:${aspectHeight}`,
            source: "akamai",
            priority: 85,
          });

          // AspectCrop implies ctx=true
          parameters.push({
            name: "ctx",
            value: true,
            source: "akamai",
            priority: 80,
          });
        }

        // Extract focal point if present as xPosition and yPosition
        const xPosMatch = remainingParams.match(/xPosition=([.\d]+)/);
        const yPosMatch = remainingParams.match(/yPosition=([.\d]+)/);

        if (xPosMatch && yPosMatch) {
          parameters.push({
            name: "focal",
            value: `${xPosMatch[1]},${yPosMatch[1]}`,
            source: "akamai",
            priority: 85,
          });
        }
        break;

      case "resize":
        // Extract width and height from Resize=(width,height) or Resize,width=x,height=y
        let dimensionMatch = remainingParams.match(/\((\d+),(\d+)\)/);
        if (dimensionMatch) {
          parameters.push({
            name: "width",
            value: parseInt(dimensionMatch[1], 10),
            source: "akamai",
            priority: 85,
          });

          parameters.push({
            name: "height",
            value: parseInt(dimensionMatch[2], 10),
            source: "akamai",
            priority: 85,
          });
        } else {
          // Check for width=x,height=y format
          const widthMatch = remainingParams.match(/width=(\d+)/);
          const heightMatch = remainingParams.match(/height=(\d+)/);

          if (widthMatch) {
            parameters.push({
              name: "width",
              value: parseInt(widthMatch[1], 10),
              source: "akamai",
              priority: 85,
            });
          }

          if (heightMatch) {
            parameters.push({
              name: "height",
              value: parseInt(heightMatch[1], 10),
              source: "akamai",
              priority: 85,
            });
          }
        }

        // Resize always uses scale-down fit
        parameters.push({
          name: "fit",
          value: "scale-down",
          source: "akamai",
          priority: 80,
        });
        break;

      case "crop":
        // Extract width and height from Crop=(width,height) or Crop,width=x,height=y
        dimensionMatch = remainingParams.match(/\((\d+),(\d+)\)/);
        if (dimensionMatch) {
          parameters.push({
            name: "width",
            value: parseInt(dimensionMatch[1], 10),
            source: "akamai",
            priority: 85,
          });

          parameters.push({
            name: "height",
            value: parseInt(dimensionMatch[2], 10),
            source: "akamai",
            priority: 85,
          });
        } else {
          // Check for width=x,height=y format
          const widthMatch = remainingParams.match(/width=(\d+)/);
          const heightMatch = remainingParams.match(/height=(\d+)/);

          if (widthMatch) {
            parameters.push({
              name: "width",
              value: parseInt(widthMatch[1], 10),
              source: "akamai",
              priority: 85,
            });
          }

          if (heightMatch) {
            parameters.push({
              name: "height",
              value: parseInt(heightMatch[1], 10),
              source: "akamai",
              priority: 85,
            });
          }
        }

        // Check for rect=(x,y,w,h) format
        const rectMatch = remainingParams.match(
          /rect=\((\d+),(\d+),(\d+),(\d+)\)/,
        );
        if (rectMatch) {
          const trimValue = `${rectMatch[2]};${rectMatch[3]};${rectMatch[4]};${
            rectMatch[1]
          }`;
          parameters.push({
            name: "trim",
            value: trimValue,
            source: "akamai",
            priority: 85,
          });
        } else {
          // Crop always uses crop fit if rect isn't specified
          parameters.push({
            name: "fit",
            value: "crop",
            source: "akamai",
            priority: 80,
          });
        }
        break;

      case "blur":
        // Add a blur parameter with default of 50 or specified value
        let blurValue = 50;
        const blurMatch = remainingParams.match(/=(\d+)/);
        if (blurMatch) {
          blurValue = parseInt(blurMatch[1], 10);
          // Convert Akamai blur value to CF's 1-250 range (rough approximation)
          blurValue = Math.max(1, Math.min(250, blurValue * 25));
        }

        parameters.push({
          name: "blur",
          value: blurValue,
          source: "akamai",
          priority: 80,
        });
        break;

      case "rotate":
        // Extract rotation angle
        const rotateMatch = remainingParams.match(/=(\d+)|degrees=(\d+)/);
        if (rotateMatch) {
          const angle = parseInt(rotateMatch[1] || rotateMatch[2], 10);
          // Normalize to 0, 90, 180, 270
          const normalizedAngle = Math.round(angle / 90) * 90 % 360;

          parameters.push({
            name: "rotate",
            value: normalizedAngle,
            source: "akamai",
            priority: 80,
          });
        }
        break;

      case "contrast":
        // Extract contrast value
        const contrastMatch = remainingParams.match(
          /=([.\d]+)|contrast=([.\d]+)/,
        );
        if (contrastMatch) {
          const contrastValue = parseFloat(
            contrastMatch[1] || contrastMatch[2],
          );

          parameters.push({
            name: "contrast",
            value: contrastValue,
            source: "akamai",
            priority: 80,
          });
        }
        break;

      case "backgroundcolor":
        // Extract color value
        const colorMatch = remainingParams.match(
          /=([0-9a-fA-F]{6})|color=([0-9a-fA-F]{6})/,
        );
        if (colorMatch) {
          const colorValue = colorMatch[1] || colorMatch[2];

          parameters.push({
            name: "background",
            value: `#${colorValue}`,
            source: "akamai",
            priority: 80,
          });
        }
        break;

      case "mirror":
        // Handle mirror direction
        if (remainingParams.includes("horizontal")) {
          parameters.push({
            name: "flip",
            value: "h",
            source: "akamai",
            priority: 80,
          });
        } else if (remainingParams.includes("vertical")) {
          parameters.push({
            name: "flip",
            value: "v",
            source: "akamai",
            priority: 80,
          });
        }
        break;

      case "grayscale":
        // Set saturation to 0 for grayscale
        parameters.push({
          name: "saturation",
          value: 0,
          source: "akamai",
          priority: 80,
        });
        break;
        
      case "composite":
      case "watermark":
        // Parse composite/watermark parameters with Akamai syntax
        // Handle placement parameter which needs to be converted to gravity
        // Could be in format: placement=southeast or placement:southeast
        const placementMatch = remainingParams.match(/placement[=:](\w+)/i);
        if (placementMatch && placementMatch[1]) {
          // Add as gravity parameter - formatting will be handled by registry formatter
          parameters.push({
            name: "gravity",
            value: placementMatch[1],
            source: "akamai",
            priority: 85
          });
          
          this.logger.debug('Added placement as gravity parameter', {
            placement: placementMatch[1]
          });
        }
        
        // Check for Akamai native syntax (format - image=(url=...))
        const akamaiUrlMatch = remainingParams.match(/image=\(url[=:]([^)]+)\)/i);
        if (akamaiUrlMatch && akamaiUrlMatch[1]) {
          parameters.push({
            name: "overlay",
            value: akamaiUrlMatch[1],
            source: "akamai",
            priority: 85
          });
          
          this.logger.debug('Added overlay URL from Akamai composite syntax', {
            url: akamaiUrlMatch[1]
          });
        } 
        // Also check for alternate syntax formats
        else {
          // Check for simple image or overlay parameter (image=url or overlay=url)
          const simpleUrlMatch = remainingParams.match(/(?:image|overlay)[=:]([^,\s)]+)/i);
          if (simpleUrlMatch && simpleUrlMatch[1]) {
            parameters.push({
              name: "overlay",
              value: simpleUrlMatch[1],
              source: "akamai",
              priority: 85
            });
            
            this.logger.debug('Added overlay URL from simple parameter syntax', {
              url: simpleUrlMatch[1]
            });
          }
          
          // Standard overlay syntax
          const standardUrlMatch = remainingParams.match(/(?:image|overlay)[=:]\(url[=:]([^)]+)\)/i);
          if (standardUrlMatch && standardUrlMatch[1]) {
            parameters.push({
              name: "overlay",
              value: standardUrlMatch[1],
              source: "akamai",
              priority: 85
            });
            
            this.logger.debug('Added overlay URL from standard parameter syntax', {
              url: standardUrlMatch[1]
            });
          }
        }
        
        // Extract opacity if present
        const opacityMatch = remainingParams.match(/opacity[=:]([.\d]+)/i);
        if (opacityMatch && opacityMatch[1]) {
          const opacityValue = parseFloat(opacityMatch[1]);
          if (!isNaN(opacityValue) && opacityValue >= 0 && opacityValue <= 1) {
            parameters.push({
              name: "draw",
              value: JSON.stringify([{ opacity: opacityValue }]),
              source: "akamai",
              priority: 84 // Slightly lower than other draw parameters
            });
            
            this.logger.debug('Added opacity parameter from composite', {
              opacity: opacityValue
            });
          }
        }
        
        // Extract x and y offsets if present (for positioning)
        const xOffsetMatch = remainingParams.match(/(?:x|dx)[=:](-?\d+)/i);
        const yOffsetMatch = remainingParams.match(/(?:y|dy)[=:](-?\d+)/i);
        
        if (xOffsetMatch || yOffsetMatch) {
          const drawParams: Record<string, number> = {};
          
          if (xOffsetMatch && xOffsetMatch[1]) {
            const xOffset = parseInt(xOffsetMatch[1], 10);
            if (!isNaN(xOffset)) {
              drawParams.left = xOffset;
            }
          }
          
          if (yOffsetMatch && yOffsetMatch[1]) {
            const yOffset = parseInt(yOffsetMatch[1], 10);
            if (!isNaN(yOffset)) {
              drawParams.top = yOffset;
            }
          }
          
          if (Object.keys(drawParams).length > 0) {
            parameters.push({
              name: "draw",
              value: JSON.stringify([drawParams]),
              source: "akamai",
              priority: 83 // Slightly lower than other draw parameters
            });
            
            this.logger.debug('Added position offsets from composite', {
              offsets: drawParams
            });
          }
        }
        
        // Extract size/scale parameters if present
        const widthMatch = remainingParams.match(/(?:width)[=:](\d+)/i);
        const heightMatch = remainingParams.match(/(?:height)[=:](\d+)/i);
        const scaleMatch = remainingParams.match(/(?:scale)[=:]([.\d]+)/i);
        
        if (widthMatch || heightMatch || scaleMatch) {
          const drawParams: Record<string, number> = {};
          
          if (widthMatch && widthMatch[1]) {
            const width = parseInt(widthMatch[1], 10);
            if (!isNaN(width)) {
              drawParams.width = width;
            }
          }
          
          if (heightMatch && heightMatch[1]) {
            const height = parseInt(heightMatch[1], 10);
            if (!isNaN(height)) {
              drawParams.height = height;
            }
          }
          
          if (scaleMatch && scaleMatch[1]) {
            const scale = parseFloat(scaleMatch[1]);
            if (!isNaN(scale) && !drawParams.width) {
              // If scale is specified but not width, we'll use scale as width percentage
              drawParams.width = Math.round(scale * 100);
            }
          }
          
          if (Object.keys(drawParams).length > 0) {
            parameters.push({
              name: "draw",
              value: JSON.stringify([drawParams]),
              source: "akamai",
              priority: 82 // Slightly lower than other draw parameters
            });
            
            this.logger.debug('Added size parameters from composite', {
              size: drawParams
            });
          }
        }
        break;

      case "facecrop":
        // Face detection with cover fit
        parameters.push({
          name: "gravity",
          value: "face",
          source: "akamai",
          priority: 85,
        });

        parameters.push({
          name: "fit",
          value: "cover",
          source: "akamai",
          priority: 80,
        });
        break;

      case "featurecrop":
      case "smartcrop":
        // Extract width and height
        const fcWidthMatch = remainingParams.match(/width=(\d+)/);
        const fcHeightMatch = remainingParams.match(/height=(\d+)/);

        if (fcWidthMatch) {
          parameters.push({
            name: "width",
            value: parseInt(fcWidthMatch[1], 10),
            source: "akamai",
            priority: 85,
          });
        }

        if (fcHeightMatch) {
          parameters.push({
            name: "height",
            value: parseInt(fcHeightMatch[1], 10),
            source: "akamai",
            priority: 85,
          });
        }

        // Smart crop uses auto gravity
        parameters.push({
          name: "gravity",
          value: "auto",
          source: "akamai",
          priority: 85,
        });

        parameters.push({
          name: "fit",
          value: "cover",
          source: "akamai",
          priority: 80,
        });
        break;

      case "quality":
        // Extract quality value
        const qualityMatch = remainingParams.match(/=(\d+)/);
        if (qualityMatch) {
          const qualityValue = parseInt(qualityMatch[1], 10);

          parameters.push({
            name: "quality",
            value: qualityValue,
            source: "akamai",
            priority: 80,
          });
        }
        break;

      case "format":
        // Extract format value
        const formatMatch = remainingParams.match(/=(\w+)/);
        if (formatMatch) {
          const formatValue = formatMatch[1].toLowerCase();

          parameters.push({
            name: "format",
            value: formatValue,
            source: "akamai",
            priority: 80,
          });
        }
        break;
    }

    return parameters;
  }
}
