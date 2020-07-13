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

// this file is the main program that uses video server api for passive liveness

const lottie = require('lottie-web/build/player/lottie_light.js');
const commonutils = require('../../utils/commons');
// define html elements
const videoOutput = document.querySelector('#user-video');
const monitoring = document.querySelectorAll('.monitoring');

const stopCaptureButton = document.querySelector('#stop-capture');

const switchCameraButton = document.querySelector('#switch-camera');
const headStartPositionOutline = document.querySelector('#center-head-animation');

const moveCloserMsg = document.querySelector('#move-closer-animation');

const movingPhoneMsg = document.querySelector('#move-phone-animation');
const phoneNotVerticalMsg = document.querySelector('#phone-not-vertical-animation');
const loadingChallenge = document.querySelector('#loading-challenge');
const dontMoveAnimation = document.querySelector('#dont-move-animation');
const illuminationOverlay = document.querySelector('#illumination-overlay');
const bestImgElement = document.querySelector('#step-liveness-ok .best-image');
const selfieInput = document.querySelector('#selfieInput');
const tooBrightMsg = document.querySelector('#darkness');
const tooDarkMsg = document.querySelector('#brightness');
const videoMsgOverlays = document.querySelectorAll('#step-liveness .video-overlay');

let timeoutCheckConnectivity; // settimeout used to stop if network event received
let connectivityOK = false;
let client; // let start & stop face capture
let videoStream; // user video camera stream
let videoMediaDevices; // list of user camera devices
let sessionId; // current sessionId
let bestImageId; // best image captured from user video stream
let bestImageURL; // best image url (in memory window.URL.createObjectURL)
let currentDeviceIndex; // index of the camera currently used in face capture
let cameraPermissionAlreadyAsked;
let identityId;

const urlParams = new URLSearchParams(window.location.search); // let you extract params from url
const isMatchingEnabled = urlParams.get('enableMatching') === 'true';
const isVideoTutEnabled = urlParams.get('videoTutorial') === 'true';
const isSkipTutorial = urlParams.get('skipTutorial') === 'true';
const recordLabel = urlParams.get('videoBackup');


const sessionIdParam = urlParams.get('sessionId');
const identityIdParam = urlParams.get('identityId');

const basePath = BASE_PATH;
const videoUrlWithBasePath = VIDEO_URL + VIDEO_BASE_PATH;
const videoBasePath = VIDEO_BASE_PATH;
const videoUrl = VIDEO_URL;
const enablePolling = !DISABLE_CALLBACK;
const useProxy = USE_INTERNAL_PROXY;
const healthPath = VIDEO_HEALTH_PATH;

/**
 * 1- init liveness session (from backend)
 * 2- init the communication with the server via webrtc & socket
 * 3- get liveness result (from backend)
 * 4- [Optional] ask the end user to push his reference image (post to backend)
 * 5- [Optional] get the matching result between the best image from webRTC and the reference image
 */

let monitorBaseUrl = videoUrlWithBasePath; // default is video-server url
if(useProxy) {
    monitorBaseUrl = basePath; // if we use proxy, we need to reach demo-server url
}

commonutils.getMonitoring(monitorBaseUrl, healthPath).then(
  (response) => {
    if (response && response.version) {
      monitoring.forEach((element) => element.innerHTML = `${response.version} - ${new Date(response.since).toLocaleString()}`);
    }
  },
).catch((e) => {
  stopVideoCaptureAndProcessResult(false, 'Service unavailable', '', '');
});


