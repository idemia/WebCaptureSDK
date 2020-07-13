# Face Web 'Capture SDK'

Biometric Web - 'Capture SDK` is intended to be used by service providers to build identity proofing services for their end-users.

Biometric Web Capture SDK is a JavaScript SDK hosted within a backend, this SDK brings face and liveness detection from video streams. Main services are:

-   Acquire a best-image from a video stream
-   Perform a liveness check to verify that the acquired FACE is genuine - not a photocopy, not a video, not a mask

As an integrator, you can follow the 3 steps  below (~15 minutes) to test and use Biometric Web Capture SDK .

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

To facilitate integration with Biometric services SDK, we provide a web application in source code as an integration good practice example.

This sample application is developed in Nodejs. To use it, install Nodejs :

-   Linux: Download & install https://nodejs.org/dist/v8.11.1/node-v8.11.1-linux-x64.tar.gz
-   Windows: Download & install https://nodejs.org/dist/v8.11.1/

In order to start integration, you need an API key and a sandbox environment, you need to register yourself through https://developer.idemia.com.

### Step 2: Sample application setup

-	Edit file '/server/config/default.js' and update the configuration variable to set your environment(credentials and Biometrics services url)
-	Add your api key by filling API_KEY_SECRET value
-	Modify Biometric services with your Address (see 'Address' value in https://developer.idemia.com/dashboard/api-keys) : BIOSERVER_CORE_URL for Biometric API and BIOSERVER_VIDEO_URL for Biometric SDK

### Step 3: Run and test the sample application

Open a terminal to root folder and :

* launch 'npm install' to load dependencies
* launch 'npm start' to run the sample application

Now you can open a browser and run https://localhost:9943/demo-server/

#### Use case #1 : only biometrics is required 

Provided sample is ready to be used - no further modifications are required

#### Use case #2 : integration with ID.X.Proof global offer to benefit of all service

In order to have If you want to link Biometric services with ID&V/GIPS, edit file '/server/config/default.js and update variables as follow:

-	set IDPROOFING to true
-	set GIPS_URL to the url you got 
-	set GIPS_TENANT_ROLE to value 'RELYING_SERVICE'
-	set GIPS_API_KEY_HEADER with api key header to use
-	set GIPS_API_KEY_SECRET with your api key value

Annex : configuration parameters
====================

Demonstration server configuration variables are in table below



| **Variable**                      | **Description**                                              | **Value**                                                    |
| :-------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| DEBUG                             | The DEBUG environment variable is then used to enable logs based on space or comma-delimited names. | \*\|front:app                                                |
| DISABLE_CALLBACK                  | Disable the callback functionality from WebBioServer         | true                                                         |
| SERVER_PUBLIC_ADDRESS             | Sample page public address. Used to callback the sample page when the liveness capture is finished | https://[ip_or_servername]:[port]. Ex: https://localhost:9943 |
| LIVENESS_MODE                     | The liveness capture mode. Determines the type of capture and liveliness control to be performed on the video stream. Allowed values: <br />- NO_LIVENESS: autocapture best image. No liveness check <br />- LIVENESS_PASSIVE: liveness check without challenge  <br />- LIVENESS_MEDIUM:  liveness check with « move the head » challenge. <br />- LIVENESS_HIGH: liveness check with « joint the dots » challenge. |                                                              |
| LIVENESS_HIGH_NUMBER_OF_CHALLENGE | Number of dots generated for « joint the dots » challenge. LIVENESS_MODE must be « LIVENESS_HIGH » | 2                                                            |
| LIVENESS_RESULT_CALLBACK_PATH     | Used in callback URL to receive liveness result from WebBioServer | "/liveness-result-callback                                   |
| BIOSERVER_CORE_URL                | WBS core url for images coding and matching.<br/>WBS exposes a simple REST API to detect and recognize faces from still images. It exposes also rest api to save and retrieve liveness capture result in a session. This server is used by the Websdk for coding captured best image and to save and retrieve liveness capture result in a session. | https://[ip_or_servername]:[port]/bioserver-app/<br/>https://localhost/bioserver-app/ |
| BIOSERVER_VIDEO_URL               | Websdk server url                                            | https://[ip_or_servername]:[port]/<br/>https://localhost:9443 |
| API_KEY_HEADER                    | Header name used to send api key.                            | apiKey                                                       |
| API_KEY_SECRET                    | Api key value sent via API_KEY_HEADER                        | ********************                                         |
| IDPROOFING                        | To link sample application server with gips                  | false                                                        |
| GIPS_URL                          | IPV gips api URL                                             | https://[ip_or_servername]:[port]/gips/rest                  |
| GIPS_TENANT_ROLE                  | IPV user role                                                | RELYING_SERVICE                                              |

