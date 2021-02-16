## Getting Started

Biometric Web - `Capture SDK` is intended to be used by service providers to build identity proofing services for their end-users.

Biometric Web Capture SDK is a ***JavaScript SDK*** *hosted* within a ***backend*** server. This SDK brings face and liveness detection from video streams.

The main services are:

-   Acquiring a best-image from a video stream
-   Performing a liveness check to verify that the acquired FACE is genuine - not a photocopy, not a video, not a mask

This SDK **is not** a set of tools to **download** but rather **javascript files** to be ***integrated into a client web application***.

To include the javascript files in the main html page of the client application, for each javascript file, use a ***script *tag*** in the ***html head*** and set the **`scr` attribute** to the ***.js file location***.

As an integrator, you can follow the three steps  below (~15 minutes) to test and use Biometric Web Capture SDK through our Sample client application.

### Step 1: Requirements

**Required systems:**

- Linux or Windows OS

- Memory: At least 8GB of RAM

-	CPU: CPU 2.5 GHz

**Required services:**

To facilitate integration with the Biometric Services SDK, we provide a web application in source code as an integration good practice example.

This sample application is developed in Nodejs. To use it, install Nodejs:

-   Linux: Download & install https://nodejs.org/dist/v8.11.1/node-v8.11.1-linux-x64.tar.gz
-   Windows: Download & install https://nodejs.org/dist/v8.11.1/

In order to start the integration, you need an API key and a sandbox environment. You can obtain these by registering yourself through https://developer.idemia.com/signup/.

Within the dashboard `API_KEY`, the required values are:

   * `Address`: the backend URL
   * `WEBBIO-VIDEO API Key`: the APIKEY value

### Step 2: Sample Application Deployment

1. Download the latest sample web application from github repository https://github.com/idemia/WebCaptureSDK.

2. Unzip the archive and go to the root folder.

3. Edit the file '/server/config/default.js' and update the configuration variable to set your environment (credentials and Biometrics Services url).

4. Add your API key by filling the `WEB_SDK_LIVENESS_ID_DOC` value.

