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
const FormData = require('form-data');
const config = require('./config');
const multipart = require('parse-multipart');
const agent = require('./httpUtils').getAgent(config.GIPS_TLS_TRUSTSTORE_PATH);
const logger = require('./config/demoLogConf').getLogger(__filename);
const context = [{
    key: 'BUSINESS_ID',
    value: 'LOA1P'
}];

module.exports = {
    getCountryDocTypes: getCountryDocTypes,
    initDocSession: initDocSession,
    getStatus: getStatus,
    getBestImage: getBestImage,
    getDocCaptureResult: getDocCaptureResult

};

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
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('context', Buffer.from(context));

        fetch(config.GIPS_URL + '/v1/identities', {
            method: 'POST',
            body: formData,
            headers: mutipartContentType(authenticationHeader()),
            agent: agent
        }).then(function (res) {
            logger.info('GIPS Endpoint : POST ' + config.GIPS_URL + '/v1/identities');
            if (res.status !== 200) {
                logger.error('GIPS Error : ' + res.status);
                reject(res);
            } else {
                resolve(res.json());
            }
        }).catch(err => {
            logger.error('Failed to request gips server  - error:', err);
            reject(err);
        });
    });
}

/**
 * Start doc capture init session with parameters from configuration
 * response 200

 * POST {{url}}/v1/identities/{{identityId}}/id-documents/live-capture-session
 */
function startDocCapture(identityId, country, type) {
    return new Promise((resolve, reject) => {
        const docParamerters = {
            issuingCountry: country,
            idDocumentType: type
        };

        fetch(config.GIPS_URL + '/v1/identities/' + identityId + '/id-documents/live-capture-session', {
            method: 'POST',
            body: JSON.stringify(docParamerters),
            headers: jsonContentType(authenticationHeader()),
            agent: agent
        }).then(function (res) {
            logger.info('GIPS Endpoint : POST ' + config.GIPS_URL + '/v1/identities/' + identityId + '/id-documents/live-capture-session');
            if (res.status !== 200) {
                logger.error('GIPS Error : ' + res.status);
                reject(res);
            } else {
                resolve(res.json());
            }
        }).catch((err) => {
            logger.error('Failed to request gips server  - error:', err);
            reject(err);
        });
    });
}

/**
 * Get supported evidence from GIPS configuration
 * response 200

 * POST {{url}}/v1/supported-evidence/countries
 */
function getSupportedEvidences(country) {
    return new Promise((resolve, reject) => {
        let url = config.GIPS_URL + '/v1/supported-evidence/countries';
        if (country) {
            url += '/' + country;
        }

        fetch(url, {
            method: 'GET',
            headers: authenticationHeader(),
            agent: agent
        }).then(function (res) {
            logger.info('GIPS Endpoint : GET ' + config.GIPS_URL + '/v1/supported-evidence/countries');
            if (res.status !== 200) {
                logger.error('GIPS Error : ' + res.status);
                reject(res);
            } else {
                resolve(res.json());
            }
        }).catch((err) => {
            logger.error('Failed to request gips server  - error:', err);
            reject(err);
        });
    });
}

/**
 * Initialize the docSession from GIPS by creating identity and session
 */
function initDocSession(countryCode, docType) {
    return new Promise((resolve, reject) => {
        try {
            let identity;
            let session;
            let countries;
            Promise.resolve().then(() => {
                return createIdentity();
            }).then((id) => {
                identity = id;
                return startDocCapture(identity.id, countryCode, docType);
            }).then((sId) => {
                session = sId;
                return getSupportedEvidences(countryCode);
            }).then((supportedEvidences) => {
                countries = supportedEvidences;
                const document = countries.documents.filter(c => c.documentType === docType);

                const res = {};
                res.docSideRules = [];
                if (document[0].sides[0].front !== 'FORBIDDEN') {
                    res.docSideRules.push({
                        side: {
                            id: 'SIDE1',
                            name: 'FRONT'
                        },
                        captureFeatures: []
                    });
                }
                if (document[0].sides[0].back !== 'FORBIDDEN') {
                    res.docSideRules.push({
                        side: {
                            id: 'SIDE2',
                            name: 'BACK'
                        },
                        captureFeatures: []
                    });
                }
                res.docFormat = document[0].format;
                res.id = session.sessionId;
                res.identity = identity.id;

                resolve(res);
            });
        } catch (err) {
            logger.error('Failed to request gips server  - error:', err);
            reject(err);
        }
    });
}

/**
 * Get global status from GIPS transaction
 * GET {{url}}/v1/identities/{{identityId}}?detailed=true
 */
function getStatus(identityId) {
    return new Promise((resolve, reject) => {
        fetch(config.GIPS_URL + '/v1/identities/' + identityId + '?detailed=true', {
            method: 'GET',
            headers: authenticationHeader(),
            agent: agent
        }).then(function (res) {
            logger.info('GIPS Endpoint : GET ' + config.GIPS_URL + '/v1/identities/' + identityId + '?detailed=true');

            if (res.status !== 200) {
                logger.error('GIPS Error : ' + res.status);
                reject(res);
            } else {
                resolve(res.json());
            }
        }).catch((err) => {
            logger.error('Failed to request gips server  - error:', err);
            reject(err);
        });
    });
}

/**
 * Get image from document capture from evidenceId
 * GET {{url}}/v1/identities/{{identityId}}//id-documents//{{evidenceId}}/capture
 */
