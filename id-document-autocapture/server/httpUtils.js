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

const http = require('http');
const https = require('https');
const splitca = require('split-ca');
const { ProxyAgent } = require('proxy-agent');
const proxyFromEnv = require('proxy-from-env');

/**
 * Creates an agent to be used by node-fetch with connection and TLS configuration
 * If a proxy url is defined, it will be used for non localhost connections, ignoring custom truststore configuration
 * @param {string?} trustStorePath the path of the truststore to load (bundle of pem certificates)
 * @param {string?} proxyUrl the url of the proxy
 * @param {string?} nonProxyHosts A comma/space/pipe separated list of hosts that the client is allowed to access without going through the proxy
 * @returns {ProxyAgent} an instance of ProxyAgent with a configured httpAgent & httpsAgent for non proxy connections
 */
function getAgent(trustStorePath, proxyUrl, nonProxyHosts) {
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

    // NO_PROXY only supports comma and space as separator, so convert pipe if any
    nonProxyHosts = nonProxyHosts?.replace?.('|', ',') || '';

    const proxyAgent = new ProxyAgent({
        keepAlive: true,
        getProxyForUrl: url => {
            if (!proxyUrl) {
                return '';
            }
            // Export back our proxy configuration as environment variables as required by proxy-from-env
            // This is safe as long as method proxyFromEnv.getProxyForUrl() is synchronous
            process.env.HTTP_PROXY = proxyUrl;
            process.env.HTTPS_PROXY = proxyUrl;
            process.env.NO_PROXY = nonProxyHosts;
            const proxy = proxyFromEnv.getProxyForUrl(url);
            return proxy;
        },
        httpAgent, // http fallback if getProxyForUrl return no proxy value
        httpsAgent // https fallback if getProxyForUrl return no proxy value
    });

    return proxyAgent;
}

module.exports = {
    getAgent
};
