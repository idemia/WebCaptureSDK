# Document Web 'Capture SDK'

Document Web - 'Capture SDK` is intended to be used by service providers to build identity proofing services for their end-users.

Document Web Capture SDK is a JavaScript SDK hosted within a backend, this SDK brings live ID document detection from video streams. The webSDK allows an integrator to acquire a best-image from a video stream of an ID document (passport / ID card / Driving Licence). It support 3 kinds of readings :

- OCR : Optical character recognition
- PDF417 : Stacked linear barcode format
- MRZ : Machine readable zone

As an integrator, you can follow the 3 steps  below (~15 minutes) to test and use Document Web Capture SDK .

## Goal of provided source code

Provided source code requires an access to Idemia Global Digital Identity offer. 
Goal of provided source code goal is to provide an integration example with good practice. 

## Getting started

### Step 1: Prerequisites

Required system:

-   Linux or windows OS
-   Memory : we recommend At least 8GB of RAM
-	CPU : we recommend CPU 2,5 GHz

Required services:

To facilitate integration with Document capture SDK, we provide a web application in source code as an integration good practice example.

This sample application is developed in Nodejs. To use it, install Nodejs :

-   Linux: Download & install https://nodejs.org/dist/v8.11.1/node-v8.11.1-linux-x64.tar.gz
-   Windows: Download & install https://nodejs.org/dist/v8.11.1/

In order to start integration, you need an API key which corresponds to a sandbox environment, you need to register yourself through https://developer.idemia.com.

### Step 2: Sample application setup

-	Edit file '/server/config/default.js' :
  -	 Add your api key by filling 'WEB_SDK_LIVENESS_ID_DOC' value
  -	 Modify Document services with your Address (see 'Address' value in https://developer.idemia.com/dashboard/api-keys) : 
    -	 'DOCSERVER_VIDEO_URL' for Document SDK

### Step 3: Run and test the sample application

Open a terminal to root folder and :

* launch 'npm install' to load dependencies
* launch 'npm start' to run the sample application

Now you can open a browser and run https://localhost:9943/demo-doc/

Since the frontend sources and the backend sources are located under this same package, everything should be protected behind an authentication tool (except for local test purpose). The defaults.js source file should not be exposed at any time to the world (it contains the apikey used to communicate with document webCapture SDK). A good practice, is to use an external tool to retrieve the apikey and any sensitive information such as KMS or VAULT.

Annex : configuration parameters
====================

All the configuration variables from the demonstration code are explained here :



| **Variable**                  | **Description**                                              | **Value**                                                    |
| :---------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| DOCSERVER_VIDEO_URL           | This server is used by the Websdk for document live capture <br/>Default value is Europe UAT | https://ipv-api-v2-eu-service.stg.dsa.idemia.io/doc-server   |
| WEB_SDK_LIVENESS_ID_DOC       | Api key value sent via 'apikey' header to access document sdk endpoints | ********************                                         |
| DISABLE_CALLBACK              | Disable the callback functionality from WebDocServer. <br/>The callback is thrown by WebDocServer when the document capture is finished.<br/>Callback URL = SERVER_PUBLIC_ADDRESS + BASE_PATH + LIVENESS_RESULT_CALLBACK_PATH | true                                                         |
| SERVER_PUBLIC_ADDRESS         | Used in callback URL to receive results from WebDocServer (See DISABLE_CALLBACK) | https://[ip_or_servername]:[port]. Ex: https://localhost:9943 |
| LIVENESS_RESULT_CALLBACK_PATH | Used in callback URL to receive results from WebDocServer (See DISABLE_CALLBACK) | "/liveness-result-callback                                   |
| TLS_API_PORT                  | Port of tls server                                           | 9943                                                         |
| TLS_CERT_PATH                 | Certificate of the server                                    | path.join(__dirname, 'certs/cert.pem')                       |
| TLS_KEY_PATH                  | Private key of the server                                    | path.join(__dirname, 'certs/key.pem')                        |
| BASE_PATH                     | Base path of the server                                      | '/demo-doc'                                                  |
| SUPPORTED_LANGUAGES           | Supported language of UX                                     | 'en,es,fr,ja'                                                |

Description of the files from source code :

| Filename                           | Description                                                  |
| ---------------------------------- | ------------------------------------------------------------ |
| ./index.js                         | NodeJS index file that initialize front-end endpoints and call the file ''./server/httpEndpoints.js" for back-end endpoints |
| ./package.json                     | nodeJS dependancies                                          |
| ./GettingStarted.md                | Readme markdown file                                         |
| ./licenses                         | Licenses from the demonstration project                      |
| ./server                           | Back-end side package                                        |
| ./server/webdoc-api.js             | Allow communication with WebDocserver API                    |
| ./server/packer.js                 | Prepare the front-end source to be exposed                   |
| ./server/httpEndpoints.js          | Backend endpoint (used by the front-end to reach WebDocserver) |
| ./server/config/index.js           | Read the Server configuration file and set defaults keys     |
| ./server/config/countries.js       | Retrieve the 3 characters string corresponding to the country of the user |
| ./server/config/rules.js           | Retrieve the rules to apply depending on the user's document and country selection |
| ./server/config/defaults.js        | Server configuration file                                    |
| ./server/config/certs/*            | Certificate files                                            |
| ./server/config/i18n/*             | Translation files (spanish / french / japanese)              |
| ./front                            | Front-end side package                                       |
| ./front/utils/*                    | Common resources called by front-end JS                      |
| ./templates                        | Front-end sources                                            |
| ./templates/doc-auth/index.js      | All the JS source code to integrate the demo-doc is present here |
| ./templates/doc-auth/index.html    | All the html source code to integrate the demo-doc is present here |
| ./templates/doc-auth/detect-env.js | Environment detection using webDocserver librarie            |
| ./templates/doc-auth/statics       | Assets : images, logo, fonts, css                            |
| ./templates/doc-auth/animations    | Json animation files (alternative to .gif)                   |