async function init(options = {}) {
  client = undefined;
  initLivenessDesign();
  // get user camera video (front camera is default)
  videoStream = await BioserverVideo.getDeviceStream({ video: { width: 1280, height: 720, deviceId: options.deviceId } })
    .catch((e) => {
      let msg = __('Failed to get camera device stream');
      let extendedMsg;
      if (e.name && e.name.indexOf('NotAllowed') > -1) {
        msg = __('You denied camera permissions, either by accident or on purpose.');
        extendedMsg = __('In order to use this demo, you need to enable camera permissions in your browser settings or in your operating system settings.');
      }
      stopVideoCaptureAndProcessResult(false, msg, '', extendedMsg);
    });
  if (!videoStream) return;
  // display the video stream
  videoOutput.srcObject = videoStream;

  // request a sessionId from backend (if we are switching camera we use the same session)
  if (!sessionId || !options.switchCamera) {
    const session = await initLivenessSession(sessionIdParam || '', identityIdParam || '')
      .catch(() => {
        sessionId = false;
        stopVideoCaptureAndProcessResult(false, __('Failed to initialize session'));
      });
    sessionId = session.sessionId;
    identityId = session.identityId;
  }
  if (!sessionId) return;
  // initialize the face capture client with callbacks
  let challengeInProgress = false;
  const faceCaptureOptions = {
    bioSessionId: sessionId,
    identityId,
    showChallengeInstruction: (challengeInstruction) => {
      if (challengeInstruction === 'TRACKER_CHALLENGE_PENDING') {
        // pending ==> display waiting msg meanwhile the showChallengeResult callback is called with result
        challengeInProgress = false;
        videoMsgOverlays.forEach((overlay) => overlay.classList.add('d-none-fadeout'));
        loadingChallenge.classList.remove('d-none-fadeout');
      } else { // challengeInstruction == TRACKER_CHALLENGE_DON_T_MOVE
        challengeInProgress = true;
        switchCameraButton.classList.add('d-none'); // once the challenge started user can not switch camera
      }
    },
    showChallengeResult: async () => {
      console.log('Liveness Challenge done > requesting result ...');
      const result = await getLivenessChallengeResult(sessionId)
        .catch(() => stopVideoCaptureAndProcessResult(false, __('Failed to retrieve liveness results')));
      loadingChallenge.classList.add('d-none-fadeout');
      if (result) stopVideoCaptureAndProcessResult(result.isLivenessSucceeded, result.message, result.bestImageId);
      if (client) client.disconnect();
    },
    trackingFn: (trackingInfo) => {
      displayInstructionsToUser(trackingInfo, challengeInProgress);
      if (trackingInfo.colorDisplay) {
        displayIlluminationOverlay(trackingInfo.colorDisplay, 0);
      }
    },
    errorFn: (error) => {
      console.log('got error', error);
      challengeInProgress = false;
      stopVideoCaptureAndProcessResult(false, __('Sorry, there was an issue.'));
      if (client) client.disconnect();
    },
  };
  if(useProxy) {
    faceCaptureOptions.wspath = basePath + '/wsocket';
    faceCaptureOptions.rtcConfigurationPath = basePath+'/rtcConfigurationService?bioSessionId=' + encodeURIComponent(sessionId);
  } else {
    faceCaptureOptions.wspath = videoBasePath + '/engine.io';
    faceCaptureOptions.bioserverVideoUrl = videoUrl;
    faceCaptureOptions.rtcConfigurationPath = videoUrlWithBasePath+'/coturnService?bioSessionId=' + encodeURIComponent(sessionId);
  }
  client = await BioserverVideo.initFaceCaptureClient(faceCaptureOptions);
}

stopCaptureButton.addEventListener('click', async () => {
  resetLivenessDesign();
  if (client) client.disconnect();
});

switchCameraButton.addEventListener('click', async () => {
  if (client) {
    try {
      switchCameraButton.classList.add('d-none');
      // retrieve user cameras
      if (!videoMediaDevices) {
        const mediaDevices = await BioserverVideo.initMediaDevices();
        videoMediaDevices = mediaDevices.videoDevices.map((d) => d.deviceId);
      }
      if (!videoMediaDevices || videoMediaDevices.length === 1) { // << we do not switch camera if only 1 camera found
        switchCameraButton.classList.remove('d-none');
        return;
      }
      client.disconnect();
      resetLivenessDesign();
      console.log('video devices: ', { videoMediaDevices });
      const videoTrack = videoStream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      console.log('video track settings: ', { settings });
      let currentDeviceId = settings.deviceId; // not all browsers support this
      const index = currentDeviceId ? videoMediaDevices.indexOf(currentDeviceId) : currentDeviceIndex ? currentDeviceIndex + 1 : 0;
      if (videoMediaDevices.length > 1) {
        if (index < videoMediaDevices.length - 1) {
          currentDeviceIndex = index + 1;
        } else {
          currentDeviceIndex = 0;
        }
      }
      // get next camera id (loop over user cameras)
      currentDeviceId = videoMediaDevices[currentDeviceIndex];
      await init({ deviceId: currentDeviceId, switchCamera: true });
      if (client) {
        setTimeout(() => {
          client.start(videoStream, recordLabel);
          switchCameraButton.classList.remove('d-none');
        }, 2000);
      }
    } catch (e) {
      stopVideoCaptureAndProcessResult(false, __('Failed to switch camera'));
    }
  }
});


