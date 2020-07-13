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
const _ = require('lodash');
const config = require('./config');
const debug = require('debug')('front:app:api')

module.exports = {
    getSession: getSession,
    getLivenessChallengeResult: getLivenessChallengeResult,
    createFace: createFace,
    getFaceImage: getFaceImage,
    doMatch: doMatch,
}

 /**
 * Create session
 * @returns new session
 */
function getSession() {
    let bodyContentCallback = {
        'imageStorageEnabled': true,
        'livenessMode': config.LIVENESS_MODE,
        'securityLevel': config.LIVENESS_SECURITY_LEVEL,
        'numberOfChallenge': config.LIVENESS_HIGH_NUMBER_OF_CHALLENGE,
        'callbackURL': config.SERVER_PUBLIC_ADDRESS  + config.BASE_PATH + config.LIVENESS_RESULT_CALLBACK_PATH
    };
    let bodyContentNoCallback = {
        'imageStorageEnabled': true,
        'livenessMode': config.LIVENESS_MODE,
        'securityLevel': config.LIVENESS_SECURITY_LEVEL,
        'numberOfChallenge': config.LIVENESS_HIGH_NUMBER_OF_CHALLENGE,
    };

    return fetch(config.BIOSERVER_VIDEO_URL + config.VIDEO_SERVER_BASE_PATH + '/init-liveness-session', {
        method: 'POST',
        // if callback is disabled, don't pass the callbackURL to bioserver-core
        body: JSON.stringify(config.DISABLE_CALLBACK ? bodyContentNoCallback : bodyContentCallback),
        headers: _.merge({'content-type': 'application/json'}, authenticationHeader())
    }).then(function (res) {
        if (res.status !== 201) return  Promise.reject(res);
        else return res.headers.get('location').split('/bio-sessions/')[1]
    })
}

 /**
 * retrieve challenge result for a given session
 * @param session
 * @param livenessMode
 * @param numberOfChallenge
 * @param securityLevel
 * @returns livenessResult
 */
function getLivenessChallengeResult(sessionId, livenessMode, numberOfChallenge, securityLevel) {

    let url = config.BIOSERVER_CORE_URL + '/bio-sessions/' + sessionId + '/liveness-challenge-result';

    if (livenessMode) {
        url += "/"+livenessMode;
        if (securityLevel) {
            url += "/"+securityLevel;
        }
        if (numberOfChallenge) {
            url += "?numberOfChallenge="+numberOfChallenge;
        }
    }
    //debug('>> url {}', url);
    return fetch(url, {
        method: 'GET',
        headers: authenticationHeader()
    }).then(function (res) {
        if (res.status !== 200) return  Promise.reject(res);
        return res.json();
    })
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

    return fetch(config.BIOSERVER_CORE_URL + '/bio-sessions/' + sessionId + '/faces', {
        method: 'POST',
        body: formData,
        headers: authenticationHeader()
    }).then( res => {
        if (res.status !== 201) return  Promise.reject(res);
        else return res.headers.get('location').split('/faces/')[1]
    }). then( faceId => {
        return fetch(config.BIOSERVER_CORE_URL + '/bio-sessions/' + sessionId + '/faces/' + faceId , {
            method: 'GET',
            headers: _.merge({'content-type': 'application/json'}, authenticationHeader())
        })
    }).then( res => {
        if (res.status !== 200) return  Promise.reject(res);
        return res.json();
    });
}

/**
 * retrieve face for a given session
 * @param sessionId
 * @param faceId
 * @returns face
 */
function getFaceImage(sessionId, faceId) {
    let url = config.BIOSERVER_CORE_URL + '/bio-sessions/' + sessionId + '/faces/' + faceId + '/image';
    if(config.ENABLE_IMAGE_COMPRESSION){
        url = url + '?compression=true';
    }
    return fetch(url , {
        method: 'GET',
        headers: _.merge({'content-type': 'application/json'}, authenticationHeader())
    }).then( res => {
        if (res.status !== 200) return  Promise.reject(res);
        return res.buffer();
    });
}

/**
 * match reference face with faces associated to session
 * @param sessionId
 * @param referenceFaceId
 * @returns match result
 */
function doMatch(sessionId, referenceFaceId) {
    return fetch(config.BIOSERVER_CORE_URL + '/bio-sessions/' + sessionId + '/faces/' + referenceFaceId + '/matches' , {
        method: 'GET',
        headers: _.merge({'content-type': 'application/json'}, authenticationHeader())
    }).then( res => {
        if (res.status !== 200) return  Promise.reject(res);
        return res.json();
    });
}

function authenticationHeader() {
    const headers = {};
    headers[config.API_KEY_HEADER] =  config.API_KEY_SECRET;
    return headers;
}