function getBestImage(identityId, evidenceId) {
    return new Promise((resolve, reject) => {
        fetch(config.GIPS_URL + '/v1/identities/' + identityId + '/id-documents/' + evidenceId + '/capture', {
            method: 'GET',
            headers: authenticationHeader(),
            agent: agent
        }).then(function (res) {
            logger.info('GIPS Endpoint : GET ' + config.GIPS_URL + '/v1/identities/' + identityId + '/id-documents/' + evidenceId + '/capture');

            if (res.status !== 200) {
                logger.error('GIPS Error : ' + res.status);
                reject(res);
            } else {
                return res.buffer();
            }
        }).then(body => {
            const data = (String(body));
            const boundary = data.split('\r')[0];
            const parts = multipart.Parse(body, boundary.replace('--', ''));
            resolve(parts[0].data);
        }).catch(err => {
            logger.error('Failed to request gips server  - error:', err);
            reject(err);
        });
    });
}

async function getCountryDocTypes(countryCode) {
    return new Promise((resolve, reject) => {
        Promise.resolve().then(() => {
            return getSupportedEvidences(countryCode);
        }).then((countries) => {
            // [{"code":"FRA","docTypes":["PASSPORT","IDENTITY_CARD","DRIVING_LICENSE","RESIDENT_CARD"]},{"code":"USA","docTypes":["PASSPORT","DRIVING_LICENSE"]},{"code":"AFG"
            const res = [];
            countries.map((country) => {
                const element = {};
                element.code = country.iso3CountryCode;
                const acceptedTypes = [];
                country.documents.filter(c => c.liveVideoCaptureSupported).map((document) => {
                    acceptedTypes.push(document.documentType);
                });
                if (acceptedTypes.length > 0) {
                    element.docTypes = acceptedTypes;
                    res.push(element);
                }
            });
            resolve(res);
        }).catch(err => {
            logger.debug('Failed to request gips server  - error:', err);
            reject(err);
        });
    });
}

function getDocCaptureResult(gipsStatus, identityId) {
    return new Promise((resolve, reject) => {
        Promise.resolve().then(() => {
            if (gipsStatus.idDocuments && gipsStatus.idDocuments.length > 0) {
                return null;
            }
            return getBestImage(identityId, gipsStatus.idDocuments[gipsStatus.idDocuments.length - 1].evidenceId);
        }).then((bestImage) => {
            const lastDocument = (gipsStatus.idDocuments && gipsStatus.idDocuments.length > 0) ? gipsStatus.idDocuments[gipsStatus.idDocuments.length - 1] : null;
            const idDocumentData = (lastDocument) ? lastDocument.idDocumentData : null;
            const personalAttributes = (lastDocument && lastDocument.idDocumentData) ? lastDocument.idDocumentData.personalAttributes : null;
            const finalResult = {};

            finalResult.evidenceId = (lastDocument) ? lastDocument.evidenceId : null;
            finalResult.timeout = false;
            finalResult.identityId = identityId;
            finalResult.docImage = (bestImage) ? Buffer.from(bestImage).toString('base64') : null;
            finalResult.docCorners = [];
            finalResult.ocr = {};
            finalResult.ocr.mrz = {};
            finalResult.ocr.mrz.rawData = '';
            finalResult.ocr.mrz.identity = {};
            finalResult.ocr.mrz.documentInfo = {};
            finalResult.ocr.rawData = '';
            finalResult.ocr.identity = {};
            finalResult.ocr.documentInfo = {};

            if (personalAttributes) {
                finalResult.ocr.mrz.identity.gender = personalAttributes.gender ? personalAttributes.gender.value : '';
                finalResult.ocr.mrz.identity.givenNames = personalAttributes.givenNames && personalAttributes.givenNames[0] ? [personalAttributes.givenNames[0].value] : [];
                finalResult.ocr.mrz.identity.surname = personalAttributes.surname ? personalAttributes.surname.value : '';
                finalResult.ocr.mrz.identity.dateOfBirth = personalAttributes.dateOfBirth ? personalAttributes.dateOfBirth.value : '';
                finalResult.ocr.mrz.identity.fullName = finalResult.ocr.mrz.identity.givenNames[0] + ' ' + finalResult.ocr.mrz.identity.surname;

                finalResult.ocr.identity.gender = personalAttributes.gender ? personalAttributes.gender.value : '';
                finalResult.ocr.identity.givenNames = personalAttributes.givenNames && personalAttributes.givenNames[0] ? [personalAttributes.givenNames[0].value] : '';
                finalResult.ocr.identity.surname = personalAttributes.surname ? personalAttributes.surname.value : '';
                finalResult.ocr.identity.dateOfBirth = personalAttributes.dateOfBirth ? personalAttributes.dateOfBirth.value : '';
            }

            if (idDocumentData) {
                finalResult.ocr.mrz.documentInfo.documentNumber = idDocumentData.idDocumentNumber;
                finalResult.ocr.mrz.documentInfo.issuingCountry = idDocumentData.issuingCountry;
                finalResult.ocr.documentInfo.documentNumber = idDocumentData.idDocumentNumber;
                finalResult.ocr.documentInfo.issuingCountry = idDocumentData.issuingCountry;
            }

            resolve(finalResult);
        }).catch(err => {
            logger.debug('Failed to request gips server  - error:', err);
            reject(err);
        });
    });
}

/**
 * add header to contact GIPS
 */
function authenticationHeader() {
    const headers = {};
    headers.apikey = config.GIPS_RS_API_Key;
    headers['Tenant-Role'] = config.GIPS_TENANT_ROLE;
    headers['X-Forwarded-For'] = 'to-specify';
    return headers;
}

/**
 * add json content-type
 */
function jsonContentType(headers) {
    headers['Content-Type'] = 'application/json';
    return headers;
}

/**
 * add multipart header
 */
function mutipartContentType(headers) {
    headers['Content-Type'] = 'multipart/form-data';
    return headers;
}
