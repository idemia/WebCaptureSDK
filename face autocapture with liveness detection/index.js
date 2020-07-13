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

packer.pack();

// load certs from config folder
const server = https.createServer({
    key: fs.readFileSync(config.TLS_KEY_PATH),
    cert: fs.readFileSync(config.TLS_CERT_PATH)
}, app).listen(config.TLS_API_PORT, () => {
    debug('Backend server started - https://localhost:' + config.TLS_API_PORT + config.BASE_PATH);
    debug('Total starting time: ', Date.now() - start, 'ms')
});

// serve demos
debug('Available web applications:');

/**
 * Manage Server liveness mode
 */
if (config.LIVENESS_MODE === "LIVENESS_HIGH") {
    app.use(config.BASE_PATH, serveStatic('front/home-high'));
    debug('Home page => /');
    app.use(config.BASE_PATH + '/high-liveness', (req, res, next) => {
        const locale = req.acceptsLanguages()[0].split('-')[0];
        let lang = 'en'; // default language
        if (config.SUPPORTED_LANGUAGES.split(',').includes(locale)) {
            lang = locale;
        }
        express.static(`front/high-liveness/${lang}/`)(req, res, next);
    });
    app.use('/:lang' + config.BASE_PATH + '/high-liveness', (req, res, next) => {
        let lang = 'en'; // default language
        if (config.SUPPORTED_LANGUAGES.split(',').includes(req.params.lang)) {
            lang = req.params.lang;
        }
        express.static(`front/high-liveness/${lang}/`)(req, res, next);
    });
    debug('high liveness configured, medium mode disabled => /high-liveness');
} else if (config.LIVENESS_MODE === "LIVENESS_PASSIVE") {
    app.use(config.BASE_PATH, serveStatic('front/home-passive'));

    app.use(config.BASE_PATH + '/passive-liveness', (req, res, next) => {
        const locale = req.acceptsLanguages()[0].split('-')[0];
        let lang = 'en'; // default language
        if (config.SUPPORTED_LANGUAGES.split(',').includes(locale)) {
            lang = locale;
        }
        express.static(`front/passive-liveness/${lang}/`)(req, res, next);
    });
    app.use('/:lang' + config.BASE_PATH + '/passive-liveness', (req, res, next) => {
        let lang = 'en'; // default language
        if (config.SUPPORTED_LANGUAGES.split(',').includes(req.params.lang)) {
            lang = req.params.lang;
        }
        express.static(`front/passive-liveness/${lang}/`)(req, res, next);
    });
    debug('passive liveness configured => /passive-liveness');
} else {
    app.use(config.BASE_PATH, serveStatic('front/home-medium'));
    debug('Home page => /');
    app.use(config.BASE_PATH + '/medium-liveness', serveStatic('front/medium-liveness'));
    debug('Medium liveness configured, high mode disabled => /medium-liveness');
}

// generate download link for source code
app.use(config.BASE_PATH + '/download', serveStatic('download'));

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({extended: true}));
// Parse JSON bodies (as sent by API clients)
app.use(express.json());

if (config.USE_INTERNAL_PROXY) {
    const proxyUtils = require('./server/proxyUtils');
    // init proxy settings and requests
    proxyUtils.initProxy(server, app);
}

// init http endPoints
httpEndpoints.initHttpEndpoints(app);
