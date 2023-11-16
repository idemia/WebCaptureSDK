/*
Copyright 2021 Idemia Identity & Security

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// eslint-disable-next-line no-unused-vars
const path = require('path');
const fs = require('fs');

/*
 * Configuration file
 */
module.exports = {

    DEBUG: 'mph:*',
    LOG_LEVEL: 'info',
    LOG_FORMAT: 'json', // 'json' for production env | 'raw' with colors for development env
    LOG_APPENDER: 'console', // console or file
    LOG_FILE_PATH: path.join(path.dirname(require.main.filename), 'logs'), // path where log files will be stored

    // ******************* APIKEY/URL for DOCSERVER/GIPS *******************
    DOCSERVER_VIDEO_URL: 'https://FILL_ME:443',
    WEB_SDK_LIVENESS_ID_DOC: 'PLEASE_FILL_WITH_YOUR_APIKEY',

    // callbackURL = SERVER_PUBLIC_ADDRESS + BASE_PATH + DOC_CAPTURE_CALLBACK_URL
    DISABLE_CALLBACK: true, // set this key to true to disable callback functionality
    SERVER_PUBLIC_ADDRESS: 'https://localhost:9943',
    DOC_CAPTURE_CALLBACK_URL: '/doccapture-result-callback',

    // only needed if using ID&V
    GIPS_URL: 'https://FILL_ME:443/gips',
    GIPS_RS_API_Key: 'PLEASE_FILL_WITH_YOUR_APIKEY',
    IDPROOFING: true, // enable ID&V integration to use ID&V for initialisation and retrieve results during the doc capture
    // *******************************************************************

    // ******************* back-end server creation *******************
    // Http server port (null to disable)
    HTTP_SERVER_PORT: null, // Set 8088 to avoid conflicts when deploying with video server
    // Https server port (null to disable)
    TLS_API_PORT: 9943,
    TLS_KEYSTORE_PATH: 'PLEASE_FILL_WITH_YOUR_KEYSTORE_PATH',
    TLS_KEYSTORE_PASSWORD: loadSecretFromFile(path.join(__dirname, 'secrets/tls_keystore_password.txt')),
    // Disable unsecure protocols such as : SSL2, SSL3, TLS 1.0, TLS 1.1. Values are separated by a comma
    PROTOCOL_OPTIONS: 'SSL_OP_NO_SSLv2,SSL_OP_NO_SSLv3,SSL_OP_NO_TLSv1,SSL_OP_NO_TLSv1_1',
    BASE_PATH: '/demo-doc',
    SUPPORTED_LANGUAGES: 'en,es,fr' // used to translate the web pages
    // *******************************************************************
};

/**
 * Read a secret from a file. Only the first line will be read, line breaks are not returned.
 * @param {string?} filePath the path of the file containing the secret to load
 * @return {string?} the secret read or null of no path was supplied
 */
function loadSecretFromFile(filePath) {
    if (!filePath) {
        return null;
    }
    return fs.readFileSync(filePath, { encoding: 'utf-8' }).split(/\r?\n/)[0];
}
