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

// this file contains configuration of sample app

const path = require('path');

module.exports = {
    DEBUG: '*',
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
    BASE_PATH: "/demo-server",
    LIVENESS_MODE: "LIVENESS_HIGH", // NO_LIVENESS, LIVENESS_MEDIUM, LIVENESS_HIGH, LIVENESS_PASSIVE
    LIVENESS_HIGH_NUMBER_OF_CHALLENGE: 2,
    /*
	  possible value for LIVENESS_SECURITY_LEVEL:
        VERY_LOW  // lowest level, the algorithm will be more tolerant
        LOW
        MEDIUM
        HIGH
        VERY_HIGH
        VERY_HIGH2
        VERY_HIGH3
        VERY_HIGH4
        VERY_HIGH5
        VERY_HIGH6
        VERY_HIGH7
        VERY_HIGH8// Highest level, the algorithm will be as much strict as it can be
	*/
    LIVENESS_SECURITY_LEVEL: "VERY_HIGH3",
    // used to callback demo-server by WebioServer
    SERVER_PUBLIC_ADDRESS: "https://localhost",
    // used in callback URL to receive liveness result from WebioServer
    // callbackURL = SERVER_PUBLIC_ADDRESS + BASE_PATH + LIVENESS_RESULT_CALLBACK_PATH
    LIVENESS_RESULT_CALLBACK_PATH: "/liveness-result-callback",
    DISABLE_CALLBACK: true, // set this key to true to disable callback functionality
    VIDEO_HEALTH_PATH: '/v2/monitor', // monitor url of video-server, should be fixed as /health on prod

    VIDEO_SERVER_BASE_PATH: "/video-server",
    VIDEO_SERVER_WSPATH: "/engine.io",
    VIDEO_SERVER_RTCCONFIGPATH: "/coturnService",

    TLS_API_PORT: 9943,
    TLS_CERT_PATH: path.join(__dirname, 'certs/cert.pem'),
    TLS_KEY_PATH: path.join(__dirname, 'certs/key.pem'),

    // BioServer service
    BIOSERVER_CORE_URL: 'https://localhost/bioserver-app/v2',
    BIOSERVER_VIDEO_URL: 'https://localhost:9443',

    // apiKey conf
    API_KEY_HEADER: 'apikey',//apiKey
    API_KEY_SECRET: 'secret',

    CODING_QUALITY_THRESHOLD: 100,
    MATCHING_SCORE_THRESHOLD: 3000,
    ENABLE_IMAGE_COMPRESSION:true,
    /********************
    // GIPS INTEGRATION
    // ENABLE GIPS TO WBS AUTHENT TYPE
    ********************/
    GIPS_URL:'http://localhost/gips/rest',
    GIPS_TENANT_ROLE:'RELYING_SERVICE',
    GIPS_API_KEY_HEADER: 'tenant-id',
    GIPS_API_KEY_SECRET: 'gips',
    IDPROOFING:false,
    USE_INTERNAL_PROXY:false, // pass though internal demo-server proxy to set the 3 liveness parameters key when using demo-server with id-proofing functionnality
    SUPPORTED_LANGUAGES: 'en,es,fr,ja' // used to translate the web pages
};
