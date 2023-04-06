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

const startDate = Date.now();
const express = require('express');
const compression = require('compression');
const config = require('./server/config');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const debug = require('debug')('front:app:server');
const packer = require('./server/packer');
const httpEndpoints = require('./server/httpEndpoints');
const crypto = require('crypto');


const DEFAULT_LANG = 'en'; // default language

packer.pack();

(async () => {
    const app = express();
    app.use(compression());

    // serve demos
    debug('Available web applications:');
    debug('Home page => /');

    // Manage Server liveness mode
    const manageServerLivenessMode = (mode) => {
        app.use(config.BASE_PATH, express.static(path.resolve(__dirname, `front/home-${mode}`)));
        app.use(config.BASE_PATH + '/video/tutorial.mp4', express.static(path.resolve(__dirname, 'assets/tutorial.mp4')));
        app.use(`${config.BASE_PATH}/${mode}-liveness`, (req, res, next) => {
            const locale = req.acceptsLanguages()[0].split('-')[0];
            let lang = DEFAULT_LANG;
            if (config.SUPPORTED_LANGUAGES.split(',').includes(locale)) {
                lang = locale;
            }
            express.static(path.resolve(__dirname, `front/${mode}-liveness/${lang}/`))(req, res, next);
        });
        app.use(`/:lang${config.BASE_PATH}/${mode}-liveness`, (req, res, next) => {
            let lang = DEFAULT_LANG;
            if (config.SUPPORTED_LANGUAGES.split(',').includes(req.params.lang)) {
                lang = req.params.lang;
            }
            express.static(path.resolve(__dirname, `front/${mode}-liveness/${lang}/`))(req, res, next);
        });
    };

    if (config.LIVENESS_MODE === 'LIVENESS_ACTIVE') {
        manageServerLivenessMode('active');
        debug('Active liveness configured => /active-liveness');
    } else if (config.LIVENESS_MODE === 'LIVENESS_PASSIVE_VIDEO') {
        manageServerLivenessMode('passive-video');
        debug('Passive liveness video configured => /passive-video-liveness');
    }  else {
        manageServerLivenessMode('passive'); /// LIVENESS_PASSIVE by default
        debug('Passive liveness configured => /passive-liveness');
    }

    // Parse URL-encoded bodies (as sent by HTML forms)
    app.use(express.urlencoded({ extended: true }));
    // Parse JSON bodies (as sent by API clients)
    app.use(express.json());

    // init http endPoints
    httpEndpoints.initHttpEndpoints(app);

    // HTTPS server
    if (config.TLS_API_PORT) {
        // Protocol options
        const protocolOptionsList = config.PROTOCOL_OPTIONS ? config.PROTOCOL_OPTIONS.split(',') : [];

        const options = {
            pfx: fs.readFileSync(config.TLS_KEYSTORE_PATH),
            passphrase: config.TLS_KEYSTORE_PASSWORD, 
            secureOptions: protocolOptionsList.reduce((previous, current) => previous | crypto.constants[current])
        };
        debug(`Creating server with secure options: ${options.secureOptions}`);

        const server = https.createServer(options, app);

        // Let the server listen for incoming requests on defined port
        await new Promise(resolve => {
            server.listen(config.TLS_API_PORT, () => resolve());
        });
        debug(`Https server started - https://localhost:${config.TLS_API_PORT}${config.BASE_PATH}`);
    }
    // HTTP server
    if (config.HTTP_SERVER_PORT) {
        const server = http.createServer(app);
        // Let the server listen for incoming requests on defined port
        await new Promise(resolve => {
            server.listen(config.HTTP_SERVER_PORT, () => resolve());
        });
        debug(`Http server started - http://localhost:${config.HTTP_SERVER_PORT}${config.BASE_PATH}`);
    }

    debug(`Total starting time: ${Date.now() - startDate} ms`);
    if (config.IDPROOFING) {
        debug(`Using GIPS API on url: ${config.GIPS_URL}`);
    }

    ['SIGTERM', 'SIGINT'].forEach(event => {
        process.on(event, () => {
            debug(`<<< Caught ${event}, exiting app !`);
            process.exit(0);
        });
    });
})();
