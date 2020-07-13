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

// This configuration allow you to not call directly Biometric services from sample app but to use a proxy to call Biometric services

// DEPRECATED : proxy mode should not be used. Only if you are under Biometric secrvices SDK earlier 3.9.7. This API is deprecated and will be removed.

const config = require('./config');
const httpProxy = require('http-proxy');
const httpEndpoints = require('./httpEndpoints');
const debug = require('debug')('front:app:proxyUtils');
const fs = require('fs');

exports = module.exports;

exports.initProxy = (server, app) => {
    const webioServerUrl = config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH;
    const docServerUrl = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH;
    // create the proxy server
    const proxy = new httpProxy.createProxyServer({
        ssl: {
            key: fs.readFileSync(config.TLS_KEY_PATH),
            cert: fs.readFileSync(config.TLS_CERT_PATH)
        },
        changeOrigin: true,
        ws: true,
        secure: false
    });

    debug('Middleware server created - Targeting servers: ', webioServerUrl, docServerUrl);

    proxy.on('error', async (error, req, res) => {
        debug('got error', error);
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        });
        res.end('Something went wrong with your request.');
    });

    /**
     * Add authentication headers
     * on outgoing proxy requests to wbs
     */
    proxy.on('proxyReq', function(proxyReq) {
        if (config.TOKEN_ENABLED) {
            proxyReq.setHeader('authorization','Bearer ' + httpEndpoints.getToken());
        } else {
            proxyReq.setHeader(config.API_KEY_HEADER, config.API_KEY_SECRET);
        }

        proxyReq.setHeader("liveness_mode", config.LIVENESS_MODE);
        proxyReq.setHeader("liveness_high_number_of_challenge", config.LIVENESS_HIGH_NUMBER_OF_CHALLENGE);
        proxyReq.setHeader("liveness_security_level", config.LIVENESS_SECURITY_LEVEL);
    });
    proxy.on('proxyRes', function (proxyRes, req, res) {
        // in case we want to debug response
        // debug('Got proxy response from the target url:', req.url, JSON.stringify(proxyRes.headers, true, 2));
    });
    server.on('upgrade', (req, socket, head) => {
        if (config.TOKEN_ENABLED) {
            req.headers['authorization'] =  'Bearer ' + httpEndpoints.getToken();
        } else {
            req.headers[config.API_KEY_HEADER] =  config.API_KEY_SECRET;
        }
        req.headers["liveness_mode"] = config.LIVENESS_MODE;
        req.headers["liveness_high_number_of_challenge"] = config.LIVENESS_HIGH_NUMBER_OF_CHALLENGE;
        req.headers["liveness_security_level"] = config.LIVENESS_SECURITY_LEVEL;
        proxy.ws(req, socket, head, {
            target: req.url.indexOf('/wsocket-d') > -1 ? getDsTarget(req) : getWsTarget(req),
            ignorePath: true
        });
    });

    /**
     * manage proxy requests
     */
    // forward socket requests to wbserver
    app.all(config.BASE_PATH + '/wsocket', function (req, res) {
        proxy.web(req, res, {
            target: getWsTarget(req),
            ignorePath: true
        });
    });
    // forward socket requests to docserver
    app.all(config.BASE_PATH + '/wsocket-ds', function (req, res) {
        proxy.web(req, res, {
            target: getDsTarget(req),
            ignorePath: true
        });
    });

    app.get(config.BASE_PATH + '/bioserver-environment-api.js', function (req, res) {
        proxy.web(req, res, {
            target: webioServerUrl + '/bioserver-environment-api.js',
            ignorePath: true
        });
    });

    app.get(config.BASE_PATH + '/apidoc', function (req, res) {
        proxy.web(req, res, {
            target: webioServerUrl + '/apidoc',
            ignorePath: true
        });
    });

    app.get(config.BASE_PATH + '/bioserver-video-api.js', function (req, res) {
        proxy.web(req, res, {
            target: webioServerUrl + '/bioserver-video-api.js',
            ignorePath: true
        });
    });
    app.get(config.BASE_PATH + '/bioserver-video-ui.js', function (req, res) {
        proxy.web(req, res, {
            target: webioServerUrl + '/bioserver-video-ui.js',
            ignorePath: true
        });
    });

    app.get(config.BASE_PATH + '/bioserver-network-check.js', function (req, res) {
        proxy.web(req, res, {
            target: webioServerUrl + '/bioserver-network-check.js',
            ignorePath: true
        });
    });


    app.get(config.BASE_PATH + '/network-latency', function (req, res) {
        proxy.web(req, res, {
            target: webioServerUrl + '/network-latency',
            ignorePath: true
        });
    });

    app.post(config.BASE_PATH + '/network-speed', function (req, res) {
        proxy.web(req, res, {
            target: webioServerUrl + '/network-speed',
            ignorePath: true
        });
    });

    app.get(config.BASE_PATH + '/network-speed', function (req, res) {
        proxy.web(req, res, {
            target: webioServerUrl + '/network-speed',
            ignorePath: true
        });
    });
    /**
     * Coturn service
     */
    app.get(config.BASE_PATH + '/rtcConfigurationService', function (req, res) {
        debug('coturnService call',req.path )
        proxy.web(req, res, {
            target:getRtcConfigurationServiceTarget(req),
            ignorePath: true
        });
    });


    app.get(config.BASE_PATH + '/v2/monitor', function (req, res) {
        debug('monitor call',req.path )
        proxy.web(req, res, {
            target: webioServerUrl + config.VIDEO_HEALTH_PATH ,
            ignorePath: true
        });
    });

    /**
     * Doc server
     */
    app.get(config.BASE_PATH + '/docserver-video-api.js', function (req, res) {
        proxy.web(req, res, {
            target: docServerUrl + '/docserver-video-api.js',
            ignorePath: true
        });
    });
};

function getDsTarget(req) {
    return config.DOCSERVER_VIDEO_URL
        + config.DOC_SERVER_BASE_PATH
        + config.DOC_SERVER_WSPATH
        + '/?' + req.url.split('?')[1];
}
function getWsTarget(req) {
    return config.BIOSERVER_VIDEO_URL
        + config.VIDEO_SERVER_BASE_PATH
        + config.VIDEO_SERVER_WSPATH
        + '/?' + req.url.split('?')[1];
}



function getRtcConfigurationServiceTarget(req) {
    return config.BIOSERVER_VIDEO_URL
        + config.VIDEO_SERVER_BASE_PATH
        + config.VIDEO_SERVER_RTCCONFIGPATH
        + '/?' + req.url.split('?')[1];
}

