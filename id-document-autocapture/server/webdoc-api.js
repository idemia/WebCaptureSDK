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

/*
 * File used to allow communication with WebDocserver API. This file can be used by integrator as it is.
 */
const fetch = (...args) => import('node-fetch').then(({ default: _fetch }) => _fetch(...args));
const config = require('./config');
const agent = require('./httpUtils').getAgent(config.WDS_TLS_TRUSTSTORE_PATH, config.PROXY_URL, config.NON_PROXY_HOSTS);
const logger = require('./config/demoLogConf').getLogger();

module.exports = {
    getCountryDocTypes,
    getDocSession,
    initDocSession,
    getDocCaptureResult
};

/**
 * retrieve session from WebDocServer
 * @param sessionId
 * @returns {Promise<any>}
 */
async function getDocSession(sessionId) {
    const url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v1/document-sessions/' + sessionId;
    logger.info(`getDocSession: GET ${url}`, { sessionId });
    const res = await fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent
    }).catch(err => {
        throw new Error(`getDocSession failed: ${formatFetchError(err)}`);
    });
    if (res.status !== 200) {
        throw createResponseError(res);
    }
    return res.json();
}
/**
 * Create document capture session on server
 * And retrieve session Id plus document capture rule for specific country code
 * @param countryCode
 * @param docType
 * @param rules
 * @returns {*}
 */
async function initDocSession(countryCode, docType, rules) {
    const contentBody = {
        ttlSeconds: config.DOC_CAPTURE_SESSION_TTL,
        correlationId: 'wds-demo-correlation-id',
        evidenceId: 'wds-demo-evidence-id',
        countryCode,
        docType
    };

    if (rules) {
        contentBody.docSideRules = rules;
        contentBody.countryCode = undefined;
        contentBody.docType = undefined;
    }

    if (!config.DISABLE_CALLBACK) {
        contentBody.callbackURL = config.SERVER_PUBLIC_ADDRESS + config.BASE_PATH + config.DOC_CAPTURE_CALLBACK_URL;
    }
    const url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v1/document-sessions';
    logger.debug(`initDocSession: POST ${url}`, contentBody);

    const res = await fetch(url, {
        method: 'POST',
        // if callback is disabled, don't pass the callbackURL to docserver
        body: JSON.stringify(contentBody),
        headers: { 'Content-Type': 'application/json', ...authenticationHeader() },
        agent
    }).catch(err => {
        throw new Error(`initDocSession failed: ${formatFetchError(err)}`);
    });
    if (res.status !== 200) {
        throw createResponseError(res);
    }
    return res.json();
}

/**
 * Get doc capture result from doc-docserver
 * @param sessionId
 * @param captureId
 * @returns {*}
 */
async function getDocCaptureResult(sessionId, captureId) {
    let url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v1/document-sessions/' + sessionId + '/captures';
    if (captureId) {
        url = url + '/' + captureId;
    }
    logger.debug(`getDocCaptureResult: GET ${url}`, { sessionId });

    const res = await fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent
    }).catch(err => {
        throw new Error(`getDocCaptureResult failed: ${formatFetchError(err)}`);
    });
    if (res.status !== 200) {
        throw createResponseError(res);
    }
    return res.json();
}

async function getCountryDocTypes(countryCode) {
    let url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v2/countries-doc-types';
    if (countryCode) {
        url = url + '/' + countryCode;
    }
    logger.debug(`getCountryDocTypes: GET ${url}`);
    const res = await fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).catch(err => {
        throw new Error(`getCountryDocTypes failed: ${formatFetchError(err)}`);
    });
    if (res.status !== 200) {
        throw createResponseError(res);
    }
    return res.json();
}

function authenticationHeader() {
    const headers = {};
    headers.apikey = config.WEB_SDK_LIVENESS_ID_DOC;
    return headers;
}

function formatFetchError(err) {
    return `${err}${err.code ? ', code: ' + err.code : ''}`;
}

function createResponseError(res) {
    const { status, statusText, url } = res;
    const err = new Error(`WDS status: ${status} ${statusText}, url: ${url}`);
    Error.captureStackTrace(err, createResponseError);
    return Object.assign(err, { status, statusText, url });
}
