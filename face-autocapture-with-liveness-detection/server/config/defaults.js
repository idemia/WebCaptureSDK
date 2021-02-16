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

// this file contains configuration of sample app
module.exports = {

    // ******************* APIKEY/URL for WBS/GIPS *******************
    BIOSERVER_CORE_URL: 'https://ipv-api-v2-eu-service.stg.dsa.idemia.io:443/bioserver-app/v2',
    BIOSERVER_VIDEO_URL: 'https://ipv-api-v2-eu-service.stg.dsa.idemia.io:443',
    WEB_SDK_LIVENESS_ID_DOC: 'PLEASE_FILL_WITH_YOUR_APIKEY',

    // only needed if using ID&V
    GIPS_URL: 'https://ipv-api-v2-eu-service.stg.dsa.idemia.io:443/gips',
    GIPS_RS_API_Key: 'PLEASE_FILL_WITH_YOUR_APIKEY',
    IDPROOFING: false, // enable ID&V integration to use ID&V for initialisation and retrieve results on the liveness

    // callbackURL = SERVER_PUBLIC_ADDRESS + BASE_PATH + LIVENESS_RESULT_CALLBACK_PATH
    DISABLE_CALLBACK: true, // set this key to true to disable callback functionality
    SERVER_PUBLIC_ADDRESS: 'https://localhost', // used in callback URL to receive liveness result from WebBioServer
    LIVENESS_RESULT_CALLBACK_PATH: '/liveness-result-callback',
    // *******************************************************************

    // ******************* LIVENESS parameters *******************
    /* lowest level, the algorithm will be more tolerant
     Highest level, the algorithm will be as much strict as it can be
     VERY_LOW;LOW;MEDIUM;HIGH;VERY_HIGH;VERY_HIGH2;VERY_HIGH3;VERY_HIGH4;VERY_HIGH5;VERY_HIGH6;VERY_HIGH7;VERY_HIGH8 */
    LIVENESS_SECURITY_LEVEL: 'HIGH',
    LIVENESS_MODE: 'LIVENESS_PASSIVE', // NO_LIVENESS;LIVENESS_MEDIUM;LIVENESS_HIGH;LIVENESS_PASSIVE
    LIVENESS_HIGH_NUMBER_OF_CHALLENGE: 2,
    // *******************************************************************

    // ******************* back-end server creation *******************
    TLS_API_PORT: 9943,
    TLS_KEYSTORE_PATH: 'PLEASE_FILL_WITH_YOUR_KEYSTORE_PATH',
    TLS_KEYSTORE_PASSWORD: 'PLEASE_FILL_WITH_YOUR_KEYSTORE_PASSWORD',

    BASE_PATH: '/demo-server',
    SUPPORTED_LANGUAGES: 'en,es,fr,ja' // used to translate the web pages
};