// when next button is clicked go to targeted step
document.querySelectorAll('*[data-target]')
  .forEach((btn) => btn.addEventListener('click', async () => {
    const targetStepId = btn.getAttribute('data-target');
    await processStep(targetStepId, btn.hasAttribute('data-delay') && (btn.getAttribute('data-delay') || 2000))
      .catch(() => stopVideoCaptureAndProcessResult(false));
  }));

async function processStep(targetStepId, displayWithDelay) {
  if (targetStepId === '#application-version') {
    document.querySelector(targetStepId).classList.remove('d-none');

    setTimeout(() => {
      document.querySelector(targetStepId).classList.add('d-none');
    }, 2000);
  } else {
    // d-none all steps

    document.querySelectorAll('.step').forEach((row) => row.classList.add('d-none'));
    if (targetStepId === '#step-tutorial') {
      // start playing tutorial video (from the beginning)

    } else if (targetStepId === '#connectivity-check') { // << if client clicks on start capture or start training
      if (!connectivityOK) { // bypass this waiting time if we are still here 5 seconds
        document.querySelector('#connectivity-check').classList.remove('d-none');
        timeoutCheckConnectivity = setTimeout(() => {
          processStep(targetStepId, displayWithDelay)
        }, 1000); //call this method until we got the results from the network connectivity
      } else {
        targetStepId = '#step-liveness'; // connectivity check done/failed, move to the next step
      }
    }

    if (targetStepId === '#step-liveness') { // << if client clicks on start capture or start training
      if (!cameraPermissionAlreadyAsked) { // << display the camera access permission step the first time only
        cameraPermissionAlreadyAsked = true;
        targetStepId = '#step-access-permission';
        // when client accepts camera permission access > we redirect it to the liveness check
        document.querySelector(`${targetStepId} button`).classList.add('start-capture');
      } else {
        document.querySelector('#step-liveness').classList.remove('d-none');
        document.querySelector('#step-liveness .header').classList.add('d-none');
        await init();
        if (client) {
          setTimeout(() => {
            client.start(videoStream, recordLabel);
            switchCameraButton.classList.remove('d-none');
            document.querySelector('#step-liveness .header').classList.remove('d-none');
          }, 2000);
        } else return; // no client > no process
      }
    }
    const targetStep = document.querySelector(targetStepId);
    targetStep.classList.remove('d-none');
    const targetStepFooter = targetStep.querySelector('.footer');
    if (targetStepFooter) {
      targetStepFooter.classList.add('d-none');
      if (displayWithDelay) {
        // display next button after few seconds
        setTimeout(() => targetStepFooter.classList.remove('d-none'), displayWithDelay);
      } else {
        targetStepFooter.classList.remove('d-none');
      }
    }
  }
}
document.querySelector('#step-liveness .tutorial').addEventListener('click', async () => {
  resetLivenessDesign();
  if (client) {
    client.disconnect();
  }
});
// gif animations are played only once, this will make them play again
document.querySelectorAll('.reset-animations').forEach((btn) => {
  btn.addEventListener('click', () => {
    refreshImgAnimations();
  });
});
function refreshImgAnimations() {
  // reload only gif animations
  document.querySelectorAll('.step > .animation > img').forEach((img) => {
    const gifAnimation = img.src.split('?')[0];
    if (gifAnimation.endsWith('.gif')) img.src = `${gifAnimation}?v=${Math.random()}`;
  });
}
async function stopVideoCaptureAndProcessResult(success, msg, faceId = '', extendedMsg) {
  bestImageId = faceId;
  // we reset the session when we finished the liveness check real session
  resetLivenessDesign();
  document.querySelectorAll('.step').forEach((step) => step.classList.add('d-none'));

  if (success) {
    document.querySelector('#step-liveness-ok').classList.remove('d-none');
    document.querySelectorAll('#step-liveness-ok button').forEach((btn) => btn.classList.add('d-none'));
    const faceImg = await getFaceImage(sessionId, faceId);
    bestImageURL = window.URL.createObjectURL(faceImg);
    bestImgElement.style.backgroundImage = `url(${bestImageURL})`;
    const nextButton = isMatchingEnabled ? 'next-step' : 'reset-step';
    document.querySelector(`#step-liveness-ok button.${nextButton}`).classList.remove('d-none');
  } else if (msg && (msg.indexOf('Timeout') > -1)) {
    sessionStorage.setItem('livenessResult', '1');
    document.querySelector('#step-liveness-timeout').classList.remove('d-none');
    setTimeout(() => {
      document.querySelector('#step-liveness-timeout .footer').classList.remove('d-none');
    }, 2000);
  } else {
    document.querySelector('#step-liveness-ko').classList.remove('d-none');
    if (msg) document.querySelector('#step-liveness-ko .description').textContent = __('Liveness failed');
    const small = document.querySelector('#step-liveness-ko small');
    small.textContent = extendedMsg || '';
  }
}
/**
 * prepare video capture elements
 * @param trainingModeEnabled
 */
