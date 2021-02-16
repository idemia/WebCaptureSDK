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
const _ = require('lodash');
const config = require('./config');
const debug = require('debug')('front:app:api');
const serverErrorMessage = 'Error when requesting docserver: ';

module.exports = {
  getCountryDocTypes: getCountryDocTypes,
  initDocSession: initDocSession,
  getDocCaptureResult: getDocCaptureResult

};

/**
 * Create document capture session on server
 * And retrieve session Id plus document capture rule for specific country code
 * @param token
 * @param countryCode
 * @returns {*}
 */
function initDocSession (countryCode, docType, rules) {
  const contentBody = {
    ttlSeconds: config.DOC_CAPTURE_SESSION_TTL,
    countryCode: countryCode
  };

  if (countryCode) { // TODO validate countryCode
    contentBody.countryCode = countryCode;
  }

  if (docType) { // TODO validate doctype
    contentBody.docType = docType;
  }

  if (rules) { // TODO validate rules
    contentBody.docSideRules = rules;
    contentBody.countryCode = undefined;
    contentBody.docType = undefined;
  }

  if (!config.DISABLE_CALLBACK) {
    contentBody.callbackURL = config.SERVER_PUBLIC_ADDRESS + config.BASE_PATH + config.DOC_CAPTURE_CALLBACK_URL;
  }
  const url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v1/document-sessions';
  debug('2: Request ', url, 'Parameters:', JSON.stringify(contentBody, null, 2));
  return fetch(url, {
    method: 'POST',
    // if callback is disabled, don't pass the callbackURL to docserver
    body: JSON.stringify(contentBody),
    headers: _.merge({ 'content-type': 'application/json' }, authenticationHeader())
  }).then(function (res) {
    if (res.status !== 200) {
      return Promise.reject(res);
    } else {
      return res.json();
    }
  }).catch(function (error) {
    debug(serverErrorMessage, error);
    return Promise.reject(error.message);
  });
}

/**
 * Get doc capture result from doc-docserver
 * @param token
 * @param sessionId
 * @returns {*}
 */
function getDocCaptureResult (sessionId, captureId) {
  let url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v1/document-sessions/' + sessionId + '/captures';

  if (captureId) {
    url = url + '/' + captureId;
  }
  debug('3: Request ', url);

  return fetch(url, {
    method: 'GET',
    headers: authenticationHeader()
  }).then(function (res) {
    if (res.status !== 200) {
      return Promise.reject(res);
    }
    return res.json();
  }).catch(function (error) {
    debug(serverErrorMessage, error);
    return Promise.reject(error.message);
  });
}

function getCountryDocTypes (countryCode) {
  let url = config.DOCSERVER_VIDEO_URL + config.DOC_SERVER_BASE_PATH + '/v1/countries-doc-types';
  if (countryCode) {
    url = url + '/' + countryCode;
  }
  debug('1: Request ', url);
  return fetch(url, {
    method: 'GET',
    headers: authenticationHeader()
  }).then(function (res) {
    if (res.status !== 200) {
      return Promise.reject(res);
    }
    return res.json();
  }).catch(function (error) {
    debug(serverErrorMessage + error.message);
    return Promise.reject(error.message);
  });
}

function authenticationHeader () {
  const headers = {};
  headers.apikey = config.WEB_SDK_LIVENESS_ID_DOC;
  return headers;
}
