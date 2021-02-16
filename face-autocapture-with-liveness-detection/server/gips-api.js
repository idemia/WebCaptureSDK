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

// this controllers allows you to interact with Biometric services through GIPS (IPV) calls

const fetch = require('node-fetch');
const FormData = require('form-data');
const config = require('./config');
const debug = require('debug')('front:gips:api');
const multipart = require('parse-multipart');
const agent = require('./httpUtils').getAgent(config.GIPS_TLS_TRUSTSTORE_PATH);
const context = [{
    key: 'BUSINESS_ID',
    value: 'LOA1P'
}];

const passportFRA = { jurisdiction: 'FRA', documentType: 'PASSPORT', source: 'LIVE_CAPTURE_IMAGE' };

module.exports = {
    getSession: getSession,
    getLivenessChallengeResult: getLivenessChallengeResult,
    createFace: createFace,
    getFaceImage: getFaceImage,
    getGipsStatus: getGipsStatus
};

/**
 * retrieve session for an identity
 * @param identityId
 * @returns
 * {
 *   "status": "PROCESSING",
 *   "type": "PORTRAIT",
 *   "id": "3c527efe-6cf2-48d5-b797-36e417b3fc9b",
 *   "sessionId": "c8ce1c32-2bab-411f-8c33-7fb17012a028"
 * }
 */
async function getSession(identityId) {
    let identity = { id: identityId };
    if (!identity.id) {
        identity = await createIdentity();
    }
    const result = await postConsent(identity.id);

    if (!result[0].consentId || result[0].type != 'PORTRAIT') {
        throw Error('Unable to create PORTRAIT Consent');
    }

    const session = await startVideoCapture(identity.id);

    return {
        identityId: identity.id,
        sessionId: session.sessionId,
        portraitId: session.id
    };
}

/**
 * retrieve GIPS status from a given session
 * @param session
 * @returns gipsStatus
 */
async function getGipsStatus(session) {
    debug('getGipsStatus called');

    const gipsStatus = await getGlobalStatus(session.identityId);
    debug('getGipsStatus called', gipsStatus);

    return gipsStatus;
}

/**
 * retrieve challenge result for a given session
 * @param session
 * @returns livenessResult
 */
async function getLivenessChallengeResult(session) {
    // {
    //     "status":"NOT_VERIFIED",
    //     "type":"PORTRAIT",
    //     "id":"0eca6486-4623-44a4-b956-1b0eaba17723"
    // }

    // SUCCESS,                  // Challenge(s) request(s) success
    // FAILED,                       // challenge(s) request(s) failed
    // SPOOF,                        // Challenge(s) request(s) spoof detected
    // TIMEOUT,
    // INITIALIZED,
    // IN_PROGRESS,
    // ERROR

    const portraitStatus = await getStatus(session.identityId, session.portraitId);

    const livenessResult = {
        livenessStatus: 'FAILED',
        livenessMode: '',
        bestImageId: session.identityId // send identify id for gips not portrait id
    };

    if (portraitStatus.errors && portraitStatus.errors.length > 0) {
        livenessResult.diagnostic = 'No face detected';
        livenessResult.isLivenessSucceeded = false;
        livenessResult.livenessStatus = 'FAILED';
        livenessResult.status = 'FAILED';
        return livenessResult;
    }

    if (portraitStatus.status === 'NOT_VERIFIED') {
        livenessResult.livenessStatus = 'SUCCESS';
        livenessResult.status = 'SUCCESS';
        livenessResult.isLivenessSucceeded = true;
    } else if (portraitStatus.status === 'INVALID') {
        livenessResult.livenessStatus = 'SUCCESS';
        livenessResult.status = 'SUCCESS';
        livenessResult.matching = false;
    } else if (portraitStatus.status === 'VERIFIED') {
        livenessResult.livenessStatus = 'SUCCESS';
        livenessResult.status = 'SUCCESS';
        livenessResult.matching = true;
    } else {
        livenessResult.livenessStatus = 'PROCESSING';
    }

    return livenessResult;
}

