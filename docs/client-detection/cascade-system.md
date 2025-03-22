# Cascade System

The Cascade System is the core decision-making engine within the Client Detection Framework. It replaces the previous scoring-based approach with a more reliable and configurable priority-based system.

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Client Detection Overview](index.md)
- [Architecture](architecture.md)
- [Configuration](configuration.md)
- [Browser Compatibility](browser-compatibility.md)
- [Migration Guide](migration-guide.md)

## Concept

The Cascade System works by:

1. Trying multiple detection methods in a defined priority order
2. Using the highest-priority method that returns a valid result
3. Falling back to lower-priority methods when higher-priority methods fail
4. Using configurable defaults when no method succeeds

This provides a more reliable and predictable detection process compared to the previous scoring system.

## Format Selection Cascade

The format selection cascade determines the optimal image format using the following priority order:

1. **Accept Headers** (Highest Priority)
   - Checks the `Accept` header for explicitly supported image formats
   - Most reliable when available as it directly indicates browser support
   - Example: `Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8`

2. **Client Hints**
   - Uses client hints to determine browser and platform
   - Matches against known format support data
   - Less reliable than Accept headers but more reliable than UA parsing

3. **User-Agent Detection** (Fallback)
   - Parses the User-Agent string to identify browser and version
   - Matches against format support database
   - Used when client hints and Accept headers are unavailable

4. **Default Format** (Lowest Priority)
   - Falls back to a configurable default format (typically JPEG)
   - Used when all other detection methods fail

### Format Selection Process

```
┌─────────────────┐
│ Start Detection │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Accept Headers  │ Yes │ Use Format from │
│   Available?    ├────►│ Accept Headers  │
└────────┬────────┘     └─────────────────┘
         │ No
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Client Hints    │ Yes │ Use Format from │
│   Available?    ├────►│  Client Hints   │
└────────┬────────┘     └─────────────────┘
         │ No
         ▼
┌─────────────────┐     ┌─────────────────┐
│  User-Agent     │ Yes │ Use Format from │
│   Available?    ├────►│   User-Agent    │
└────────┬────────┘     └─────────────────┘
         │ No
         ▼
┌─────────────────┐
│   Use Default   │
│     Format      │
└─────────────────┘
```

## Quality Selection Cascade

The quality selection cascade determines the optimal image quality using:

1. **Save-Data Header** (Highest Priority)
   - Checks for the `Save-Data: on` header
   - When present, applies aggressive quality reduction
   - Directly respects user preference for data saving

2. **Network Conditions**
   - Analyzes available network information (Downlink, RTT, ECT)
   - Adjusts quality based on network speed
   - Higher priority than device capabilities

3. **Device Capabilities** (Fallback)
   - Considers device memory, processors, and DPR
   - Adjusts quality based on device performance capacity
   - Lower priority than explicit user preferences and network conditions

4. **Default Quality** (Lowest Priority)
   - Falls back to format-specific default quality settings
   - Used when all other detection methods fail

### Quality Adjustment Factors

Quality is further adjusted based on:

- **Device Pixel Ratio (DPR)**: Higher DPR values receive quality boosts
- **Memory Thresholds**: Devices with more memory can handle higher quality
- **Processor Cores**: Devices with more cores can decode more complex images
- **Network Speed**: Faster networks allow for higher quality images

### Quality Selection Process

```
┌─────────────────┐
│ Start Detection │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Save-Data     │ Yes │  Apply Lower    │
│    Header?      ├────►│     Quality     │
└────────┬────────┘     └─────────────────┘
         │ No
         ▼
┌─────────────────┐     ┌─────────────────┐
│Network Condition│ Yes │ Adjust Quality  │
│ Information?    ├────►│ Based on Network│
└────────┬────────┘     └─────────────────┘
         │ No
         ▼
┌─────────────────┐     ┌─────────────────┐
│Device Capability│ Yes │ Adjust Quality  │
│ Information?    ├────►│Based on Device  │
└────────┬────────┘     └─────────────────┘
         │ No
         ▼
┌─────────────────┐
│   Use Default   │
│     Quality     │
└─────────────────┘
```

## Cascade Configuration

All aspects of the cascade system are configurable:

```jsonc
{
  "cascade": {
    // Format selection cascade
    "format": {
      "enabled": true,
      "acceptHeaderPriority": 100,  // Priority for Accept header detection
      "clientHintsPriority": 80,    // Priority for client hints detection
      "browserDetectionPriority": 60, // Priority for browser detection
      "fallbackFormat": "jpeg"      // Default format when no detection works
    },
    // Quality selection cascade
    "quality": {
      "enabled": true,
      "saveDataPriority": 100,      // Priority for Save-Data header
      "networkConditionPriority": 80, // Priority for network conditions
      "deviceCapabilityPriority": 60, // Priority for device capabilities
      "dprAdjustmentEnabled": true, // Enable DPR-based quality adjustment
      "deviceMemoryThresholds": {
        "high": 8,                  // Memory threshold for high quality (in GB)
        "low": 2                    // Memory threshold for low quality (in GB)
      },
      "adjustmentFactors": {
        "slowNetwork": 0.85,        // Quality adjustment factor for slow networks
        "fastNetwork": 1.1,         // Quality adjustment factor for fast networks
        "dprAdjustment": 5          // Quality adjustment per DPR point above 1
      }
    }
  }
}
```

## Debugging the Cascade

The cascade system includes detailed logging to help understand why specific decisions were made:

```
BREADCRUMB: Determining optimized format using cascading priority
Data: {
  autoFormat: true,
  cascadeEnabled: true,
  acceptHeaderSource: false,
  browserSource: "user-agent",
  avifSupport: true,
  webpSupport: true
}

BREADCRUMB: Format selection decision
Data: {
  format: "avif",
  decisionSource: "user-agent",
  decisionMethod: "browser-detection",
  decisionTier: "browser-detection",
  configuredPriority: 60
}
```

When debug mode is enabled, cascade decisions are also included in HTTP headers for easy inspection.

## Best Practices

- **Format Priority**: Trust Accept headers over user-agent detection whenever possible
- **Quality Adaptation**: Always enable network-based quality adaptation for the best user experience
- **Configuration**: Set reasonable fallback defaults for when detection methods fail
- **Testing**: Test cascade decisions across different browsers and network conditions
- **Debugging**: Use the debug headers to understand why specific format and quality decisions were made

## Troubleshooting

### Format Detection Issues

If you're seeing unexpected format selection decisions:

1. Enable debug mode to view the cascade decision process
2. Check browser Accept headers to verify format support
3. Verify client hints are properly configured on your origin
4. Check the user-agent detection results for accuracy

### Quality Selection Issues

If image quality is not optimal:

1. Verify network condition detection is properly configured
2. Check if Save-Data header is being respected
3. Adjust the quality adjustment factors in the configuration
4. Test across different device and network combinations

## Related Resources

- [Client Detection Overview](index.md)
- [Architecture](architecture.md)
- [Configuration](configuration.md)
- [Browser Compatibility](browser-compatibility.md)
- [Migration Guide](migration-guide.md)
- [Debug Headers](../debugging/debug-headers.md)
- [Core Architecture: Transformation](../core/architecture.md#6-image-transformation-transformts)

---

*Last Updated: March 22, 2025*