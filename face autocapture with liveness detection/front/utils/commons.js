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

/**
 * querySelector
 * @param selectorId
 * @return {any}
 */
exports.$ = function (selectorId) {
  return document.querySelector(selectorId);
};

/**
 * querySelectorAll
 * @param selectorId
 * @return {NodeListOf<HTMLElementTagNameMap[*]>}
 */
exports.$$ = function (selectorId) {
  return document.querySelectorAll(selectorId);
};

/**
 * normalize accent characters, ex: é => e , î => i ...etc
 * @param str
 * @return {string}
 */
exports.getNormalizedString = (str) => {
  return str && str.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
};

exports.getCapabilities = async function (basePath, healthPath) {

  return new Promise(function (resolve, reject) {
    console.log(' >> get monitoring', healthPath);

    const xhttp = new window.XMLHttpRequest();
    xhttp.open('GET', basePath + healthPath, true);
    xhttp.setRequestHeader('Content-type', 'application/json');

    xhttp.responseType = 'json';
    xhttp.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        console.log('getMonitoring ok', xhttp.response);
        resolve(xhttp.response)
      } else {
        console.error('getMonitoring failed');
        reject('getMonitoring failed');
      }

    };
    xhttp.onerror = function () {
      console.log('Error ' + httpError.status + '  ' + httpError.code);
      reject(httpError);

    };
    xhttp.send()
  })
};

/**
 * init a liveness session
 * @return sessionId
 */
exports.initLivenessSession = async function (basePath, sessionId = '', identityId = '') {
  console.log('init liveness session');
  return new Promise(((resolve, reject) => {
    const xhttp = new window.XMLHttpRequest();
    let path = `${basePath}/init-liveness-session/${sessionId}`;
    if (identityId && identityId != '') {
      path = `${path}?identityId=${identityId}`;
    }
    xhttp.open('GET', path, true);
    xhttp.responseType = 'json';
    xhttp.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        resolve(xhttp.response);
      } else {
        console.error('initLivenessSession failed');
        reject();
      }
    };
    xhttp.onerror = function () {
      reject();
    };
    xhttp.send();
  }));
}


/**
 * retrieve the complete GIPS/IPV status
 * @param sessionId
 * @param maxAttempts
 * @param interval
 * @return {isLivenessSucceeded, message}
 */
exports.getGipsStatus = async function (basePath, identityId) {
  return new Promise(((resolve, reject) => {
    const xhttp = new window.XMLHttpRequest();
    xhttp.open('GET', `${basePath}/gips-status/${identityId}`, true);
    xhttp.setRequestHeader('Content-type', 'application/json');
    xhttp.responseType = 'json';
    xhttp.onload = () => {
      if (xhttp.status) {
        if (xhttp.status === 200) {
          resolve(xhttp.response);
        } else {
          console.error('getGipsStatus failed...');
          reject();
        }
      }
    };

    xhttp.onerror = function (e) {
      reject();
    };
    xhttp.send();
  }));
}

/**
 * retrieve the liveness challenge result from backend (via polling)
 * @param sessionId
 * @param maxAttempts
 * @param interval
 * @return {isLivenessSucceeded, message}
 */
exports.getLivenessChallengeResult = async function (basePath, enablePolling, sessionId, maxAttempts = 10, interval = 1000) {
  return new Promise(((resolve, reject) => {
    const xhttp = new window.XMLHttpRequest();
    xhttp.open('GET', `${basePath}/liveness-challenge-result/${sessionId}/?polling=${enablePolling}`, true);
    xhttp.setRequestHeader('Content-type', 'application/json');
    xhttp.responseType = 'json';
    xhttp.onload = () => {
      if (xhttp.status) {
        if (xhttp.status === 200) {
          resolve(xhttp.response);
        } else if (maxAttempts) { // >> polling
          console.log('getLivenessChallengeResult retry ...', maxAttempts);
          return new Promise((r) => setTimeout(r, interval))
            .then(() => {
              resolve(this.getLivenessChallengeResult(basePath, enablePolling, sessionId, maxAttempts - 1));
            });
        } else {
          console.error('getLivenessChallengeResult failed, max retries reached');
          reject();
        }
      }
    };

    xhttp.onerror = function (e) {
      reject();
    };
    xhttp.send();
  }));
}

