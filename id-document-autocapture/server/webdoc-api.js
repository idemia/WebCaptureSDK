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

/*
 * File used to allow communication with WebDocserver API. This file can be used by integrator as it is.
 */
const fetch = require('node-fetch');
const config = require('./config');
const agent = require('./httpUtils').getAgent(config.WDS_TLS_TRUSTSTORE_PATH);
const logger = require('./config/demoLogConf').getLogger(__filename);
const serverErrorMessage = 'Error when requesting docserver: ';

module.exports = {
    getCountryDocTypes: getCountryDocTypes,
    getDocSession: getDocSession,
    initDocSession: initDocSession,
    getDocCaptureResult: getDocCaptureResult
};

/**
 * retrieve session from WebDocServer
 * @param sessionId
 * @returns {Promise<any>}
 */
function getDocSession(sessionId) {
    const url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v1/document-sessions/' + sessionId;
    logger.debug('GetDocSession Request: ', { sessionId, url });
    return fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).then(function (res) {
        if (res.status !== 200) {
            const error = { status: res.status, statusText: res.statusText };
            return Promise.reject(error);
        }
        return res.json();
    }).catch(function (error) {
        logger.error('GetDocSession failed', { sessionId, error });
        return Promise.reject(error);
    });
}
/**
 * Create document capture session on server
 * And retrieve session Id plus document capture rule for specific country code
 * @param countryCode
 * @param docType
 * @param rules
 * @returns {*}
 */
function initDocSession(countryCode, docType, rules) {
    const contentBody = {
        ttlSeconds: config.DOC_CAPTURE_SESSION_TTL,
        countryCode: countryCode
    };

    if (countryCode) { // TODO validate countryCode
        contentBody.countryCode = countryCode;
    }

    if (docType) { // TODO validate doctype
        contentBody.docType = docType;
    }

    if (rules) { // TODO validate rules
        contentBody.docSideRules = rules;
        contentBody.countryCode = undefined;
        contentBody.docType = undefined;
    }

    if (!config.DISABLE_CALLBACK) {
        contentBody.callbackURL = config.SERVER_PUBLIC_ADDRESS + config.BASE_PATH + config.DOC_CAPTURE_CALLBACK_URL;
    }
    const url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v1/document-sessions';
    logger.debug('2: Request %s, Parameters: %s', url, JSON.stringify(contentBody, null, 2));
    return fetch(url, {
        method: 'POST',
        // if callback is disabled, don't pass the callbackURL to docserver
        body: JSON.stringify(contentBody),
        headers: { 'content-type': 'application/json', ...authenticationHeader() },
        agent: agent
    }).then(function (res) {
        if (res.status !== 200) {
            const error = { status: res.status, statusText: res.statusText };
            return Promise.reject(error);
        }
        return res.json();
    }).catch(function (error) {
        logger.error(serverErrorMessage, { error });
        return Promise.reject(error);
    });
}

/**
 * Get doc capture result from doc-docserver
 * @param sessionId
 * @param captureId
 * @returns {*}
 */
function getDocCaptureResult(sessionId, captureId) {
    let url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v1/document-sessions/' + sessionId + '/captures';

    if (captureId) {
        url = url + '/' + captureId;
    }
    logger.debug('3: Request: ', { sessionId, url });

    return fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).then(function (res) {
        if (res.status !== 200) {
            const error = { status: res.status, statusText: res.statusText };
            return Promise.reject(error);
        }
        return res.json();
    }).catch(function (error) {
        logger.error(serverErrorMessage, { sessionId, error });
        return Promise.reject(error);
    });
}

function getCountryDocTypes(countryCode) {
    let url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v2/countries-doc-types';
    if (countryCode) {
        url = url + '/' + countryCode;
    }
    logger.debug('1: Request %s', url);
    return fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).then(function (res) {
        if (res.status !== 200) {
            const error = { status: res.status, statusText: res.statusText };
            return Promise.reject(error);
        }
        return res.json();
    }).catch(function (error) {
        logger.error(serverErrorMessage, { error });
        return Promise.reject(error);
    });
}

function authenticationHeader() {
    const headers = {};
    headers.apikey = config.WEB_SDK_LIVENESS_ID_DOC;
    return headers;
}
