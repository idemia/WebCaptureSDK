/*
Copyright 2020 Idemia Identity & Security

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

// this file contains configuration of sample app
module.exports = {

    // *** BIOSERVER CONNECTIVITY
    // Bioserver-core server api endpoint
    BIOSERVER_CORE_URL: 'https://ipv-api-v2-eu-service.stg.dsa.idemia.io:443/bioserver-app/v2',
    // Bioserver-video server
    BIOSERVER_VIDEO_URL: 'https://ipv-api-v2-eu-service.stg.dsa.idemia.io:443',
    // The value of the apikey to contact Biometric’s services and webSDK services
    WEB_SDK_LIVENESS_ID_DOC: 'PLEASE_FILL_WITH_YOUR_APIKEY',

    // *** GIPS CONNECTIVITY
    // Note : only needed if using ID&V
    // URL of GIPS component
    GIPS_URL: 'https://ipv-api-v2-eu-service.stg.dsa.idemia.io:443/gips',
    // Api key value sent via 'apikey' header to access gips services
    GIPS_RS_API_Key: 'PLEASE_FILL_WITH_YOUR_APIKEY',
    // To link sample application server with gips. Enable ID&V integration to use ID&V for initialisation and retrieve results on the liveness
    IDPROOFING: false,

    // *** CALLBACK
    // Set this key to true to disable callback functionality between demo-server backend and webBioserver. Default value is false.
    // Callback url will be SERVER_PUBLIC_ADDRESS + BASE_PATH + LIVENESS_RESULT_CALLBACK_PATH
    DISABLE_CALLBACK: true,
    // The ip address of the demo which will be used in callback url by the webioserver to callback the demo server with liveness results
    SERVER_PUBLIC_ADDRESS: 'https://localhost',
    // Used in callback URL to receive liveness result from WebioServercallback
    LIVENESS_RESULT_CALLBACK_PATH: '/liveness-result-callback',

    // *** LIVENESS
    // The liveness mode to use under demo-server which is passed when initializing the session. Default liveness set to passive liveness
    // lowest level, the algorithm will be more tolerant
    //  Highest level, the algorithm will be as much strict as it can be
    // LOW;MEDIUM;HIGH
    LIVENESS_SECURITY_LEVEL: 'HIGH',
    // The security level to apply for the current liveness session under dermo-server which is passed
    // when initializing the session. Default value is “HIGH”.
    LIVENESS_MODE: 'LIVENESS_PASSIVE', // LIVENESS_PASSIVE_VIDEO;LIVENESS_HIGH;LIVENESS_PASSIVE
    // The number of challenge to be done in high liveness mode under dermo-server which is passed when initializing the session.
    // Default number of challenge set to 2
    LIVENESS_HIGH_NUMBER_OF_CHALLENGE: 2,

    // *** BACK END SERVER
    // Server port
    TLS_API_PORT: 9943,
    // Path to the server's server SSL certificate
    TLS_KEYSTORE_PATH: 'PLEASE_FILL_WITH_YOUR_KEYSTORE_PATH',
    // Password for the server's server SSL certificate
    TLS_KEYSTORE_PASSWORD: loadSecretFromFile(path.join(__dirname, 'secrets/tls_keystore_password.txt')),
    // Path used to expose server. Used in callback URL to receive liveness result from WebioServercallback
    BASE_PATH: '/demo-server',
    // Disable unsecure protocols such as : SSL2, SSL3, TLS 1.0, TLS 1.1. Values are separated by a comma
    PROTOCOL_OPTIONS: 'SSL_OP_NO_SSLv2,SSL_OP_NO_SSLv3,SSL_OP_NO_TLSv1,SSL_OP_NO_TLSv1_1',

    // *** LANGUAGES
    // Supported languages. Used to translate the web pages
    SUPPORTED_LANGUAGES: 'en,es,fr',
    

};

/**
 * Read a secret from a file. Only the first line will be read, line breaks are not returned.
 * @param {string?} filePath the path of the file containing the secret to load
 * @return the secret read or null of no path was supplied
 */
function loadSecretFromFile(filePath) {
    if (!filePath) {
        return null;
    }
    return fs.readFileSync(filePath, { encoding: 'utf-8' }).split(/\r?\n/)[0];
}
