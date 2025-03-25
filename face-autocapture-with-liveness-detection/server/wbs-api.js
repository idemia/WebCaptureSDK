/*
Copyright 2025 IDEMIA Public Security
Copyright 2020-2024 IDEMIA Identity & Security

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

// this controllers allow you to interact with Biometric services
const fetch = (...args) => import('node-fetch').then(({ default: _fetch }) => _fetch(...args));
const config = require('./config');
const logger = require('./logger');
const { getAgent, validateResponseStatus, HTTP_REQUEST_FAILED } = require('./httpUtils');
const agent = getAgent(config.WBS_TLS_TRUSTSTORE_PATH, config.PROXY_URL, config.NON_PROXY_HOSTS);

const PATH_BIO_SESSIONS = '/bio-sessions/';
const contentTypeJson = { 'content-type': 'application/json' };

module.exports = {
    getSession,
    getCapabilities,
    getLivenessChallengeResult,
    createFace,
    getFaceImage,
    doMatch
};

async function getSession(ageThreshold) {
    const bodyContent = {
        livenessMode: config.LIVENESS_MODE,
        numberOfChallenge: config.LIVENESS_ACTIVE_NUMBER_OF_CHALLENGE,
        correlationId: 'wbs-demo-correlation-id',
        evidenceId: 'wbs-demo-evidence-id',
        ageThreshold: ageThreshold
    };
    if (config.LIVENESS_SECURITY_LEVEL) {
        bodyContent.securityLevel = config.LIVENESS_SECURITY_LEVEL;
    }
    if (config.DISABLE_CALLBACK === false) {
        bodyContent.callbackURL = config.SERVER_PUBLIC_ADDRESS + config.BASE_PATH + config.LIVENESS_RESULT_CALLBACK_PATH;
    }

    const res = await fetch(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + '/init-liveness-session', {
        method: 'POST',
        // if callback is disabled, don't pass the callbackURL to bioserver-core
        body: JSON.stringify(bodyContent),
        headers: Object.assign({}, contentTypeJson, authenticationHeader(true)),
        agent: agent
    }).catch(err => {
        logger.error('getSession failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.headers.get('location').split(PATH_BIO_SESSIONS)[1];
}

async function getCapabilities() {
    // logger.debug('getCapabilities', config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + config.VIDEO_HEALTH_PATH);
    const res = await fetch(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + config.VIDEO_HEALTH_PATH, {
        method: 'GET',
        headers: authenticationHeader(true),
        agent: agent
    }).catch(err => {
        logger.error('getCapabilities failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.json();
}

/**
 * Retrieve challenge result for a given session
 * @param sessionId
 * @returns livenessResult
 */
async function getLivenessChallengeResult(sessionId) {
    const url = `${config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId}/liveness-challenge-result`;

    logger.info('>> Getting liveness challenge result using url', url);
    const res = await fetch(url, {
        method: 'GET',
        headers: authenticationHeader(true),
        agent: agent
    }).catch(err => {
        logger.error('getLivenessChallengeResult failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.json();
}

/**
 * associate face to a session
 * @param sessionId
 * @param imageFile
 * @param imageFaceInfo
 * @returns {*}
 */
async function createFace(sessionId, imageFile, imageFaceInfo = {}) {
    const { FormData, File } = await import('node-fetch');
    const formData = new FormData();
    formData.append('image', new File([new Uint8Array(imageFile.buffer)], 'image'));
    formData.append('face', new File([new Uint8Array(imageFaceInfo.buffer)], 'face'));

    let res = await fetch(config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/faces', {
        method: 'POST',
        body: formData,
        headers: authenticationHeader(false),
        agent: agent
    }).catch(err => {
        logger.error('createFace failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);

    const faceId = res.headers.get('location').split('/faces/')[1];
    res = await fetch(config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/faces/' + faceId, {
        method: 'GET',
        headers: Object.assign({}, contentTypeJson, authenticationHeader(false)),
        agent: agent
    }).catch(err => {
        logger.error('createFace 2 failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.json();
}

/**
 * retrieve face for a given session
 * @param sessionId
 * @param faceId
 * @returns face
 */
async function getFaceImage(sessionId, faceId) {
    let url = config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/faces/' + faceId + '/image';
    if (config.ENABLE_IMAGE_COMPRESSION) {
        url = url + '?compression=true';
    }
    const res = await fetch(url, {
        method: 'GET',
        headers: Object.assign({}, contentTypeJson, authenticationHeader(false)),
        agent: agent
    }).catch(err => {
        logger.error('getFaceImage failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    const resArray = await res.arrayBuffer();
    return Buffer.from(resArray);
}

/**
 * match reference face with faces associated to session
 * @param sessionId
 * @param referenceFaceId
 * @returns match result
 */
async function doMatch(sessionId, referenceFaceId) {
    const res = await fetch(config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/faces/' + referenceFaceId + '/matches', {
        method: 'GET',
        headers: Object.assign({}, contentTypeJson, authenticationHeader(false)),
        agent: agent
    }).catch(err => {
        logger.error('doMatch failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.json();
}

function authenticationHeader(webSDKServices) {
    const headers = {};
    headers.apikey = webSDKServices ? config.API_KEY_SECRET_WEBSDK : config.API_KEY_SECRET_BIOMETRICS;
    return headers;
}
