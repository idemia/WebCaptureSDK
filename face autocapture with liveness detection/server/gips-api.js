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

// this controllers allow you to interact with Biometric services throw gips (ipv) calls

const fetch = require('node-fetch');
const FormData = require('form-data');
const _ = require('lodash');
const config = require('./config');
const debug = require('debug')('front:gips:api');
var multipart = require('parse-multipart');
const context = [{
    "key": "BUSINESS_ID",
    "value": "LOA1P"
}];

const passportFRA = {"jurisdiction": "FRA", "documentType": "PASSPORT", "source": "LIVE_CAPTURE_IMAGE"};

module.exports = {

    getSession: getSession,
    getLivenessChallengeResult: getLivenessChallengeResult,
    createFace: createFace,
    getFaceImage: getFaceImage,

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


    let identity = {id:identityId}
    if(!identity.id){
        identity = await createIdentity();
    }
    let result = await postConsent(identity.id);

    if(!result[0].consentId || result[0].type !='PORTRAIT'){
        throw Error('Unable to create PORTRAIT Consent')
    }

    let session = await startVideoCapture(identity.id);

    return {
        identityId:identity.id,
        sessionId:session.sessionId,
        portraitId:session.id
    }

}

 /**
 * retrieve challenge result for a given session
 * @param session
 * @returns livenessResult
 */
async function getLivenessChallengeResult(session) {

   let portraitStatus =  await getStatus(session.identityId, session.portraitId);

    let livenessResult = {
        livenessStatus: 'FAILED',
        livenessMode: '',
        bestImageId: session.identityId // send identify id for gips not portrait id
    };

   if(portraitStatus.errors && portraitStatus.errors.length > 0){
       livenessResult.diagnostic='No face detected';
       livenessResult.isLivenessSucceeded = false;
       livenessResult.livenessStatus = 'FAILED';
       livenessResult.status = 'FAILED';
       return livenessResult;
   }

    if(portraitStatus.status === "NOT_VERIFIED" ){
        livenessResult.livenessStatus='SUCCESS';
        livenessResult.status = 'SUCCESS';
        livenessResult.isLivenessSucceeded = true;
    }

    else if(portraitStatus.status === "INVALID" ){
        livenessResult.livenessStatus='SUCCESS';
        livenessResult.status = 'SUCCESS';
        livenessResult.matching = false;
    }

    else if(portraitStatus.status === "VERIFIED" ){
        livenessResult.livenessStatus='SUCCESS';
        livenessResult.status = 'SUCCESS';
        livenessResult.matching = true;
    } else {
        livenessResult.livenessStatus='PROCESSING';
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
        headers: mutipartContentType(authenticationHeader())
    }).then(function (res) {
        if (res.status !== 200) return  Promise.reject(res);
        else return res.json()
    }).catch(err => {
        debug('Failed to request gips server  - error:', err);
        return  Promise.reject(err);
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

    const consent  = [{
        'approved': true,
        'type': 'PORTRAIT',
        'validityPeriod': {
            'from': '2018-01-01'
        }
    }];


    return fetch(config.GIPS_URL + '/v1/identities/'+identityId+'/consents', {
        method: 'POST',
        body: JSON.stringify(consent),
        headers: jsonContentType(authenticationHeader())
    }).then(function (res) {
        if (res.status !== 200) return  Promise.reject(res);
        else {

            return res.json();
        }

    })
}


/**
 * Start video capture init session
 * response 200

 * POST {{url}}/v1/identities/{{identityId}}/attributes/portrait/live-capture-video-session
 * @returns
 * {
 *   "status": "PROCESSING",
 *   "type": "PORTRAIT",
 *   "id": "3c527efe-6cf2-48d5-b797-36e417b3fc9b",
 *   "sessionId": "c8ce1c32-2bab-411f-8c33-7fb17012a028"
 * }
 */
function startVideoCapture(identityId) {

    return fetch(config.GIPS_URL + '/v1/identities/'+identityId+'/attributes/portrait/live-capture-video-session', {
        method: 'POST',
        headers: authenticationHeader()
    }).then(function (res) {
        if (res.status !== 200) return  Promise.reject(res);
        else return res.json()
    })
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

    return fetch(config.GIPS_URL + '/v1/identities/'+identityId+'/status/'+portraitId, {
        method: 'GET',
        headers: authenticationHeader()
    }).then(function (res) {
        if (res.status !== 200) return  Promise.reject(res);
        else return res.json()
    })
}

/**
 * associate face to an identity
 * @param imageFile
 * @param identityId
 * @returns {*}
 */
function createFace( imageFile, identityId) {
    const formData = new FormData();
    formData.append('DocumentCaptureDetails', Buffer.from(JSON.stringify(passportFRA)));
    formData.append('DocumentFront', imageFile.buffer);

    return fetch(config.GIPS_URL +'/v1/identities/'+identityId+'/id-documents/capture', {
        method: 'POST',
        body: formData,
        headers: mutipartContentType(authenticationHeader())
    }).then( res => {
        if (res.status !== 201) return  Promise.reject(res);
        //passport id
        else return res.json()
    });

}

/**
 * retrieve face for a given identity
 * @param identityId
 * @returns face
 */
function getFaceImage(identityId) {
    let url = config.GIPS_URL + '/v1/identities/'+identityId+'/attributes/portrait/capture';

    return fetch(url , {
        method: 'GET',
        headers:  authenticationHeader()
    }).then( res => {
        if (res.status !== 200) return  Promise.reject(res);
        return res.buffer()
    }).then( body => {
        let data = (String (body));
        let boundary  = data.split('\r')[0];
        var parts = multipart.Parse(body,boundary.replace('--', ''));
        return parts[0].data
    }).catch(err => {
        debug(url, ' Failed to request gips server  - error:', err);
        return  Promise.reject(err);
    });
}


function authenticationHeader() {
    const headers = {};
    headers[config.API_KEY_HEADER] =  config.API_KEY_SECRET;
    headers[config.GIPS_API_KEY_HEADER] =  config.GIPS_API_KEY_SECRET;
    headers['Tenant-Role'] =  config.GIPS_TENANT_ROLE;
    headers['X-Forwarded-For'] =  'to-specify';

    return headers;
}



function jsonContentType(headers) {

    headers = _.merge({'content-type': 'application/json'},headers);
    return headers;
}



function mutipartContentType(headers) {

    headers = _.merge({'content-type': 'multipart/form-data'},headers);
    return headers;
}