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

// this controllers allows you to interact with Biometric services through GIPS (IPV) calls

const fetch = (...args) => import('node-fetch').then(({ default: _fetch }) => _fetch(...args));
const config = require('./config');
const logger = require('./logger');
const multipart = require('parse-multipart');
const { getAgent, validateResponseStatus, HTTP_REQUEST_FAILED } = require('./httpUtils');
const agent = getAgent(config.GIPS_TLS_TRUSTSTORE_PATH, config.PROXY_URL, config.NON_PROXY_HOSTS);
const context = [{
    key: 'BUSINESS_ID',
    value: 'LOA1P'
}];

const PATH_V1_IDENTITY = '/v1/identities/';

module.exports = {
    getSession,
    getLivenessChallengeResult,
    getFaceImage,
    getGipsStatus
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

    if (!result[0].consentId || result[0].type !== 'PORTRAIT') {
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
 * Retrieve GIPS status from a given session
 * @param session
 * @returns gipsStatus
 */
async function getGipsStatus(session) {
    logger.info('Calling GIPS for status');
    const gipsStatus = await getGlobalStatus(session.identityId);
    logger.info('Status:', gipsStatus);
    return gipsStatus;
}

/**
 * Retrieve challenge result for a given session
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

async function createIdentity() {
    const res = await fetch(config.GIPS_URL + '/v1/identities', {
        method: 'POST',
        body: JSON.stringify(context),
        headers: mutipartContentType(authenticationHeader()),
        agent: agent
    }).catch(err => {
        logger.error('createIdentity failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.json();
}

/**
 * Post consent
 * POST {{url}}/v1/identities/{{identityId}}/consents
 * response 200
 * [{
 *   "approved": true,
 *   "type": "PORTRAIT",
 *   "validityPeriod": {
 *       "from": "2018-01-01"
 *  }
 * }]
 * @returns  Boolean true / false
 *  Error code 404/ 401 /
 */
async function postConsent(identityId) {
    const consent = [{
        approved: true,
        type: 'PORTRAIT',
        validityPeriod: {
            from: '2018-01-01'
        }
    }];
    const res = await fetch(config.GIPS_URL + PATH_V1_IDENTITY + identityId + '/consents', {
        method: 'POST',
        body: JSON.stringify(consent),
        headers: jsonContentType(authenticationHeader()),
        agent: agent
    }).catch(err => {
        logger.error('postConsent failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.json();
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
 *     "securityLevel": "HIGH",
 *     "nbChallenge": 0,
 *     "useAccurateMatch": true,
 *     "matchThreshold": 0,
 *     "signature": "string"
 *   }
 * }
 */
async function startVideoCapture(identityId) {
    const livenessParamerters = {
        type: (config.LIVENESS_MODE === 'LIVENESS_ACTIVE') ? 'LIVENESS_HIGH' : config.LIVENESS_MODE, // Waiting GIPS upgrade
        securityLevel: config.LIVENESS_SECURITY_LEVEL,
        nbChallenge: config.LIVENESS_ACTIVE_NUMBER_OF_CHALLENGE
    };

    const res = await fetch(config.GIPS_URL + PATH_V1_IDENTITY + identityId + '/attributes/portrait/live-capture-session', {
        method: 'POST',
        body: JSON.stringify(livenessParamerters),
        headers: jsonContentType(authenticationHeader()),
        agent: agent
    }).catch(err => {
        logger.error('startVideoCapture failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.json();
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
async function getStatus(identityId, portraitId) {
    const res = await fetch(config.GIPS_URL + PATH_V1_IDENTITY + identityId + '/status/' + portraitId, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).catch(err => {
        logger.error('getStatus failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.json();
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
async function getGlobalStatus(identityId) {
    const res = await fetch(config.GIPS_URL + PATH_V1_IDENTITY + identityId, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).catch(err => {
        logger.error('getGlobalStatus failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    return res.json();
}

/**
 * retrieve face for a given identity
 * @param identityId
 * @returns face
 */
async function getFaceImage(identityId) {
    const url = config.GIPS_URL + PATH_V1_IDENTITY + identityId + '/attributes/portrait/capture';
    const res = await fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent: agent
    }).catch(err => {
        logger.error('getFaceImage failed:', err);
        throw new Error(HTTP_REQUEST_FAILED);
    });
    validateResponseStatus(res);
    const multiPartBodyBuffer = Buffer.from(await res.arrayBuffer());
    const boundary = multipart.getBoundary(res.headers.get('content-type'));
    const parts = multipart.Parse(multiPartBodyBuffer, boundary);
    return parts[0].data;
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
