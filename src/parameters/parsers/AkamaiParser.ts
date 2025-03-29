/**
 * Akamai parameter parser
 * 
 * Handles Akamai Image Manager syntax like:
 * - im=AspectCrop=(1,1)
 * - im.resize=width:400
 */

import { ParameterParser } from '../interfaces';
import { Logger } from '../../utils/logging';
import { TransformParameter } from '../../utils/path';
import { parameterRegistry } from '../registry';
import { defaultLogger } from '../../utils/logging';

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
    } else if (typeof input === 'string') {
      // If string starts with ?, remove it
      const queryString = input.startsWith('?') ? input.substring(1) : input;
      try {
        searchParams = new URLSearchParams(queryString);
      } catch (e) {
        return false;
      }
    } else {
      return false;
    }
    
    // Check for 'im' parameter or parameters starting with 'im.'
    if (searchParams.has('im') || 
        Array.from(searchParams.keys()).some(key => key.startsWith('im.'))) {
      return true;
    }
    
    // Check for specific Akamai parameters
    const akamaiSpecificParams = [
      'imwidth', 'imheight', 'impolicy', 'imcolor', 'imquality',
      'imformat', 'imbypass', 'imcrop', 'imrotate', 'imdensity'
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
    this.logger.breadcrumb('AkamaiParser parsing parameters');
    
    let searchParams: URLSearchParams;
    
    if (input instanceof Request) {
      const url = new URL(input.url);
      searchParams = url.searchParams;
    } else if (input instanceof URLSearchParams) {
      searchParams = input;
    } else if (typeof input === 'string') {
      // If string starts with ?, remove it
      const queryString = input.startsWith('?') ? input.substring(1) : input;
      searchParams = new URLSearchParams(queryString);
    } else {
      this.logger.error('Unsupported input type for AkamaiParser');
      return [];
    }
    
    const parameters: TransformParameter[] = [];
    
    // Parse dot notation: im.resize=width:400
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith('im.')) {
        const akamaiParam = key.substring(3); // Remove 'im.'
        this.logger.debug('Found Akamai dot notation parameter', { param: akamaiParam, value });
        
        const transformParams = this.parseDotNotation(akamaiParam, value);
        parameters.push(...transformParams);
      }
    }
    
    // Parse equals notation: im=AspectCrop=(1,1)
    if (searchParams.has('im')) {
      const imValue = searchParams.get('im') || '';
      this.logger.debug('Found Akamai equals notation parameter', { value: imValue });
      
      // Parse the main transform first
      const transformParams = this.parseEqualsNotation(imValue);
      parameters.push(...transformParams);
      
      // Check for nested parameters within the im= value
      // Formats like im=AspectCrop=(1,1),f=m,width=800
      if (imValue.includes('f=') || imValue.includes('w=') || imValue.includes('h=') || 
          imValue.includes('r=') || imValue.includes('p=') || imValue.includes('width=') || 
          imValue.includes('height=')) {
        
        this.logger.debug('Found nested parameters in im= value', { imValue });
        
        // Parse nested compact parameters (f=, w=, etc.)
        const nestedParams = this.parseNestedParameters(imValue);
        parameters.push(...nestedParams);
      }
    }
    
    // Parse specific Akamai parameters
    const akamaiSpecificMappings = {
      'imwidth': 'width',
      'imheight': 'height',
      'imquality': 'quality',
      'imformat': 'format',
      'imrotate': 'rotate'
    };
    
    for (const [akamaiParam, cloudflareParam] of Object.entries(akamaiSpecificMappings)) {
      if (searchParams.has(akamaiParam)) {
        const value = searchParams.get(akamaiParam) || '';
        this.logger.debug(`Found Akamai specific parameter: ${akamaiParam}`, { value });
        
        // Convert value to appropriate type
        let parsedValue: string | number | boolean = value;
        
        // Handle numeric parameters
        if (['width', 'height', 'quality', 'rotate'].includes(cloudflareParam)) {
          const numValue = parseInt(value, 10);
          if (!isNaN(numValue)) {
            parsedValue = numValue;
          }
        }
        
        parameters.push({
          name: cloudflareParam,
          value: parsedValue,
          source: 'akamai',
          priority: 90 // Higher priority for direct parameters
        });
      }
    }
    
    // Handle special Akamai parameters
    if (searchParams.has('impolicy')) {
      const policy = searchParams.get('impolicy') || '';
      if (policy.toLowerCase() === 'letterbox') {
        parameters.push({
          name: 'fit',
          value: 'pad',
          source: 'akamai',
          priority: 80
        });
      } else if (policy.toLowerCase() === 'cropfit') {
        parameters.push({
          name: 'fit',
          value: 'cover',
          source: 'akamai',
          priority: 80
        });
      }
    }
    
    if (searchParams.has('imcolor')) {
      const color = searchParams.get('imcolor') || '';
      parameters.push({
        name: 'background',
        value: `#${color}`,
        source: 'akamai',
        priority: 80
      });
    }
    
    if (searchParams.has('imcrop')) {
      const crop = searchParams.get('imcrop') || '';
      if (crop.includes(',')) {
        // Format is usually x,y,width,height
        const parts = crop.split(',').map(p => parseInt(p, 10));
        if (parts.length === 4) {
          // Convert to trim format (top,right,bottom,left)
          parameters.push({
            name: 'trim',
            value: `${parts[1]};${parts[0]+parts[2]};${parts[1]+parts[3]};${parts[0]}`,
            source: 'akamai',
            priority: 80
          });
        }
      }
    }
    
    this.logger.breadcrumb('AkamaiParser completed parsing', undefined, {
      parameterCount: parameters.length
    });
    
    return parameters;
  }
  
  /**
   * Parse Akamai dot notation parameters (im.resize=width:400)
   */
  private parseDotNotation(akamaiParam: string, value: string): TransformParameter[] {
    const parameters: TransformParameter[] = [];
    
    // Handle common Akamai parameters
    switch(akamaiParam.toLowerCase()) {
      case 'resize':
        // Check if value is like width:400
        if (value.includes(':')) {
          const [subParam, subValue] = value.split(':');
          
          if (subParam === 'width' || subParam === 'height') {
            const numValue = parseInt(subValue, 10);
            if (!isNaN(numValue)) {
              parameters.push({
                name: subParam,
                value: numValue,
                source: 'akamai',
                priority: 80 // Higher priority for explicit parameters
              });
            }
          }
        }
        // Add fit parameter for resize
        parameters.push({
          name: 'fit',
          value: 'scale-down',
          source: 'akamai',
          priority: 75
        });
        break;
        
      case 'crop':
        // Handle Akamai crop parameters
        if (value.includes(':')) {
          const [subParam, subValue] = value.split(':');
          
          if (subParam === 'width' || subParam === 'height') {
            const numValue = parseInt(subValue, 10);
            if (!isNaN(numValue)) {
              parameters.push({
                name: subParam,
                value: numValue,
                source: 'akamai',
                priority: 80
              });
            }
          }
        }
        
        // Add fit parameter for crop
        parameters.push({
          name: 'fit',
          value: 'crop',
          source: 'akamai',
          priority: 75
        });
        break;
        
      case 'blur':
        parameters.push({
          name: 'blur',
          value: value ? parseInt(value, 10) : 50,
          source: 'akamai',
          priority: 75
        });
        break;
        
      case 'quality':
        parameters.push({
          name: 'quality',
          value: parseInt(value, 10),
          source: 'akamai',
          priority: 75
        });
        break;
        
      case 'rotate':
        parameters.push({
          name: 'rotate',
          value: parseInt(value, 10),
          source: 'akamai',
          priority: 75
        });
        break;
        
      case 'format':
        parameters.push({
          name: 'format',
          value: value.toLowerCase(),
          source: 'akamai',
          priority: 75
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
    let currentPart = '';
    const parts: string[] = [];
    
    for (let i = 0; i < imValue.length; i++) {
      const char = imValue[i];
      
      if (char === '(') {
        inParens++;
        currentPart += char;
      } else if (char === ')') {
        inParens--;
        currentPart += char;
      } else if (char === ',' && inParens === 0) {
        // Found a top-level comma, split here
        if (currentPart.trim()) {
          parts.push(currentPart.trim());
        }
        currentPart = '';
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
      const equalsIndex = part.indexOf('=');
      if (equalsIndex > 0) {
        const paramName = part.substring(0, equalsIndex).trim();
        const paramValue = part.substring(equalsIndex + 1).trim();
        
        this.logger.debug('Found nested parameter', { name: paramName, value: paramValue });
        
        // Map common nested parameters
        switch (paramName.toLowerCase()) {
          case 'f':
            // Size code
            parameters.push({
              name: 'f',
              value: paramValue,
              source: 'akamai',
              priority: 80
            });
            break;
            
          case 'w':
          case 'width':
            // Width parameter
            const widthValue = parseInt(paramValue, 10);
            if (!isNaN(widthValue)) {
              parameters.push({
                name: 'width',
                value: widthValue,
                source: 'akamai',
                priority: 80
              });
            }
            break;
            
          case 'h':
          case 'height':
            // Height parameter
            const heightValue = parseInt(paramValue, 10);
            if (!isNaN(heightValue)) {
              parameters.push({
                name: 'height',
                value: heightValue,
                source: 'akamai',
                priority: 80
              });
            }
            break;
            
          case 'r':
          case 'aspect':
            // Aspect ratio
            parameters.push({
              name: 'aspect',
              value: paramValue,
              source: 'akamai',
              priority: 80
            });
            break;
            
          case 'p':
          case 'focal':
            // Focal point
            parameters.push({
              name: 'focal',
              value: paramValue,
              source: 'akamai',
              priority: 80
            });
            break;
            
          case 'quality':
          case 'q':
            // Quality parameter
            const qualityValue = parseInt(paramValue, 10);
            if (!isNaN(qualityValue)) {
              parameters.push({
                name: 'quality',
                value: qualityValue,
                source: 'akamai',
                priority: 80
              });
            }
            break;
            
          case 'format':
            // Format parameter
            parameters.push({
              name: 'format',
              value: paramValue.toLowerCase(),
              source: 'akamai',
              priority: 80
            });
            break;
            
          default:
            // For other parameters, try to pass them through as-is
            parameters.push({
              name: paramName.toLowerCase(),
              value: paramValue,
              source: 'akamai',
              priority: 70 // Lower priority for unknown parameters
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
    const firstParenIndex = imValue.indexOf('(');
    const firstCommaIndex = imValue.indexOf(',');
    const firstEqualsIndex = imValue.indexOf('=', 1); // Skip the im= at the start
    
    let transformType = '';
    let remainingParams = '';
    
    // Determine the format of the parameter
    if (firstParenIndex > 0 && (firstParenIndex < firstEqualsIndex || firstEqualsIndex === -1)) {
      // Format: AspectCrop(1,1)
      transformType = imValue.substring(0, firstParenIndex).trim();
      remainingParams = imValue.substring(firstParenIndex);
    } else if (firstCommaIndex > 0 && (firstCommaIndex < firstEqualsIndex || firstEqualsIndex === -1)) {
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
      remainingParams = '';
    }
    
    // Handle specific transformations
    switch(transformType.toLowerCase()) {
      case 'aspectcrop':
        // Extract aspect ratio from formats like AspectCrop=(16,9) or AspectCrop(16,9)
        let aspectMatch = remainingParams.match(/\((\d+),(\d+)\)/);
        if (aspectMatch) {
          const aspectWidth = aspectMatch[1];
          const aspectHeight = aspectMatch[2];
          
          parameters.push({
            name: 'aspect',
            value: `${aspectWidth}:${aspectHeight}`,
            source: 'akamai',
            priority: 85
          });
          
          // AspectCrop implies ctx=true
          parameters.push({
            name: 'ctx',
            value: true,
            source: 'akamai',
            priority: 80
          });
        }
        
        // Extract focal point if present as xPosition and yPosition
        const xPosMatch = remainingParams.match(/xPosition=([.\d]+)/);
        const yPosMatch = remainingParams.match(/yPosition=([.\d]+)/);
        
        if (xPosMatch && yPosMatch) {
          parameters.push({
            name: 'focal',
            value: `${xPosMatch[1]},${yPosMatch[1]}`,
            source: 'akamai',
            priority: 85
          });
        }
        break;
        
      case 'resize':
        // Extract width and height from Resize=(width,height) or Resize,width=x,height=y
        let dimensionMatch = remainingParams.match(/\((\d+),(\d+)\)/);
        if (dimensionMatch) {
          parameters.push({
            name: 'width',
            value: parseInt(dimensionMatch[1], 10),
            source: 'akamai',
            priority: 85
          });
          
          parameters.push({
            name: 'height',
            value: parseInt(dimensionMatch[2], 10),
            source: 'akamai',
            priority: 85
          });
        } else {
          // Check for width=x,height=y format
          const widthMatch = remainingParams.match(/width=(\d+)/);
          const heightMatch = remainingParams.match(/height=(\d+)/);
          
          if (widthMatch) {
            parameters.push({
              name: 'width',
              value: parseInt(widthMatch[1], 10),
              source: 'akamai',
              priority: 85
            });
          }
          
          if (heightMatch) {
            parameters.push({
              name: 'height',
              value: parseInt(heightMatch[1], 10),
              source: 'akamai',
              priority: 85
            });
          }
        }
        
        // Resize always uses scale-down fit
        parameters.push({
          name: 'fit',
          value: 'scale-down',
          source: 'akamai',
          priority: 80
        });
        break;
        
      case 'crop':
        // Extract width and height from Crop=(width,height) or Crop,width=x,height=y
        dimensionMatch = remainingParams.match(/\((\d+),(\d+)\)/);
        if (dimensionMatch) {
          parameters.push({
            name: 'width',
            value: parseInt(dimensionMatch[1], 10),
            source: 'akamai',
            priority: 85
          });
          
          parameters.push({
            name: 'height',
            value: parseInt(dimensionMatch[2], 10),
            source: 'akamai',
            priority: 85
          });
        } else {
          // Check for width=x,height=y format
          const widthMatch = remainingParams.match(/width=(\d+)/);
          const heightMatch = remainingParams.match(/height=(\d+)/);
          
          if (widthMatch) {
            parameters.push({
              name: 'width',
              value: parseInt(widthMatch[1], 10),
              source: 'akamai',
              priority: 85
            });
          }
          
          if (heightMatch) {
            parameters.push({
              name: 'height',
              value: parseInt(heightMatch[1], 10),
              source: 'akamai',
              priority: 85
            });
          }
        }
        
        // Check for rect=(x,y,w,h) format
        const rectMatch = remainingParams.match(/rect=\((\d+),(\d+),(\d+),(\d+)\)/);
        if (rectMatch) {
          const trimValue = `${rectMatch[2]};${rectMatch[3]};${rectMatch[4]};${rectMatch[1]}`;
          parameters.push({
            name: 'trim',
            value: trimValue,
            source: 'akamai',
            priority: 85
          });
        } else {
          // Crop always uses crop fit if rect isn't specified
          parameters.push({
            name: 'fit',
            value: 'crop',
            source: 'akamai',
            priority: 80
          });
        }
        break;
        
      case 'blur':
        // Add a blur parameter with default of 50 or specified value
        let blurValue = 50;
        const blurMatch = remainingParams.match(/=(\d+)/);
        if (blurMatch) {
          blurValue = parseInt(blurMatch[1], 10);
          // Convert Akamai blur value to CF's 1-250 range (rough approximation)
          blurValue = Math.max(1, Math.min(250, blurValue * 25));
        }
        
        parameters.push({
          name: 'blur',
          value: blurValue,
          source: 'akamai',
          priority: 80
        });
        break;
        
      case 'rotate':
        // Extract rotation angle
        const rotateMatch = remainingParams.match(/=(\d+)|degrees=(\d+)/);
        if (rotateMatch) {
          const angle = parseInt(rotateMatch[1] || rotateMatch[2], 10);
          // Normalize to 0, 90, 180, 270
          const normalizedAngle = Math.round(angle / 90) * 90 % 360;
          
          parameters.push({
            name: 'rotate',
            value: normalizedAngle,
            source: 'akamai',
            priority: 80
          });
        }
        break;
        
      case 'contrast':
        // Extract contrast value
        const contrastMatch = remainingParams.match(/=([.\d]+)|contrast=([.\d]+)/);
        if (contrastMatch) {
          const contrastValue = parseFloat(contrastMatch[1] || contrastMatch[2]);
          
          parameters.push({
            name: 'contrast',
            value: contrastValue,
            source: 'akamai',
            priority: 80
          });
        }
        break;
        
      case 'backgroundcolor':
        // Extract color value
        const colorMatch = remainingParams.match(/=([0-9a-fA-F]{6})|color=([0-9a-fA-F]{6})/);
        if (colorMatch) {
          const colorValue = colorMatch[1] || colorMatch[2];
          
          parameters.push({
            name: 'background',
            value: `#${colorValue}`,
            source: 'akamai',
            priority: 80
          });
        }
        break;
        
      case 'mirror':
        // Handle mirror direction
        if (remainingParams.includes('horizontal')) {
          parameters.push({
            name: 'flip',
            value: 'h',
            source: 'akamai',
            priority: 80
          });
        } else if (remainingParams.includes('vertical')) {
          parameters.push({
            name: 'flip',
            value: 'v',
            source: 'akamai',
            priority: 80
          });
        }
        break;
        
      case 'grayscale':
        // Set saturation to 0 for grayscale
        parameters.push({
          name: 'saturation',
          value: 0,
          source: 'akamai',
          priority: 80
        });
        break;
        
      case 'facecrop':
        // Face detection with cover fit
        parameters.push({
          name: 'gravity',
          value: 'face',
          source: 'akamai',
          priority: 85
        });
        
        parameters.push({
          name: 'fit',
          value: 'cover',
          source: 'akamai',
          priority: 80
        });
        break;
        
      case 'featurecrop':
      case 'smartcrop':
        // Extract width and height
        const fcWidthMatch = remainingParams.match(/width=(\d+)/);
        const fcHeightMatch = remainingParams.match(/height=(\d+)/);
        
        if (fcWidthMatch) {
          parameters.push({
            name: 'width',
            value: parseInt(fcWidthMatch[1], 10),
            source: 'akamai',
            priority: 85
          });
        }
        
        if (fcHeightMatch) {
          parameters.push({
            name: 'height',
            value: parseInt(fcHeightMatch[1], 10),
            source: 'akamai',
            priority: 85
          });
        }
        
        // Smart crop uses auto gravity
        parameters.push({
          name: 'gravity',
          value: 'auto',
          source: 'akamai',
          priority: 85
        });
        
        parameters.push({
          name: 'fit',
          value: 'cover',
          source: 'akamai',
          priority: 80
        });
        break;
        
      case 'quality':
        // Extract quality value
        const qualityMatch = remainingParams.match(/=(\d+)/);
        if (qualityMatch) {
          const qualityValue = parseInt(qualityMatch[1], 10);
          
          parameters.push({
            name: 'quality',
            value: qualityValue,
            source: 'akamai',
            priority: 80
          });
        }
        break;
        
      case 'format':
        // Extract format value
        const formatMatch = remainingParams.match(/=(\w+)/);
        if (formatMatch) {
          const formatValue = formatMatch[1].toLowerCase();
          
          parameters.push({
            name: 'format',
            value: formatValue,
            source: 'akamai',
            priority: 80
          });
        }
        break;
    }
    
    return parameters;
  }
}