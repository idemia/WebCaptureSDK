# Release Notes
This demo app showcases the integration of the IDEMIA WebCapture SDK, including both Face Autocapture & Liveness and Identity Document Autocapture features.

---
## June 2, 2025 : Identity Document Autocapture

### Recommendation
* JS API order recommandations : initDocCapture API should be called before getDeviceStream API to improve 4K phone capture coverage

### What's New
* Takes position.glare feedback into account during autocapture.

## December 20, 2024 : Face Autocapture and Face Liveness

### What's New
*  Added progress bar before starting the liveness process : trackingInfo.downloadProgress
