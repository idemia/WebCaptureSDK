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

// this controllers allow you to interact with Biometric services
const fetch = (...args) => import('node-fetch').then(({ default: _fetch }) => _fetch(...args));
const config = require('./config');
const { getAgent, validateResponseStatus } = require('./httpUtils');
const agent = getAgent(config.WBS_TLS_TRUSTSTORE_PATH, config.PROXY_URL);

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

async function getSession() {
    const bodyContentCallback = {
        imageStorageEnabled: true,
        livenessMode: config.LIVENESS_MODE,
        numberOfChallenge: config.LIVENESS_HIGH_NUMBER_OF_CHALLENGE,
        callbackURL: config.SERVER_PUBLIC_ADDRESS + config.BASE_PATH + config.LIVENESS_RESULT_CALLBACK_PATH
    };
    const bodyContentNoCallback = {
        imageStorageEnabled: true,
        livenessMode: config.LIVENESS_MODE,
        numberOfChallenge: config.LIVENESS_HIGH_NUMBER_OF_CHALLENGE
    };
    if (config.LIVENESS_SECURITY_LEVEL) {
        bodyContentCallback.securityLevel = config.LIVENESS_SECURITY_LEVEL;
        bodyContentNoCallback.securityLevel = config.LIVENESS_SECURITY_LEVEL;
    }

    const res = await fetch(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + '/init-liveness-session', {
        method: 'POST',
        // if callback is disabled, don't pass the callbackURL to bioserver-core
        body: JSON.stringify(config.DISABLE_CALLBACK ? bodyContentNoCallback : bodyContentCallback),
        headers: Object.assign({}, contentTypeJson, authenticationHeader(true)),
        agent: agent
    });
    validateResponseStatus(res, 201);
    return res.headers.get('location').split(PATH_BIO_SESSIONS)[1];
}

async function getCapabilities() {
    // debug('getCapabilities', config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + config.VIDEO_HEALTH_PATH);
    const res = await fetch(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + config.VIDEO_HEALTH_PATH, {
        method: 'GET',
        headers: authenticationHeader(true),
        agent: agent
    });
    validateResponseStatus(res);
    return res.json();
}

/**
 * retrieve challenge result for a given session
 * @param sessionId
 * @returns livenessResult
 */
async function getLivenessChallengeResult(sessionId) {
    const url = config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/liveness-challenge-result';

    // debug('>> url {}', url);
    const res = await fetch(url, {
        method: 'GET',
        headers: authenticationHeader(true),
        agent: agent
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
    });
    validateResponseStatus(res, 201);
    const faceId = res.headers.get('location').split('/faces/')[1];
    res = await fetch(config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/faces/' + faceId, {
        method: 'GET',
        headers: Object.assign({}, contentTypeJson, authenticationHeader(false)),
        agent: agent
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
    });
    validateResponseStatus(res);
    return res.json();
}

function authenticationHeader(webSDKServices) {
    const headers = {};
    headers.apikey = webSDKServices ? config.API_KEY_SECRET_WEBSDK : config.API_KEY_SECRET_BIOMETRICS;
    return headers;
}
