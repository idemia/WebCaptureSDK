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
const FormData = require('form-data');
const config = require('./config');
const multipart = require('parse-multipart');
const agent = require('./httpUtils').getAgent(config.GIPS_TLS_TRUSTSTORE_PATH, config.PROXY_URL);
const logger = require('./config/demoLogConf').getLogger();
const context = [{
    key: 'BUSINESS_ID',
    value: 'LOA1P'
}];
const FRONT = 'FRONT';
const BACK = 'BACK';
const frontRule = {
    side: {
        id: 'SIDE1',
        name: FRONT
    },
    captureFeatures: []
};
const backRule = {
    side: {
        id: 'SIDE2',
        name: BACK
    },
    captureFeatures: []
};

module.exports = {
    getCountryDocTypes,
    initDocSession,
    getStatus,
    getBestImage,
    getDocCaptureResult
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
async function createIdentity() {
    const formData = new FormData();
    formData.append('context', Buffer.from(context));
    const url = `${config.GIPS_URL}/v1/identities`;
    logger.debug(`createIdentity: POST ${url}`);

    const res = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data', ...authenticationHeader() },
        agent
    }).catch(err => {
        throw new Error(`createIdentity failed: ${formatFetchError(err)}`);
    });
    if (res.status !== 200) {
        throw createResponseError(res);
    }
    return res.json();
}

/**
 * Start doc capture init session with parameters from configuration
 * response 200
 * POST {{url}}/v1/identities/{{identityId}}/id-documents/live-capture-session
 */
async function startDocCapture(identityId, country, type) {
    const docParamerters = {
        idDocumentType: type
    };
    if (country) {
        docParamerters.issuingCountry = country;
    }
    const url = `${config.GIPS_URL}/v1/identities/${identityId}/id-documents/live-capture-session`;
    logger.debug(`startDocCapture: POST ${url}`);

    const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(docParamerters),
        headers: { 'Content-Type': 'application/json', ...authenticationHeader() },
        agent
    }).catch(err => {
        throw new Error(`startDocCapture failed: ${formatFetchError(err)}`);
    });
    if (res.status !== 200) {
        throw createResponseError(res);
    }
    return res.json();
}

/**
 * Get supported evidence from GIPS configuration
 * response 200
 * POST {{url}}/v1/supported-evidence/countries
 */
async function getSupportedEvidences(country) {
    let url = `${config.GIPS_URL}/v1/supported-evidence/countries`;
    if (country) {
        url += '/' + country;
    }
    logger.debug(`getSupportedEvidences: GET ${url}`);

    const res = await fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent
    }).catch(err => {
        throw new Error(`getSupportedEvidences failed: ${formatFetchError(err)}`);
    });
    if (res.status !== 200) {
        throw createResponseError(res);
    }
    return res.json();
}

/**
 * Initialize the docSession from GIPS by creating identity and session
 */
async function initDocSession(countryCode, docType) {
    logger.debug('initDocSession');

    try {
        const identity = await createIdentity();
        const gipsCaptureSession = await startDocCapture(identity.id, countryCode, docType);
        if (!gipsCaptureSession || !Array.isArray(gipsCaptureSession.sidesToCapture)) {
            const errMessage = 'live-capture-session request returned null response or response without sidesToCapture array';
            logger.error(errMessage);
            throw new Error(errMessage);
        }

        const res = {};
        res.docSideRules = [];
        res.id = gipsCaptureSession.sessionId;
        res.identity = identity.id;
        if (gipsCaptureSession.sidesToCapture.includes(FRONT)) {
            res.docSideRules.push(frontRule);
        }
        if (gipsCaptureSession.sidesToCapture.includes(BACK)) {
            res.docSideRules.push(backRule);
        }

        // get document format when country was defined, in the future the format should be sent by GIPS...
        if (countryCode) {
            const countries = await getSupportedEvidences(countryCode);
            const document = countries.documents.filter(c => c.documentType === docType);
            res.docFormat = document[0].format;
        }

        return res;
    } catch (err) {
        logger.error('initDocSession failed');
        throw err;
    }
}

/**
 * Get global status from GIPS transaction
 * GET {{url}}/v1/identities/{{identityId}}?detailed=true
 */
async function getStatus(identityId) {
    const url = `${config.GIPS_URL}/v1/identities/${identityId}?detailed=true`;
    logger.debug(`getStatus: GET ${url}`);

    const res = await fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent
    }).catch(err => {
        throw new Error(`getStatus failed: ${formatFetchError(err)}`);
    });
    if (res.status !== 200) {
        throw createResponseError(res);
    }
    return res.json();
}

