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
const debug = require('debug')('front:app:httpEndpoints');
const webDocApi = require('./webdoc-api');

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
      const sesssion = req.body;
      debug('Init document capture session with', sesssion);

      if (sesssion.countryCode === '') {
        sesssion.rules = findRulesByCountryAndType(sesssion.countryCode, sesssion.docType);
      }

      const docCaptureSession = await webDocApi.initDocSession(sesssion.countryCode, sesssion.docType, sesssion.rules);

      documentCaptureResults[docCaptureSession.id] = docCaptureSession;
      debug('init-document-session result ', docCaptureSession);
      setTimeout(() => {
        delete documentCaptureResults[docCaptureSession.id];
      }, parseInt(config.DOC_CAPTURE_SESSION_TTL) * 1000);

      res.json({ sessionId: docCaptureSession.id, rules: docCaptureSession.docSideRules, format: docCaptureSession.docFormat });
    } catch (e) {
      debug(req.params.country, 'init session and get rules failed', e);
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
        debug(`asking for document type of:  ${country}`);
      } else {
        debug('asking all countries & document types');
      }

      const countryDocTypes = await webDocApi.getCountryDocTypes(country);

      debug('Got country & document type from docserver: ', countryDocTypes);

      const rulesAscountryDocTypes = findDocTypesByCountry();

      debug('Got SP configured document rules: ', rulesAscountryDocTypes);

      const result = countryDocTypes.concat(rulesAscountryDocTypes);

      res.json(result);
    } catch (e) {
      debug(req.params.country, 'Getting country & document type failed', e);
      res.status(e.status ? e.status : 500).send();
    }
  });

  /**
     * Expose api to retrieve document capture result
     *
     */
  app.get(config.BASE_PATH + '/doc-capture-result/:sessionId/:docType/:docSide', async (req, res) => {
    try {
      // retrieve sessionId
      let finalResult = {};
      const sessionId = req.params.sessionId;
      const docSide = req.params.docSide;
      const polling = req.query.polling && req.query.polling === 'true';

      if (!documentCaptureResults[sessionId]) {
        res.status(404).send({ error: 'Session not found or session timeout reached' });
      } else if (!config.DISABLE_CALLBACK && !documentCaptureResults[sessionId].callback) {
        debug(sessionId, '> Callback not yet receive for session: ', sessionId);
        res.status(404).send({ error: 'Result not available' });
      } else {
        debug(sessionId, '> retrieve doc-capture-result result', { polling });
        if (!sessionId) {
          const error = { error: 'Missing mandatory param sessionId' };
          debug('< get doc-capture-result failed', error);
          res.status(400).json(error);
        } else {
          const docCaptureSession = await webDocApi.getDocCaptureResult(sessionId, documentCaptureResults[sessionId].captureId);
          documentCaptureResults[sessionId] = docCaptureSession;
          finalResult = getDataToDisplay(docCaptureSession, docSide);
          debug(sessionId, '< Got doc capture result', removePIIDatat(finalResult));

          res.json(finalResult);
        }
      }
    } catch (e) {
      debug(req.params.docSide, 'retrieve doc-capture-result result', e);
      res.status(e.status ? e.status : 500).send();
    }
  });

  //
  // Receive challenge result from docserver
  //
  app.post(config.BASE_PATH + config.DOC_CAPTURE_CALLBACK_URL, async (req, res) => {
    debug('<<  ' + config.DOC_CAPTURE_CALLBACK_URL, req.body);
    const sessionId = req.body ? req.body.sessionId : undefined;
    const captureId = req.body ? req.body.captureId : undefined;
    if (!sessionId) {
      const err = { error: 'Missing mandatory param sessionId' };
      debug('Failed to request results with error:', err);
      res.status(400).send(err);
    } else {
      debug('<< Document capture result is available for sessionID: ', sessionId);
      documentCaptureResults[sessionId] = { callback: true, captureId: captureId };

      res.status(204).send();
    }
  });

  debug('Init HTTP Endpoints done ..');
};

/**
 * Return expected result format to ui
 * @param documentResult
 * @param documentSide
 */
function getDataToDisplay (documentResult, documentSide) {
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

  finalResult.timeout = (currentSideResult.status === 'TIMEOUT');
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

function removePIIDatat (document) {
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