5. Modify Biometric Services with your `Address` (see `Address` value in https://developer.idemia.com/dashboard/capturesdks/secrets/api-keys): `BIOSERVER_CORE_URL` for the Biometric API and `BIOSERVER_VIDEO_URL` for the Biometric Capture SDK.

   ```shell
   BIOSERVER_CORE_URL: 'https://XXXXXXXXXX/bioserver-app/v2',
   BIOSERVER_VIDEO_URL: 'https://XXXXXXXXXX',
   ```

### Step 3: Run and test the sample application

Open a terminal to the root folder and:

* launch 'npm install' to load the dependencies

* launch 'npm start' to run the sample application

Now you can open a browser and run https://localhost:9943/demo-server/. For the best quality, use a smartphone connected through the same network without the firewall
https://`IP_ADDRESS`:9943/demo-server/.

#### Use Case #1: only biometrics are required

The provided sample is ready to be used. No further modifications are required.

#### Use Case #2: integration with the ID&V global offer to benefit of all service

If you want to link Biometric Services with ID&V/GIPS, edit the file `/server/config/default.js` and update the variables as follows:

-	set `IDPROOFING` to `true`

-	set `GIPS_URL` to the url you received

-	set `GIPS_RS_API_Key` with the API key header to use

-	set `GIPS_API_KEY_SECRET` with your API key value

### Annex:

#### Parameters for Changing Liveness Mode

| **Variable**       | **Description**    | **Value**       |
| ----------------- | ---------------------- | -------------- |
| LIVENESS_MODE   | The liveness capture mode. Determines the type of capture and liveliness control to be performed on the video stream. | Allowed values: `LIVENESS_PASSIVE`: liveness check without challenge   `LIVENESS_MEDIUM`:  liveness check with « move the head » challenge. `LIVENESS_HIGH`: liveness check with « join the dots » challenge. |
| LIVENESS_HIGH_NUMBER_OF_CHALLENGE | Number of dots generated for « join the dots » challenge.  Only applies when `LIVENESS_MODE` is set to `LIVENESS_HIGH` | `2`              |

#### Configuration Variables for Changing Security/Usability Compromise

| **Variable**            | **Description**         | **Value**    |
| :-------- | ------------- | ------------------- |
| LIVENESS_SECURITY_LEVEL | recommended value: `HIGH` for convenience  or `VERY_HIGH` for security | `HIGH`, `VERY_HIGH`, `VERY_HIGH2`, and other values are not recommended |

#### Other Configuration Variables

| **Variable**    | **Description**    | **Value**    |
| ---------------- |------------------|-------------|
| DEBUG    | The `DEBUG` environment variable is then used to enable logs based on space or comma-delimited names. | front:app     |
| DISABLE_CALLBACK   | Disables the callback functionality from WebBioServer | `true`          |
| SERVER_PUBLIC_ADDRESS  | Sample page public address. Used to callback the sample page when the liveness capture is finished. | https://[ip_or_servername]:[port]. Ex: https://localhost:9943 |
| LIVENESS_RESULT_CALLBACK_PATH     | Used in the callback URL to receive liveness result from the WebBioServer | `/liveness-result-callback`   |
| BIOSERVER_CORE_URL  | WBS core url for images coding and matching. WBS exposes a simple REST API to detect and recognize faces from still images. It also exposes rest API to save and retrieve the liveness capture result in a session. This server is used by the WebCapture SDK for the coding captured best image and to save and retrieve the liveness capture result in a session. | https://[ip_or_servername]:[port]/bioserver-app/<br/>https://localhost/bioserver-app/ |
| BIOSERVER_VIDEO_URL  | WebCapture SDK server url    | https://[ip_or_servername]:[port]/<br/>https://localhost:9443 |
| WEB_SDK_LIVENESS_ID_DOC       | API key value sent via `API_KEY_HEADER` | ********************   |
| IDPROOFING | To link sample application server with ID&V | `false`  |
| GIPS_URL  | ID&V gips API URL     | https://[ip_or_servername]:[port]/gips/rest     |
| GIPS_RS_API_Key | ID&V user role   | RELYING_SERVICE      |
| DISABLE_CALLBACK | Disable the callback functionality from WebBioServer. <br/>The callback is thrown by WebBioServer when the liveness is finished.<br/>Callback URL = SERVER_PUBLIC_ADDRESS + BASE_PATH + LIVENESS_RESULT_CALLBACK_PATH | true |
| SERVER_PUBLIC_ADDRESS | Used in callback URL to receive results from WebBioServer (See DISABLE_CALLBACK) | https://[ip_or_servername]:[port]. Ex: https://localhost:9943 |
|  |  |  |



#### Description of the files from source code:

| Filename                                | Description                                                  |
| --------------------------------------- | ------------------------------------------------------------ |
| ./index.js                              | NodeJS index file that initialize front-end endpoints and call the file ''./server/httpEndpoints.js" for back-end endpoints |
| ./package.json                          | nodeJS dependencies                                          |
| ./GettingStarted.md                     | Readme markdown file                                         |
| ./assets/*                              | Contains a video tutorial for liveness high                  |
| ./licenses                              | Licenses from the demonstration project                      |
| ./server                                | Back-end side package                                        |
| ./server/wbs-api.js                     | Allow communication with WebBioserver API                    |
| ./server/packer.js                      | Prepare the front-end source to be exposed                   |
| ./server/httpEndpoints.js               | Backend endpoint (used by the front-end to reach GIPS & WebBioserver) |
| ./server/gips-api.js                    | Allow communication with GIPS API                            |
| ./server/config/index.js                | Read the Server configuration file and set defaults keys     |
| ./server/config/defaults.js             | Server configuration file                                    |
| ./server/config/certs/*                 | Certificate files                                            |
| ./server/config/i18n/*                  | Translation files (spanish / french / japanese)              |
| ./front                                 | Front-end side package                                       |
| ./front/utils/*                         | Common resources called by front-end JS                      |
| ./templates                             | Front-end sources divided by each supported liveness mode    |
| ./templates/high-liveness/index.js      | Unique High liveness javascript. All the JS source code to integrate the high liveness is present here. |
| ./templates/high-liveness/index.html    | Unique High liveness html. All the html source code to integrate the high liveness is present here. |
| ./templates/high-liveness/home.html     | Home page for high liveness that expose only links to the main high index.html page |
| ./templates/high-liveness/statics       | Assets : images, logo, fonts, css for high liveness          |
| ./templates/high-liveness/animations    | Json animation files (alternative to .gif) for high liveness |
| ./templates/medium-liveness/index.js    | Unique medium liveness javascript. All the JS source code to integrate the medium liveness is present here. |
| ./templates/medium-liveness/index.html  | Unique medium liveness html. All the html source code to integrate the medium liveness is present here. |
| ./templates/medium-liveness/home.html   | Home page for medium liveness that expose only links to the main medium index.html page |
| ./templates/medium-liveness/statics     | Assets : images, logo, fonts, css for medium liveness        |
| ./templates/passive-liveness/animations | Json animation files (alternative to .gif) for medium liveness |
| ./templates/passive-liveness/index.js   | Unique passive liveness javascript. All the JS source code to integrate the medium liveness is present here. |
| ./templates/passive-liveness/index.html | Unique passive liveness html. All the html source code to integrate the passive liveness is present here. |
| ./templates/passive-liveness/home.html  | Home page for passive liveness that expose only links to the main passive index.html page |
| ./templates/passive-liveness/statics    | Assets : images, logo, fonts, css for passive liveness       |
| ./templates/passive-liveness/animations | Json animation files (alternative to .gif) for passive liveness |

