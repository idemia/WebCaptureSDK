# Release Notes
This demo app showcases the integration of the IDEMIA WebCapture SDK, including both Face Autocapture & Liveness and Identity Document Autocapture features.

---
## October 6, 2025 : Face Autocapture and Face Liveness

### What's New
* Reduce zoom on face displayed in the result screen.
* Rework of the result screen for passive video liveness on the "Age estimation & Matching" demo. 
* Fix various bugs.

## July 11, 2025 : Identity Document Autocapture

### What's New
* Fix capture overlay not well displayed in wide screen devices.
* Fix retry manual capture on low connectivity.

## June 2, 2025 : Identity Document Autocapture

### Recommendation
* JS API order recommandations : initDocCapture API should be called before getDeviceStream API to improve 4K phone capture coverage

### What's New
* Takes position.glare feedback into account during autocapture.

## December 20, 2024 : Face Autocapture and Face Liveness

### What's New
*  Added progress bar before starting the liveness process : trackingInfo.downloadProgress
