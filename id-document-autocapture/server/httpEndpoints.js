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
 * Backend endpoint (used by the front-end to reach WebDocserver). This file can be used by integrator as it is.
 */
const config = require('./config');
const logger = require('./config/demoLogConf').getLogger(__filename);
const webDocApi = require('./webdoc-api');
const gipsApi = require('./gips-api');

const { findDocTypesByCountry, findRulesByCountryAndType } = require('./config/rules');

let token; const documentCaptureResults = {}; // TODO use some distributed cache

exports = module.exports;

exports.getToken = () => {
    return token;
};
exports.initHttpEndpoints = (app) => {
    /**
     * Exposes api to create docserver session by country + document type or rules
     * Retrieves document capture rules to apply to selected country + document type
     */
    app.post(config.BASE_PATH + '/init-document-session', async (req, res) => {
        try {
            const session = req.body;
            logger.info('Document session initialization with: ', { session });

            if (session.countryCode === '') {
                session.rules = findRulesByCountryAndType(session.countryCode, session.docType);
            }

            let docCaptureSession;
            let response;
            if (config.IDPROOFING) {
                docCaptureSession = await gipsApi.initDocSession(session.countryCode, session.docType, session.rules);
                response = { sessionId: docCaptureSession.id, identity: docCaptureSession.identity, rules: docCaptureSession.docSideRules, format: docCaptureSession.docFormat };
            } else {
                docCaptureSession = await webDocApi.initDocSession(session.countryCode, session.docType, session.rules);
                response = { sessionId: docCaptureSession.id, rules: docCaptureSession.docSideRules, format: docCaptureSession.docFormat };
            }

            documentCaptureResults[docCaptureSession.id] = docCaptureSession;
            logger.info('Document session created: ', { sessionId: docCaptureSession.id, docCaptureSession });
            setTimeout(() => {
                delete documentCaptureResults[docCaptureSession.id];
            }, parseInt(config.DOC_CAPTURE_SESSION_TTL) * 1000);

            res.json(response);
        } catch (e) {
            logger.error('Document session creation and rules retrieval have failed for country %s', req.params.country, { e });
            res.status(e.status ? e.status : 500).send();
        }
    });

    /**
   * Exposes api to retrieve document session
   */
    app.get(config.BASE_PATH + '/document-sessions/:sessionId', async (req, res) => {
        const sessionId = req.params.sessionId;
        logger.info('Retrieve Document session : ', { sessionId });
        if (!sessionId) res.status(400).json({ error: 'missing sessionId in request' });
        try {
            const docCaptureSession = await webDocApi.getDocSession(sessionId);
            documentCaptureResults[docCaptureSession.id] = docCaptureSession;
            logger.info('Document session retrieved: ', { sessionId, docCaptureSession });
            setTimeout(() => {
                delete documentCaptureResults[docCaptureSession.id];
            }, parseInt(config.DOC_CAPTURE_SESSION_TTL) * 1000);
            res.json({
                sessionId: docCaptureSession.id,
                rules: docCaptureSession.docSideRules,
                format: docCaptureSession.docFormat,
                docType: docCaptureSession.docType,
                countryCode: docCaptureSession.countryCode
            });
        } catch (e) {
            logger.error('Retrieve Document session have failed', { sessionId, e });
            res.status(e.status ? e.status : 500).send();
        }
    });

    /**
     * Exposes api to retrieve document capture rules to apply to selected country
     */
    app.get(config.BASE_PATH + '/countries/doc-types', async (req, res) => {
        try {
            const country = req.query.countryCode;
            if (country) {
                logger.info(`Requesting document types supported from issuing country:  ${country}`);
            } else {
                logger.info('Requesting document types supported from all issuing countries');
            }

            let result;
            if (config.IDPROOFING) {
                result = await gipsApi.getCountryDocTypes(country);

                logger.info('Document types and issuing countries supported: ', { result });
            } else {
                const countryDocTypes = await webDocApi.getCountryDocTypes(country);

                logger.info('Document types and issuing countries supported: ', { countryDocTypes });

                const rulesAscountryDocTypes = findDocTypesByCountry();

                logger.info('Document rules supported: ', { rulesAscountryDocTypes });

                result = countryDocTypes.concat(rulesAscountryDocTypes);
            }

            res.json(result);
        } catch (e) {
            logger.info('Getting country & document type failed: %s - ', req.params.country, { e });
            res.status(e.status ? e.status : 500).send();
        }
    });

    /**
     * Expose api to retrieve document capture result
     *
     */
    app.get(config.BASE_PATH + '/doc-capture-result/:sessionId/:docType/:docSide', async (req, res) => {
        let finalResult = {};
        const sessionId = req.params.sessionId;
        const docSide = req.params.docSide;
        const polling = req.query.polling && req.query.polling === 'true';
        try {
            if (!documentCaptureResults[sessionId]) {
                res.status(404).send({ error: 'Session not found or session timeout reached' });
            } if (config.IDPROOFING) {
                const gipsStatus = await gipsApi.getStatus(documentCaptureResults[sessionId].identity);
                const status = gipsStatus.idDocuments[gipsStatus.idDocuments.length - 1].evidenceStatus.status;
                logger.info('GIPS Transaction is on ' + status, { sessionId });
                // GIPS is still on PROCESSING
                if (status === 'PROCESSING') {
                    res.status(404).send({ error: 'Result is not available' });
                    // GIPS returned a result (OK or NOK)
                } else {
                    const docCaptureSession = await gipsApi.getDocCaptureResult(gipsStatus, documentCaptureResults[sessionId].identity);
                    documentCaptureResults[sessionId] = docCaptureSession;
                    // finalResult = getDataToDisplay(docCaptureSession, docSide);
                    logger.info('Document capture result for side=%s: ', req.params.docSide, { sessionId, result: removePIIDatat(docCaptureSession) });
                    res.json(docCaptureSession);
                }
            } else if (!config.DISABLE_CALLBACK && !documentCaptureResults[sessionId].callback) {
                logger.info('Callback is not yet received for session ', { sessionId });
                res.status(404).send({ error: 'Result is not available' });
            } else {
                logger.info('Retrieve document capture result (pooling): ', { sessionId, polling: polling });
                if (!sessionId) {
                    const error = { error: 'Missing mandatory param sessionId' };
                    logger.error('Document capture retrieval result has failed', { error });
                    res.status(400).json(error);
                } else {
                    const docCaptureSession = await webDocApi.getDocCaptureResult(sessionId, documentCaptureResults[sessionId].captureId);
                    documentCaptureResults[sessionId] = docCaptureSession;
                    finalResult = getDataToDisplay(docCaptureSession, docSide);
                    logger.info('Document capture result for side=%s: ', req.params.docSide, { sessionId, result: removePIIDatat(finalResult) });
                    res.json(finalResult);
                }
            }
        } catch (e) {
            logger.error('Document capture result for side ' + req.params.docSide + ' and sessionId ' + sessionId, e);
            res.status(e.status ? e.status : 500).send();
        }
    });

    app.get(config.BASE_PATH + '/gips-best-image/:identityId/:evidenceId', async (req, res) => {
        const identityId = req.params.identityId;
        const evidenceId = req.params.evidenceId;
        try {
            const bestImage = await gipsApi.getBestImage(identityId, evidenceId);
            // res.status(200).send(Buffer.from(bestImage).toString('base64'));
            res.status(200).send(bestImage);
        } catch (e) {
            logger.error('getBestImage error, ', { e });
            res.status(e.status ? e.status : 500).send();
        }
    });

    app.get(config.BASE_PATH + '/gips-transaction/:identityId/', async (req, res) => {
        const identityId = req.params.identityId;
        try {
            const gipsStatus = await gipsApi.getStatus(identityId);
            res.json(gipsStatus);
        } catch (e) {
            logger.error('getStatus error, ', { e });
            res.status(e.status ? e.status : 500).send();
        }
    });

    //
    // Receive challenge result from docserver
    //
    app.post(config.BASE_PATH + config.DOC_CAPTURE_CALLBACK_URL, async (req, res) => {
        const sessionId = req.body ? req.body.sessionId : undefined;
        const captureId = req.body ? req.body.captureId : undefined;
        logger.info('Callback reception: ' + config.DOC_CAPTURE_CALLBACK_URL, { sessionId, body: req.body });
        if (!sessionId) {
            const err = { error: 'Missing mandatory param sessionId' };
            logger.error('A failure occurred during callback reception:', { err });
            res.status(400).send(err);
        } else {
            logger.info('Document capture result is available ', { sessionId });
            documentCaptureResults[sessionId] = { callback: true, captureId: captureId };

            res.status(204).send();
        }
    });

    logger.debug('Init HTTP Endpoints done ..');
};