/**
 * Create new gips identity
 * POST {{url}}/v1/identities
 * response code 200
 * {
 *   "id": "f966c1cc-9cc6-40a8-beec-d433d6a46bbd",
 *   "status": "EXPECTING_INPUT",
 *   "levelOfAssurance": "LOA0",
 *   "creationDateTime": "2019-09-09T10:35:38.681",
 *   "evaluationDateTime": "2019-09-09T10:35:38.686",
 *  "upgradePaths": {
 *  ....
 *  Error code 404/ 401 /
 * @returns identity id
 */

function createIdentity() {
    const formData = new FormData();
    formData.append('context', Buffer.from(context));

    return fetch(config.GIPS_URL + '/v1/identities', {
        method: 'POST',
        body: formData,
        headers: mutipartContentType(authenticationHeader()),
        agent: agent
    }).then(function (res) {
        return res.status === 200 ? res.json() : Promise.reject(res);
    }).catch(err => {
        debug('Failed to request gips server  - error:', err);
        return Promise.reject(err);
    });
}

/**
 * Post consent
 * POST {{url}}/v1/identities/{{identityId}}/consents
 * response 200
 * [{
 *   "approved": true,
 *	"type": "PORTRAIT",
 *	"validityPeriod": {
 *		"from": "2018-01-01"
 *	}
 * }]
 * @returns  Boolean true / false
 *  Error code 404/ 401 /
 */
function postConsent(identityId) {
    const consent = [{
        approved: true,
        type: 'PORTRAIT',
        validityPeriod: {
            from: '2018-01-01'
        }
    }];

    return fetch(config.GIPS_URL + '/v1/identities/' + identityId + '/consents', {
        method: 'POST',
        body: JSON.stringify(consent),
        headers: jsonContentType(authenticationHeader()),
        agent: agent
    }).then(function (res) {
        return res.status === 200 ? res.json() : Promise.reject(res);
    });
}

/**
 * Start video capture init session with parameters from configuration
 * response 200

 * POST {{url}}/v1/identities/{{identityId}}/attributes/portrait/live-capture-session
 * @returns
 * {
 *   "status": "PROCESSING",
 *   "type": "ID_DOCUMENT",
 *   "id": "gips-998cf41c-6d76-45d2-b173-185854dc959f",
 *   "errors": [
 *     {
 *       "field": "surname",
 *       "code": "1006",
 *       "message": "A field does not have the good format"
 *     }
 *   ],
 *   "sessionId": "string",
 *   "livenessParameters": {
 *     "seed": "string",
 *     "serverRandom": "string",
 *     "certificates": [
 *       "string"
 *     ],
 *     "type": "LIVENESS_HIGH",
 *     "timeout": 0,
 *     "securityLevel": "VERY_LOW",
 *     "nbChallenge": 0,
 *     "useAccurateMatch": true,
 *     "matchThreshold": 0,
 *     "signature": "string"
 *   }
 * }
 */
function startVideoCapture(identityId) {
    const livenessParamerters = {
        type: config.LIVENESS_MODE,
        securityLevel: config.LIVENESS_SECURITY_LEVEL,
        nbChallenge: config.LIVENESS_HIGH_NUMBER_OF_CHALLENGE
    };

    return fetch(config.GIPS_URL + '/v1/identities/' + identityId + '/attributes/portrait/live-capture-session', {
        method: 'POST',
        body: JSON.stringify(livenessParamerters),
        headers: jsonContentType(authenticationHeader()),
        agent: agent
    }).then(function (res) {
        return res.status === 200 ? res.json() : Promise.reject(res);
    });
}

/**
 * Get portrait status
 * {{url}}/v1/identities/{{identityId}}/status/{{portraitId}}
 * {
 *   "status": "NOT_VERIFIED",
 *   "type": "PORTRAIT",
 *   "id": "0eca6486-4623-44a4-b956-1b0eaba17723"
 * }
 * @param identityId
 * @param portraitId
 * @returns {*}
 */
