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

const path = require('path');

/*
 * Configuration file
 */
module.exports = {

  // ******************* APIKEY/URL for DOCSERVER *******************
  DOCSERVER_VIDEO_URL: 'https://ipv-api-v2-eu-service.stg.dsa.idemia.io',
  WEB_SDK_LIVENESS_ID_DOC: 'PLEASE_FILL_WITH_YOUR_APIKEY',

  // callbackURL = SERVER_PUBLIC_ADDRESS + BASE_PATH + DOC_CAPTURE_CALLBACK_URL
  DISABLE_CALLBACK: true, // set this key to true to disable callback functionality
  SERVER_PUBLIC_ADDRESS: 'https://localhost',
  DOC_CAPTURE_CALLBACK_URL: '/doccapture-result-callback',
  // *******************************************************************

  // ******************* back-end server creation *******************
  TLS_API_PORT: 9943,
  TLS_CERT_PATH: path.join(__dirname, 'certs/cert.pem'),
  TLS_KEY_PATH: path.join(__dirname, 'certs/key.pem'),
  BASE_PATH: '/demo-doc',
  SUPPORTED_LANGUAGES: 'en,es,fr,ja' // used to translate the web pages
  // *******************************************************************

};
