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

const fetch = require('node-fetch');
const FormData = require('form-data');
const config = require('./config');
// const debug = require('debug')('front:app:api');
const agent = require('./httpUtils').getAgent(config.WBS_TLS_TRUSTSTORE_PATH, config.PROXY_URL);

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

function getSession() {
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

    return fetch(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + '/init-liveness-session', {
        method: 'POST',
        // if callback is disabled, don't pass the callbackURL to bioserver-core
        body: JSON.stringify(config.DISABLE_CALLBACK ? bodyContentNoCallback : bodyContentCallback),
        headers: Object.assign({}, contentTypeJson, authenticationHeader(true)),
        agent: agent
    }).then(function (res) {
        return res.status === 201 ? res.headers.get('location').split(PATH_BIO_SESSIONS)[1] : Promise.reject(res);
    });
}

function getCapabilities() {
    // debug('getCapabilities', config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + config.VIDEO_HEALTH_PATH);
    return fetch(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + config.VIDEO_HEALTH_PATH, {
        method: 'GET',
        headers: authenticationHeader(true),
        agent: agent
    }).then(function (res) {
        return res.status === 200 ? res.json() : Promise.reject(res);
    });
}

/**
 * retrieve challenge result for a given session
 * @param sessionId
 * @param livenessMode
 * @param numberOfChallenge
 * @param securityLevel
 * @returns livenessResult
 */
function getLivenessChallengeResult(sessionId, livenessMode, numberOfChallenge, securityLevel) {
    let url = config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/liveness-challenge-result';

    if (livenessMode) {
        url += '/' + livenessMode;
        if (securityLevel) {
            url += '/' + securityLevel;
        }
        if (numberOfChallenge) {
            url += '?numberOfChallenge=' + numberOfChallenge;
        }
    }

    // debug('>> url {}', url);
    return fetch(url, {
        method: 'GET',
        headers: authenticationHeader(true),
        agent: agent
    }).then(function (res) {
        return res.status === 200 ? res.json() : Promise.reject(res);
    });
}

/**
 * associate face to a session
 * @param sessionId
 * @param imageFile
 * @param imageFaceInfo
 * @returns {*}
 */
function createFace(sessionId, imageFile, imageFaceInfo = {}) {
    const formData = new FormData();
    formData.append('image', imageFile.buffer);
    formData.append('face', imageFaceInfo.buffer);

    return fetch(config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/faces', {
        method: 'POST',
        body: formData,
        headers: authenticationHeader(false),
        agent: agent
    }).then(res => {
        return res.status === 201 ? res.headers.get('location').split('/faces/')[1] : Promise.reject(res);
    }).then(faceId => {
        return fetch(config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/faces/' + faceId, {
            method: 'GET',
            headers: Object.assign({}, contentTypeJson, authenticationHeader(false)),
            agent: agent
        });
    }).then(res => {
        return res.status === 200 ? res.json() : Promise.reject(res);
    });
}

/**
 * retrieve face for a given session
 * @param sessionId
 * @param faceId
 * @returns face
 */
function getFaceImage(sessionId, faceId) {
    let url = config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/faces/' + faceId + '/image';
    if (config.ENABLE_IMAGE_COMPRESSION) {
        url = url + '?compression=true';
    }
    return fetch(url, {
        method: 'GET',
        headers: Object.assign({}, contentTypeJson, authenticationHeader(false)),
        agent: agent
    }).then(res => {
        return res.status === 200 ? res.buffer() : Promise.reject(res);
    });
}

/**
 * match reference face with faces associated to session
 * @param sessionId
 * @param referenceFaceId
 * @returns match result
 */
function doMatch(sessionId, referenceFaceId) {
    return fetch(config.BIOSERVER_CORE_URL + PATH_BIO_SESSIONS + sessionId + '/faces/' + referenceFaceId + '/matches', {
        method: 'GET',
        headers: Object.assign({}, contentTypeJson, authenticationHeader(false)),
        agent: agent
    }).then(res => {
        return res.status === 200 ? res.json() : Promise.reject(res);
    });
}

function authenticationHeader(webSDKServices) {
    const headers = {};
    headers.apikey = webSDKServices ? config.API_KEY_SECRET_WEBSDK : config.API_KEY_SECRET_BIOMETRICS;
    return headers;
}