function initLivenessDesign(trainingModeEnabled) {
  document.querySelector('header').classList.add('d-none');
  document.querySelector('main').classList.add('darker-bg');
  switchCameraButton.classList.add('d-none');
  videoMsgOverlays.forEach((overlay) => overlay.classList.add('d-none-fadeout'));
  headStartPositionOutline.classList.remove('d-none-fadeout');
}
/**
 * reset video capture elements at the end of the process
 */
function resetLivenessDesign() {
  document.querySelector('header').classList.remove('d-none');
  document.querySelector('main').classList.remove('darker-bg');
  if (bestImageURL) window.URL.revokeObjectURL(bestImageURL); // free memory
  bestImgElement.style.backgroundImage = null;

  switchCameraButton.classList.add('d-none');
  if (headAnimationOn || headAnimationOff) {
    window.clearTimeout(headAnimationOn);
    window.clearTimeout(headAnimationOff);
  }
  lastChallengeIndex = -1;
}
/**
 * display messages to user during capture (eg: move closer, center your face ...)
 * @param trackingInfo face tracking info
 * @param challengeInProgress challenge has started?
 * @param trainingMode training mode enabled ?
 */
let lastChallengeIndex = -1; let headAnimationOn; let headAnimationOff; let userInstructionMsgDisplayed; let
  userInstructionMsgToDisplay;
function displayInstructionsToUser(trackingInfo, challengeInProgress) {
  if (challengeInProgress || userInstructionMsgDisplayed) return;
  if (trackingInfo.phoneNotVertical) { // << user phone not up to face
    videoMsgOverlays.forEach((overlay) => overlay.classList.add('d-none-fadeout'));
    phoneNotVerticalMsg.classList.remove('d-none-fadeout');
    if (userInstructionMsgToDisplay) userInstructionMsgToDisplay = window.clearTimeout(userInstructionMsgToDisplay);
    userInstructionMsgToDisplay = window.setTimeout(() => { userInstructionMsgToDisplay = false; }, 3000);
  } else if (trackingInfo.distance) { // << user face found but too far from camera
    videoMsgOverlays.forEach((overlay) => overlay.classList.add('d-none-fadeout'));
    moveCloserMsg.classList.remove('d-none-fadeout');
  } else {
    const livenessHighData = trackingInfo.livenessHigh;
    if (trackingInfo.faceh === 0 && trackingInfo.facew === 0) { // << no face detected
      videoMsgOverlays.forEach((overlay) => overlay.classList.add('d-none-fadeout'));
      headStartPositionOutline.classList.remove('d-none-fadeout');
    } else if (livenessHighData
            && livenessHighData.movingPhone // << user is moving his phone so display gif animation to keep phone still
            && !userInstructionMsgToDisplay) {
      videoMsgOverlays.forEach((overlay) => overlay.classList.add('d-none-fadeout'));
      userInstructionMsgToDisplay = true;
      movingPhoneMsg.classList.remove('d-none-fadeout');
      userInstructionMsgDisplayed = window.setTimeout(() => {
        movingPhoneMsg.classList.add('d-none-fadeout');
        userInstructionMsgDisplayed = window.clearTimeout(userInstructionMsgDisplayed);
        window.setTimeout(() => { userInstructionMsgToDisplay = false; }, 5000);
      }, 5000);
    } else if (trackingInfo.positionInfo) {
      videoMsgOverlays.forEach((overlay) => overlay.classList.add('d-none-fadeout'));
      handlePositionInfo(trackingInfo.positionInfo);
    }
  }
}
function displayMsg(elementToDisplay, ttl = 2000) {
  // hide all messages
  videoMsgOverlays.forEach((overlay) => overlay.classList.add('d-none-fadeout'));
  elementToDisplay.classList.remove('d-none-fadeout');
  userInstructionMsgDisplayed = window.setTimeout(() => {
    elementToDisplay.classList.add('d-none-fadeout');
    userInstructionMsgDisplayed = window.clearTimeout(userInstructionMsgDisplayed);
  }, ttl);
}
// not used
function displayIlluminationOverlay(colors, i) {
  // show illumination. overlay
  illuminationOverlay.style.backgroundColor = colors[i];
  illuminationOverlay.classList.remove('d-none');
  if (client) client.colorDisplayed();
  // switch illumination overlay color
  setTimeout(() => {
    illuminationOverlay.classList.add('d-none');
    if (colors[i + 2]) displayIlluminationOverlay(colors, i + 2);
  }, colors[i + 1]);
}
/**
 * init a liveness session
 * @return sessionId
 */
