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

// this file is the main program that start the sample with instructions and routing

const start = Date.now();
const express = require('express');
const config = require('./server/config');
const https = require('https');
const fs = require('fs');
const serveStatic = require('serve-static');
const debug = require('debug')('front:app:server');
const app = express();
const packer = require('./server/packer');
const httpEndpoints = require('./server/httpEndpoints');
const constants = require('crypto').constants;

packer.pack();

// load certs from config folder
const protocolOptionsList = (config.PROTOCOL_OPTIONS) ? config.PROTOCOL_OPTIONS.split(',') : [];
let serverSecureOptions;
protocolOptionsList.forEach(p => (serverSecureOptions = serverSecureOptions | constants[p]));
const options = {
    pfx: fs.readFileSync(config.TLS_KEYSTORE_PATH),
    passphrase: config.TLS_KEYSTORE_PASSWORD,
    secureOptions: serverSecureOptions
}

debug('Create a connection to the server with the secure options :', options.secureOptions);
const server = https.createServer(options, app).listen(config.TLS_API_PORT, () => {
    debug('Backend server started - https://localhost:' + config.TLS_API_PORT + config.BASE_PATH);
    debug('Total starting time: ', Date.now() - start, 'ms');
});

// serve demos
debug('Available web applications:');

/**
 * Manage Server liveness mode
 */
const defaultLang = 'en'; // default language
if (config.LIVENESS_MODE === 'LIVENESS_HIGH') {
    app.use(config.BASE_PATH, serveStatic('front/home-high'));
    debug('Home page => /');
    app.use(config.BASE_PATH + '/high-liveness', (req, res, next) => {
        const locale = req.acceptsLanguages()[0].split('-')[0];
        let lang = defaultLang;
        if (config.SUPPORTED_LANGUAGES.split(',').includes(locale)) {
            lang = locale;
        }
        express.static(`front/high-liveness/${lang}/`)(req, res, next);
    });
    app.use('/:lang' + config.BASE_PATH + '/high-liveness', (req, res, next) => {
        let lang = defaultLang;
        if (config.SUPPORTED_LANGUAGES.split(',').includes(req.params.lang)) {
            lang = req.params.lang;
        }
        express.static(`front/high-liveness/${lang}/`)(req, res, next);
    });
    debug('high liveness configured, medium mode disabled => /high-liveness');

} else if (config.LIVENESS_MODE === 'LIVENESS_PASSIVE_VIDEO') {
    app.use(config.BASE_PATH, serveStatic('front/home-passive-video'));

    app.use(config.BASE_PATH + '/passive-video-liveness', (req, res, next) => {
        const locale = req.acceptsLanguages()[0].split('-')[0];
        let lang = defaultLang;
        if (config.SUPPORTED_LANGUAGES.split(',').includes(locale)) {
            lang = locale;
        }
        express.static(`front/passive-video-liveness/${lang}/`)(req, res, next);
    });
    app.use('/:lang' + config.BASE_PATH + '/passive-video-liveness', (req, res, next) => {
        let lang = 'en'; // default language
        if (config.SUPPORTED_LANGUAGES.split(',').includes(req.params.lang)) {
            lang = req.params.lang;
        }
        express.static(`front/passive-video-liveness/${lang}/`)(req, res, next);
    });
    debug('passive liveness video configured => /passive-video-liveness');

} else if (config.LIVENESS_MODE === 'LIVENESS_PASSIVE') {
    app.use(config.BASE_PATH, serveStatic('front/home-passive'));

    app.use(config.BASE_PATH + '/passive-liveness', (req, res, next) => {
        const locale = req.acceptsLanguages()[0].split('-')[0];
        let lang = defaultLang;
        if (config.SUPPORTED_LANGUAGES.split(',').includes(locale)) {
            lang = locale;
        }
        express.static(`front/passive-liveness/${lang}/`)(req, res, next);
    });
    app.use('/:lang' + config.BASE_PATH + '/passive-liveness', (req, res, next) => {
        let lang = defaultLang;
        if (config.SUPPORTED_LANGUAGES.split(',').includes(req.params.lang)) {
            lang = req.params.lang;
        }
        express.static(`front/passive-liveness/${lang}/`)(req, res, next);
    });
    debug('passive liveness configured => /passive-liveness');
} 

app.use(config.BASE_PATH + '/how-to', serveStatic('front/how-to'));
debug('How to configure page => /how-to');

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));
// Parse JSON bodies (as sent by API clients)
app.use(express.json());

// init http endPoints
httpEndpoints.initHttpEndpoints(app);

['SIGTERM', 'SIGINT'].forEach(event => {
    process.on(event, () => {
        // do the cleaning job, but it wouldn't
        debug(`<<< Catch ${event} .. exiting app !`);
        server.close(() => {
            debug('Http server closed.');
            process.exit(0);
        });
    });
});
