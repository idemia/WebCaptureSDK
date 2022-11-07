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

const http = require('http');
const https = require('https');
const debug = require('debug')('front:app:httpUtils');
const ProxyAgent = require('proxy-agent');
const splitca = require('split-ca');

/**
 * Creates an agent to be used by node-fetch with connection and TLS configuration
 * If a proxy url is defined, it will be used for non localhost connections, ignoring custom truststore configuration
 * @param {string?} trustStorePath the path of the truststore to load (bundle of pem certificates)
 * @param {string?} proxyUrl the url of the proxy
 * @returns {function(*): module:http.Agent|module:https.Agent}
 */
function getAgent(trustStorePath, proxyUrl) {
    // Array of pem certificates of the truststore bundle
    const trustStore = trustStorePath ? splitca(trustStorePath) : null;

    // Custom Agent to enforce custom CA
    const httpsAgent = new https.Agent({
        keepAlive: true,
        ca: trustStore
    });

    const httpAgent = new http.Agent({
        keepAlive: true
    });

    const proxyAgent = proxyUrl && new ProxyAgent(proxyUrl);

    // method expected as agent
    return url => {
        if (proxyAgent && !['localhost', '127.0.0.1'].includes(url.hostname)) {
            return proxyAgent;
        }
        if (url.protocol === 'http:') {
            return httpAgent;
        }
        return httpsAgent;
    };
}

function validateResponseStatus(response, status = 200) {
    if (response.status !== status) {
        debug(`<< Got unexpected response status: expected ${status} but got ${response.status}`);
        throw response; // FIXME: throw Error instead of Response
    }
}

module.exports = {
    getAgent,
    validateResponseStatus
};
