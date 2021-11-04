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

const startDate = Date.now();
const express = require('express');
const config = require('./server/config');
const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('./server/config/demoLogConf').getLogger(__filename);
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
    logger.info(`Creating server with secure options: ${options.secureOptions}`);

    const app = express();
    const server = https.createServer(options, app);

    // serve demos
    logger.info('Available web applications:');

    app.use(config.BASE_PATH, (req, res, next) => {
        const locale = req.acceptsLanguages()[0].split('-')[0];
        let lang = 'en'; // default language
        if (config.SUPPORTED_LANGUAGES.split(',').includes(locale)) {
            lang = locale;
        }
        express.static(path.resolve(__dirname, `./front/doc-auth/${lang}/`))(req, res, next);
    });
    app.use('/:lang' + config.BASE_PATH + '/doc-auth', (req, res, next) => {
        let lang = 'en'; // default language
        if (config.SUPPORTED_LANGUAGES.split(',').includes(req.params.lang)) {
            lang = req.params.lang;
        }
        express.static(path.resolve(__dirname, `./front/doc-auth/${lang}/`))(req, res, next);
    });
    logger.info(`Doc authentication page => ${config.BASE_PATH}`);

    // Parse URL-encoded bodies (as sent by HTML forms)
    app.use(express.urlencoded({ extended: true }));
    // Parse JSON bodies (as sent by API clients)
    app.use(express.json());

    // init http endPoints
    httpEndpoints.initHttpEndpoints(app);

    ['SIGTERM', 'SIGINT'].forEach(event => {
        process.on(event, () => {
            logger.info(`<<< Catch ${event} .. exiting app !`);
            server.close(() => {
                logger.info('Http server closed.');
                process.exit(0);
            });
        });
    });

    // Let the server listen for incoming requests on defined port
    await new Promise(resolve => {
        server.listen(config.TLS_API_PORT, () => resolve());
    });

    logger.info(`Backend server started - https://localhost:${config.TLS_API_PORT}${config.BASE_PATH}`);
    logger.info(`Total starting time: ${Date.now() - startDate} ms`);
    if (config.IDPROOFING) {
        logger.info(`Using GIPS API on url: ${config.GIPS_URL}`);
    } else {
        logger.info(`Using WDS API on url: ${config.DOCSERVER_VIDEO_URL}${config.DOC_SERVER_BASE_PATH}`);
    }
})();
