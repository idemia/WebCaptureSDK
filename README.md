# WebCaptureSDK

This demo application is designed to demonstrate the integration of the IDEMIA Web CaptureSDK as part of the IDEMIA Identity solutions.

#### Integration Methods

There are two primary ways to integrate this technology:

1. ID Proofing Integration within GIPS Workflow:

   The Global Identity Proofing Service (GIPS) by IDEMIA offers identity proofing to applications worldwide via the internet.

2. Bioserver Component Usage:
   This approach allows for biometric operations using only the Bioserver component.

By default, GIPS is enabled in this sample application (IDPROOFING = true).

#### Getting Started

Before launching the sample application, certain prerequisites must be fulfilled. These are accessible through the IDEMIA Experience Portal: https://experience.idemia.com/
To access these resources, please contact IDEMIA for an account. Once you have access to the portal, click on 'Dashboard' then 'Environment' and finally choose 'Trial (Preprod)' for your tests.
The following information has to be retrieved from the displayed dashboard to connect to the testing environment:

- The unique URL for the Bioserver (SDK backend) and GIPS.
- API keys for secure backend connections ('GIPS RS' API key for GIPS and 'GIPS UA' API key for Bioserver).

![alt text](https://raw.githubusercontent.com/idemia/WebCaptureSDK/master/screenshot_portal.png)

#### Capture SDK

##### Face Autocapture with Liveness Detection

This feature showcases face autocapture and liveness detection capabilities.

For detailed information, please visit:

- https://developer.idemia.com/capturesdks/web/39#webcapture-sdk---faceautocapture-and-liveness


- [Getting started](https://developer.idemia.com/capturesdks/web/39#getting-started)
- [FAQ](https://developer.idemia.com/capturesdks/web/39#faq)

##### ID Document Autocapture

This feature demonstrates the autocapture of identity documents such as passports, identity cards, or driving licenses.

For detailed information, please visit:

- https://developer.idemia.com/capturesdks/web/39#document-webcapture-sdk--iddoc-autocapture-passportid-carddl


- [Getting started](https://developer.idemia.com/capturesdks/web/39#getting-started_1)
- [FAQ](https://developer.idemia.com/capturesdks/web/39#faqs)