/**
 * send another image to match with video best image
 * @param selfieImage
 * @return {Promise<void>}
 */
exports.pushFaceAndDoMatch = async function (basePath, sessionId, bestImageId, selfieImage) {
  try {
    const face2 = await this.createFace(basePath, sessionId, selfieImage);
    const matches = await this.getMatches(basePath, sessionId, bestImageId, face2.faceId);
    document.querySelectorAll('.step').forEach((step) => step.classList.add('d-none'));
    if (matches.matching === 'ok') {
      document.querySelector('#step-selfie-ok .description').innerHTML = __('Matching succeeded <br> score: ') + matches.score;
      document.querySelector('#step-selfie-ok').classList.remove('d-none');
    } else {
      document.querySelector('#step-selfie-ko').classList.remove('d-none');
      if (matches.score) {
        document.querySelector('#step-selfie-ko .description').innerHTML = __('Matching failed <br> score: ') + matches.score || '';
      }
    }
    console.log(matches);
  } catch (e) {
    console.error(e);
    document.querySelectorAll('.step').forEach((step) => step.classList.add('d-none'));
    document.querySelector('#step-selfie-ko').classList.remove('d-none');
    document.querySelector('#step-selfie-ko .description').innerHTML = 'Matching failed';
  }
}

/**
 * associate a new face to session
 * @param sessionId session id
 * @param imageFile face image
 * @param faceInfo face information
 * @return {Promise<void>}
 */
exports.createFace = async function (basePath, sessionId, imageFile, faceInfo = '{"imageType" : "SELFIE","friendlyName" : "selfie", "imageRotationEnabled":"true"}') {
  return new Promise(((resolve, reject) => {
    const formData = new window.FormData();
    const xhttp = new window.XMLHttpRequest();
    formData.append('image', imageFile);
    formData.append('face', new window.Blob([faceInfo], {type: 'application/json'}));
    xhttp.open('POST', `${basePath}/bio-session/${sessionId}/faces`, true);
    xhttp.responseType = 'json';
    xhttp.onload = function () {
      document.getElementById('loading').classList.add('d-none');
      if (this.status === 200) {
        resolve(xhttp.response);
      } else {
        console.error('createFace failed');
        reject();
      }
    };
    xhttp.onerror = function () {
      console.error('createFace failed');
      reject(xhttp);
    };
    xhttp.send(formData);
    document.getElementById('loading').classList.remove('d-none');
  }));
}

/**
 * retrieve face for a given session
 * @param sessionId
 * @param faceId
 */
exports.getFaceImage = async function (basePath, sessionId, faceId) {
  return new Promise(((resolve, reject) => {
    const xhttp = new window.XMLHttpRequest();
    xhttp.open('GET', `${basePath}/bio-session/${sessionId}/faces/${faceId}/image`, true);
    xhttp.responseType = 'blob';
    xhttp.onload = function () {
      if (this.status === 200) {
        resolve(xhttp.response);
      } else {
        console.error('createFace failed');
        reject();
      }
    };
    xhttp.onerror = function () {
      console.error('createFace failed');
      reject(xhttp);
    };
    xhttp.send();
  }));
}

/**
 * get matches result for a given session and two faces
 * @param sessionId
 * @param referenceFaceId
 * @param candidateFaceId
 */
exports.getMatches = async function (basePath, sessionId, referenceFaceId, candidateFaceId) {
  return new Promise(((resolve, reject) => {
    const xhttp = new window.XMLHttpRequest();
    xhttp.open('GET', `${basePath}/bio-session/${sessionId}/faces/${referenceFaceId}/matches/${candidateFaceId}`, true);
    xhttp.responseType = 'json';
    xhttp.onload = function () {
      if (this.status === 200) {
        resolve(xhttp.response);
      } else {
        console.error('createFace failed');
        reject();
      }
    };
    xhttp.onerror = function () {
      console.error('createFace failed');
      reject(xhttp);
    };
    xhttp.send();
  }));
}