# Changelog

All notable changes to the Image Resizer project will be documented in this file.

## [Unreleased]

### Added

- Compact URL parameter support:
  - `r=16:9` as shorthand for `aspect=16:9` (aspect ratio)
  - `p=0.7,0.5` as shorthand for `focal=0.7,0.5` (positioning)
  - `f=m` as shorthand for width using size codes (e.g., m=700px)
  - Support for compact parameters inside `im=` parameter values
  - Support for `width=` parameter within the `im=` parameter for Akamai compatibility
  - Added comprehensive size code table with 16 standard sizes
  - Enhanced documentation with examples and size code reference table

### Fixed

- Fixed width extraction from `im=AspectCrop=(1,1),xPosition=.5,yPosition=.5,width=800` format
- Improved regex pattern handling for parameter extraction
- Enhanced error handling and logging for parameter extraction

## [1.0.0] - 2025-03-15

### Added

- Initial release of Image Resizer 2
- Service-oriented architecture with lifecycle management
- Enhanced Cloudflare Image Resizing integration
- Multiple storage options (R2, remote URLs, fallbacks)
- Responsive image sizing based on client hints
- Tiered caching strategies
- Debug headers and reporting
- Comprehensive logging and breadcrumb tracing
- Akamai Image Manager compatibility layer