async function initLivenessSession(sessionId = '', identityId = '') {
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
 * retrieve the liveness challenge result from backend (via polling)
 * @param sessionId
 * @param maxAttempts
 * @param interval
 * @return {isLivenessSucceeded, message}
 */
async function getLivenessChallengeResult(sessionId, maxAttempts = 10, interval = 1000) {
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
              resolve(getLivenessChallengeResult(sessionId, maxAttempts - 1));
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
async function pushFaceAndDoMatch(selfieImage) {
  try {
    const face2 = await createFace(sessionId, selfieImage);
    const matches = await getMatches(sessionId, bestImageId, face2.faceId);
    document.querySelectorAll('.step').forEach((step) => step.classList.add('d-none'));
    if (matches.matching === 'ok') {
      document.querySelector('#step-selfie-ok .description').innerHTML = __('Matching succeeded <br> score: ') + matches.score;
      document.querySelector('#step-selfie-ok').classList.remove('d-none');
    } else {
      document.querySelector('#step-selfie-ko').classList.remove('d-none');
      if (matches.score) {
        document.querySelector('#step-selfie-ko .description').innerHTML = __('Matching failed <br> score: ') + matches.score || '';
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
async function createFace(sessionId, imageFile, faceInfo = '{"imageType" : "SELFIE","friendlyName" : "selfie", "imageRotationEnabled":"true"}') {
  return new Promise(((resolve, reject) => {
    const formData = new window.FormData();
    const xhttp = new window.XMLHttpRequest();
    formData.append('image', imageFile);
    formData.append('face', new window.Blob([faceInfo], { type: 'application/json' }));
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
async function getFaceImage(sessionId, faceId) {
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
async function getMatches(sessionId, referenceFaceId, candidateFaceId) {
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

document.querySelector('#takeMyPickture').addEventListener('click', () => {
  selfieInput.click();
});
selfieInput.addEventListener('change', (e) => {
  pushFaceAndDoMatch(e.target.files[0]);
});

if (isSkipTutorial) {
  cameraPermissionAlreadyAsked = true; // hack to skip the camera frame
  processStep('#step-liveness',100);
} else if (isVideoTutEnabled) {
  document.querySelector('main').classList.remove('animation-tut');
  document.querySelector('main').classList.add('video-tut');
  document.querySelector('#step-1-vid').id = 'step-1';
  document.querySelector('#step-end-tutorial-vid').id = 'step-end-tutorial';
} else {
  document.querySelector('#step-1-anim').id = 'step-1';
  document.querySelector('#step-end-tutorial-anim').id = 'step-end-tutorial';
}
if (document.querySelector('#step-1')) {
  window.envBrowserOk && document.querySelector('#step-1').classList.remove('d-none');
}
sessionStorage.removeItem('livenessResult');
/**
 * check user connectivity (latency, download speed, upload speed)
 */
window.onload = () => {
  if (BioserverNetworkCheck && window.envBrowserOk && !isSkipTutorial) {
    let ttlInProgress = window.setTimeout(() => {
      onNetworkCheckUpdate();
    }, 10000);
    let displayGoodSignal = false;
    function onNetworkCheckUpdate(networkConnectivity) {
      if (!ttlInProgress) return;
      if (!networkConnectivity || !networkConnectivity.goodConnectivity) {
        if (!networkConnectivity) {
          console.log('Unable to check user connectivity within 10sec.');
        }
        const weakNetworkCheckPage = document.querySelector('#step-weak-network');
        weakNetworkCheckPage.querySelector('.animation').classList.add('d-none');
        weakNetworkCheckPage.querySelector('.check-phone').classList.remove('d-none');
        weakNetworkCheckPage.querySelector('.upload').classList.add('d-none');
        weakNetworkCheckPage.querySelector('.download').classList.add('d-none');

        document.querySelectorAll('.step').forEach((s) => s.classList.add('d-none'));
        weakNetworkCheckPage.classList.remove('d-none');
        if (networkConnectivity) {
          const uploadNotGood = networkConnectivity.upload;
          const signalValue = uploadNotGood ? networkConnectivity.upload : networkConnectivity.download;
          const signalThreshold = uploadNotGood
            ? BioserverNetworkCheck.UPLOAD_SPEED_THRESHOLD
            : BioserverNetworkCheck.DOWNLOAD_SPEED_THRESHOLD;
          weakNetworkCheckPage.querySelector('.signal-value').innerHTML = signalValue && `(${signalValue}kbps)` || '';
          weakNetworkCheckPage.querySelector('.signal-min-value').innerHTML = `${signalThreshold}kbps`;
          if (uploadNotGood) weakNetworkCheckPage.querySelector('.upload').classList.remove('d-none');
          else weakNetworkCheckPage.querySelector('.download').classList.remove('d-none');
        } else { // << case of time out
          weakNetworkCheckPage.querySelector('.signal-value').innerHTML = '';
          weakNetworkCheckPage.querySelector('.signal-min-value').innerHTML = `${BioserverNetworkCheck.DOWNLOAD_SPEED_THRESHOLD}kbps`;
          weakNetworkCheckPage.querySelector('.download').classList.remove('d-none');
        }
        // close VideoCapture If Needed;
        resetLivenessDesign();
        if (client) {
          client.disconnect();
        }
      } else if (networkConnectivity
                && displayGoodSignal
                && networkConnectivity.goodConnectivity
                && networkConnectivity.upload) {
        document.querySelectorAll('.step').forEach((s) => s.classList.add('d-none'));
        const goodNetworkCheckPage = document.querySelector('#step-good-network');
        goodNetworkCheckPage.classList.remove('d-none');
        goodNetworkCheckPage.querySelector('.signal-value').innerHTML = `(${networkConnectivity.download}kbps)`;
        goodNetworkCheckPage.querySelector('.signal-min-value').innerHTML = `${BioserverNetworkCheck.DOWNLOAD_SPEED_THRESHOLD}kbps`;
        displayGoodSignal = false;
        connectivityOK = true; // connectivity results retrived enough (page displayed)
      } else {
        connectivityOK = true; // connectivity results retrived enough
      }
      if (!connectivityOK) { // clear the other waiting screen since we are going to show data from network event
        clearTimeout(timeoutCheckConnectivity); // clear the timeout connectivity check
        document.querySelector('#connectivity-check').classList.add('d-none'); // hide the waiting page
      }
      ttlInProgress = window.clearTimeout(ttlInProgress);
    }
    if(useProxy) {
        BioserverNetworkCheck.connectivityMeasure({
            downloadURL:  basePath + '/network-speed',
            uploadURL:  basePath + '/network-speed',
            latencyURL:  basePath + '/network-latency',
            onNetworkCheckUpdate: onNetworkCheckUpdate
        });
    } else {
        BioserverNetworkCheck.connectivityMeasure({
            downloadURL:  videoUrlWithBasePath + '/network-speed',
            uploadURL:  videoUrlWithBasePath + '/network-speed',
            latencyURL:  videoUrlWithBasePath + '/network-latency',
            onNetworkCheckUpdate: onNetworkCheckUpdate
        });
    }
    document.querySelector('#check-network').onclick = function () {
      const weakNetworkCheckPage = document.querySelector('#step-weak-network');
      weakNetworkCheckPage.querySelector('.animation').classList.remove('d-none');
      weakNetworkCheckPage.querySelector('.check-phone').classList.add('d-none');
      ttlInProgress = window.setTimeout(() => {
        onNetworkCheckUpdate();
      }, 10000);
      displayGoodSignal = true;
      window.setTimeout(() => {
        if(useProxy) {
            BioserverNetworkCheck.connectivityMeasure({
                downloadURL:  basePath + '/network-speed',
                uploadURL:  basePath + '/network-speed',
                latencyURL:  basePath + '/network-latency',
                onNetworkCheckUpdate: onNetworkCheckUpdate
            });
        } else {
            BioserverNetworkCheck.connectivityMeasure({
                downloadURL:  videoUrlWithBasePath + '/network-speed',
                uploadURL:  videoUrlWithBasePath + '/network-speed',
                latencyURL:  videoUrlWithBasePath + '/network-latency',
                onNetworkCheckUpdate: onNetworkCheckUpdate
            });
        }
      }, 100);
    };
  }
};

/**
 init liveness animations from json files (instead pf GIFs)
 */
function initLivenessAnimations() {
  document.querySelectorAll('.animation-part1').forEach((anim) => {
    lottie.loadAnimation({
      container: anim, // the dom element that will contain the animation
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: require('./animations/liveness_animation_part1.json'), // the animation data
    });
  });
  document.querySelectorAll('.animation-part1-pc').forEach((anim) => {
    lottie.loadAnimation({
      container: anim, // the dom element that will contain the animation
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: require('./animations/liveness_animation_part1_pc.json'), // the animation data
    });
  });
  document.querySelectorAll('.animation-part2').forEach((anim) => {
    lottie.loadAnimation({
      container: anim, // the dom element that will contain the animation
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: require('./animations/liveness_animation_part2.json'), // the animation data
    });
  });
  document.querySelectorAll('.animation-part2-pc').forEach((anim) => {
    lottie.loadAnimation({
      container: anim, // the dom element that will contain the animation
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: require('./animations/liveness_animation_part2_pc.json'), // the animation data
    });
  });
  document.querySelectorAll('.animation-part3').forEach((anim) => {
    lottie.loadAnimation({
      container: anim, // the dom element that will contain the animation
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: require('./animations/liveness_animation_part3.json'), // the animation data
    });
  });
  document.querySelectorAll('.animation-part3-pc').forEach((anim) => {
    lottie.loadAnimation({
      container: anim, // the dom element that will contain the animation
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: require('./animations/liveness_animation_part3_pc.json'), // the animation data
    });
  });
  document.querySelectorAll('.animation-full').forEach((animationFull) => {
    lottie.loadAnimation({
      container: animationFull, // the dom element that will contain the animation
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: require('./animations/liveness_animation_full.json'), // the animation data
    });
  });
  document.querySelectorAll('.animation-full-pc').forEach((animationFull) => {
    lottie.loadAnimation({
      container: animationFull, // the dom element that will contain the animation
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: require('./animations/liveness_animation_full_pc.json'), // the animation data
    });
  });
}
initLivenessAnimations();


function handlePositionInfo(positionInfo) {
  switch (positionInfo) {
    case 'TRACKER_POSITION_INFO_MOVE_BACK_INTO_FRAME': // No head detected
    case 'TRACKER_POSITION_INFO_CENTER_MOVE_BACKWARDS': // Move away from the camera 
    case 'TRACKER_POSITION_INFO_CENTER_MOVE_FORWARDS': // Move closer to the camera 
    case 'TRACKER_POSITION_INFO_CENTER_TURN_RIGHT': // Turn your head right
    case 'TRACKER_POSITION_INFO_CENTER_TURN_LEFT': // Turn your head left
    case 'TRACKER_POSITION_INFO_CENTER_ROTATE_UP': // Turn your head up
    case 'TRACKER_POSITION_INFO_CENTER_ROTATE_DOWN': // Turn your head down
    case 'TRACKER_POSITION_INFO_MOVING_TOO_FAST': // You are moving too fast
    case 'TRACKER_POSITION_INFO_CENTER_TILT_RIGHT': // Tilt your head right
    case 'TRACKER_POSITION_INFO_CENTER_TILT_LEFT': // Tilt your head left
    case 'TRACKER_POSITION_INFO_STAND_STILL': // Stand still
      displayMsg(headStartPositionOutline);
      break;
    case 'TRACKER_POSITION_INFO_MOVE_DARKER_AREA': // The place is too bright
      displayMsg(tooBrightMsg);
      break;
    case 'TRACKER_POSITION_INFO_MOVE_BRIGHTER_AREA': // The place is too dark
      displayMsg(tooDarkMsg);
      break;
    default:
      displayMsg(headStartPositionOutline);
      break;
  }
}