/**
 * Get image from document capture from evidenceId
 * GET {{url}}/v1/identities/{{identityId}}//id-documents//{{evidenceId}}/capture
 */
async function getBestImage(identityId, evidenceId) {
    const url = `${config.GIPS_URL}/v1/identities/${identityId}/id-documents/${evidenceId}/capture`;
    logger.debug(`getBestImage: GET ${url}`);

    const res = await fetch(url, {
        method: 'GET',
        headers: authenticationHeader(),
        agent
    }).catch(err => {
        throw new Error(`getBestImage failed: ${formatFetchError(err)}`);
    });
    if (res.status !== 200) {
        throw createResponseError(res);
    }
    const body = await res.buffer();
    const data = String(body);
    const boundary = data.split('\r')[0];
    const parts = multipart.Parse(body, boundary.replace('--', ''));
    const images = [];
    if (parts && parts.length) {
        for (const item of parts) {
            images.push({ name: item.name, data: item.data && item.data.toString('base64') });
        }
    }
    return images;
}

async function getCountryDocTypes(countryCode) {
    logger.debug('getCountryDocTypes');
    try {
        const countries = await getSupportedEvidences(countryCode);
        // [{"code":"FRA","docTypes":["PASSPORT","IDENTITY_CARD","DRIVING_LICENSE","RESIDENT_CARD"]},{"code":"USA","docTypes":["PASSPORT","DRIVING_LICENSE"]},{"code":"AFG"
        const res = [];
        countries.forEach((country) => {
            const element = {};
            element.code = country.iso3CountryCode;
            const acceptedTypes = [];
            country.documents.filter(c => c.liveVideoCaptureSupported).forEach((document) => {
                acceptedTypes.push(document.documentType);
            });
            if (acceptedTypes.length > 0) {
                element.docTypes = acceptedTypes;
                res.push(element);
            }
        });
        // In additionnal to existing country, we add an empty country allowing the UX to process a generic docType capture
        res.push({
            code: '',
            docTypes: [
                'IDENTITY_CARD',
                'RESIDENT_CARD',
                'PASSPORT',
                'DRIVING_LICENSE'
            ]
        });
        return res;
    } catch (err) {
        logger.error('getCountryDocTypes failed');
        throw err;
    }
}

async function getDocCaptureResult(gipsStatus, identityId) {
    logger.debug('getDocCaptureResult');
    try {
        let lastDocument = null;
        let bestImage = null;
        let idDocumentData = null;
        let evidenceId = null;
        let personalAttributes = null;

        if (gipsStatus.idDocuments && gipsStatus.idDocuments.length) {
            lastDocument = gipsStatus.idDocuments[gipsStatus.idDocuments.length - 1];
            bestImage = Buffer.from(await getBestImage(identityId, lastDocument.evidenceId)).toString('base64');
            idDocumentData = lastDocument.idDocumentData;
            evidenceId = lastDocument.evidenceId;
            personalAttributes = idDocumentData.personalAttributes;
        }

        const finalResult = {
            evidenceId,
            timeout: false,
            identityId,
            docImage: bestImage,
            docCorners: [],
            ...(idDocumentData && {
                ocr: {
                    ...(personalAttributes
                        ? {
                            identity: {
                                gender: personalAttributes.gender ? personalAttributes.gender.value : '',
                                givenNames: personalAttributes.givenNames && personalAttributes.givenNames[0] ? [personalAttributes.givenNames[0].value] : '',
                                surname: personalAttributes.surname ? personalAttributes.surname.value : '',
                                dateOfBirth: personalAttributes.dateOfBirth ? personalAttributes.dateOfBirth.value : ''
                            }
                        }
                        : {
                            documentInfo: {
                                documentNumber: idDocumentData.idDocumentNumber,
                                issuingCountry: idDocumentData.issuingCountry
                            }
                        })
                },
                done: true
            })
        };

        return finalResult;
    } catch (err) {
        logger.error('getDocCaptureResult failed');
        throw err;
    }
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

function formatFetchError(err) {
    return `${err}${err.code ? ', code: ' + err.code : ''}`;
}

function createResponseError(res) {
    const { status, statusText, url } = res;
    const err = new Error(`GIPS status: ${status} ${statusText}, url: ${url}`);
    Error.captureStackTrace(err, createResponseError);
    return Object.assign(err, { status, statusText, url });
}