function getStatus(identityId, portraitId) {
    return fetch(config.GIPS_URL + '/v1/identities/' + identityId + '/status/' + portraitId, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).then(function (res) {
        return res.status === 200 ? res.json() : Promise.reject(res);
    });
}

/**
 * Get GIPS global status
 * {{url}}/v1/identities/{{identityId}}
 * { globalStatus:
 * { id: 'gips-68f30e11-0c2a-44e1-8f31-0fe090cac51c',
 *   status: 'EXPECTING_INPUT',
 *   levelOfAssurance: 'LOA0',
 *   creationDateTime: '2020-10-14T11:08:11.372',
 *   evaluationDateTime: '2020-10-14T11:08:20.994',
 *   upgradePaths: { LOA1: [Object], LOA2: [Object], LOA3: [Object], LOA4: [Object] } },
 *   consents:
 * [ { consentId: '7e5abdc2-34e7-4b78-a043-18554cb49ea9',
 *     approved: true,
 *     type: 'PORTRAIT',
 *     validityPeriod: [Object] } ],
 *   portrait:
 * { evidenceId: '23d323a0-3c2e-46d7-80d1-f289438e4c9b',
 *   submitDateTime: '2020-10-14T11:08:12.057',
 *   type: 'PORTRAIT',
 *   evidenceStatus:
 *    { evaluationDateTime: '2020-10-14T11:08:20.994',
 *      status: 'NOT_VERIFIED',
 *      strength: 'LEVEL4',
 *      score: 'LEVEL0',
 *      isAdjudicable: false },
 *   portraitQuality: true,
 *   portraitData: { source: 'LIVE_CAPTURE_VIDEO', channel: 'webSDK' } } }
 * @param identityId
 * @returns {*}
 */
function getGlobalStatus(identityId) {
    return fetch(config.GIPS_URL + '/v1/identities/' + identityId, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).then(function (res) {
        return res.status === 200 ? res.json() : Promise.reject(res);
    });
}

/**
 * associate face to an identity
 * @param imageFile
 * @param identityId
 * @returns {*}
 */
function createFace(imageFile, identityId) {
    const formData = new FormData();
    formData.append('DocumentCaptureDetails', Buffer.from(JSON.stringify(passportFRA)));
    formData.append('DocumentFront', imageFile.buffer);

    return fetch(config.GIPS_URL + '/v1/identities/' + identityId + '/id-documents/capture', {
        method: 'POST',
        body: formData,
        headers: mutipartContentType(authenticationHeader()),
        agent: agent
    }).then(res => {
        // passport id
        return res.status === 201 ? res.json() : Promise.reject(res);
    });
}

/**
 * retrieve face for a given identity
 * @param identityId
 * @returns face
 */
function getFaceImage(identityId) {
    const url = config.GIPS_URL + '/v1/identities/' + identityId + '/attributes/portrait/capture';

    return fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).then(res => {
        return res.status === 200 ? res.buffer() : Promise.reject(res);
    }).then(body => {
        const data = (String(body));
        const boundary = data.split('\r')[0];
        const parts = multipart.Parse(body, boundary.replace('--', ''));
        return parts[0].data;
    }).catch(err => {
        debug(url, ' Failed to request gips server  - error:', err);
        return Promise.reject(err);
    });
}

function authenticationHeader() {
    const headers = {};
    headers.apikey = config.GIPS_RS_API_Key;
    headers['Tenant-Role'] = config.GIPS_TENANT_ROLE;
    headers['X-Forwarded-For'] = 'to-specify';

    return headers;
}

function jsonContentType(headers) {
    headers = Object.assign({ 'content-type': 'application/json' }, headers);
    return headers;
}

function mutipartContentType(headers) {
    headers = Object.assign({ 'content-type': 'multipart/form-data' }, headers);
    return headers;
}
