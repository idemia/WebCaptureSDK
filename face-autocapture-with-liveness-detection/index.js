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

// this file is the main program that start the sample with instructions and routing

const start = Date.now();
const express = require('express');
const config = require('./server/config');
const https = require('https');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('front:app:server');
const packer = require('./server/packer');
const httpEndpoints = require('./server/httpEndpoints');
const crypto = require('crypto');


packer.pack();

(async () => {
    // Protocol options
    const protocolOptionsList = config.PROTOCOL_OPTIONS ? config.PROTOCOL_OPTIONS.split(',') : [];

    const options = {
        pfx: fs.readFileSync(config.TLS_KEYSTORE_PATH),
        passphrase: config.TLS_KEYSTORE_PASSWORD, 
        secureOptions: protocolOptionsList.reduce((previous, current) => previous | crypto.constants[current])
    };
    debug(`Creating server with secure options: ${options.secureOptions}`);
    const app = express();
    // serve demos
    debug('Available web applications:');

    /**
     * Manage Server liveness mode
     */
    const defaultLang = 'en'; // default language

    const manageServerLivenessMode = (mode) => {
        app.use(config.BASE_PATH, express.static(path.resolve(__dirname, `front/home-${mode}`)));
        debug('Home page => /');
        app.use(`${config.BASE_PATH}/${mode}-liveness`, (req, res, next) => {
            const locale = req.acceptsLanguages()[0].split('-')[0];
            let lang = defaultLang;
            if (config.SUPPORTED_LANGUAGES.split(',').includes(locale)) {
                lang = locale;
            }
            express.static(path.resolve(__dirname, `front/${mode}-liveness/${lang}/`))(req, res, next);
        });
        app.use(`/:lang${config.BASE_PATH}/${mode}-liveness`, (req, res, next) => {
            let lang = defaultLang;
            if (config.SUPPORTED_LANGUAGES.split(',').includes(req.params.lang)) {
                lang = req.params.lang;
            }
            express.static(path.resolve(__dirname, `front/${mode}-liveness/${lang}/`))(req, res, next);
        });
    }

    if (config.LIVENESS_MODE === 'LIVENESS_HIGH') {
        manageServerLivenessMode('high');
        debug('high liveness configured, medium mode disabled => /high-liveness');
    } else if (config.LIVENESS_MODE === 'LIVENESS_PASSIVE_VIDEO') {
        manageServerLivenessMode('passive-video');
        debug('passive liveness video configured => /passive-video-liveness');
    } else if (config.LIVENESS_MODE === 'LIVENESS_PASSIVE') {
        manageServerLivenessMode('passive');
        debug('passive liveness configured => /passive-liveness');
    } 

    app.use(config.BASE_PATH + '/how-to', express.static('front/how-to'));
    debug('How to configure page => /how-to');

    // Parse URL-encoded bodies (as sent by HTML forms)
    app.use(express.urlencoded({ extended: true }));
    // Parse JSON bodies (as sent by API clients)
    app.use(express.json());

    // init http endPoints
    httpEndpoints.initHttpEndpoints(app);

    const server = https.createServer(options, app);
    // Let the server listen for incoming requests on defined port
    await new Promise(resolve => {
        server.listen(config.TLS_API_PORT, () => resolve());
    });
    debug(`Backend server started - https://localhost:${config.TLS_API_PORT}${config.BASE_PATH}`);
    debug(`Total starting time: ${Date.now() - start} ms`);
    if (config.IDPROOFING) {
        debug(`Using GIPS API on url: ${config.GIPS_URL}`);
    }

    ['SIGTERM', 'SIGINT'].forEach(event => {
        process.on(event, () => {
            debug(`<<< Catch ${event} .. exiting app !`);
            process.exit(0);
        });
    });
})();