/**
 * Return expected result format to ui
 * @param documentResult
 * @param documentSide
 */
function getDataToDisplay(documentResult, documentSide) {
    const finalResult = {};
    let currentSideResult;
    if (Array.isArray(documentResult)) {
        currentSideResult = documentResult.pop();
        while (currentSideResult.side.name.toUpperCase() !== documentSide.toUpperCase()) {
            currentSideResult = documentResult.pop();
        }
    } else {
        currentSideResult = documentResult;
    }

    // DONE = everything was success, failed or timeout or any = failed
    finalResult.done = (currentSideResult.status === 'DONE');
    finalResult.diagnostic = currentSideResult.diagnostic;
    finalResult.docImage = currentSideResult.image;
    finalResult.docCorners = currentSideResult.corners;
    // ocr mrz ...
    currentSideResult.rules.forEach(
        rule => {
            if (rule.name === 'OCR') {
                if (finalResult.ocr) {
                    Object.assign(finalResult.ocr, rule.result);
                } else {
                    finalResult.ocr = rule.result;
                }
            }
            if (rule.name === 'MRZ' && rule.result) {
                if (!finalResult.ocr) {
                    finalResult.ocr = {};
                }
                Object.assign(finalResult.ocr, { mrz: rule.result });
            }
            if (rule.name === 'PDF417') {
                finalResult.pdf417 = rule.result;
            }
        }
    );

    return finalResult;
}

function removePIIDatat(document) {
    const documentToLog = Object.assign({}, document);
    if (document.docImage) {
        delete documentToLog.docImage;
    }
    if (document.ocr) {
        if (document.ocr.mrz) {
            documentToLog.mrz = 'OK';
        }
        documentToLog.ocr = 'OK';
    }
    if (documentToLog.pdf417) {
        documentToLog.pdf417 = 'OK';
    }

    return documentToLog;
}
