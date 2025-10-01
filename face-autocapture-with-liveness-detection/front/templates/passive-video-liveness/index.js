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

// this file is the main program that uses video server api for passive liveness

/* global BASE_PATH, VIDEO_URL, VIDEO_BASE_PATH, DISABLE_CALLBACK, DEMO_HEALTH_PATH, IDPROOFING, BioserverVideo, BioserverNetworkCheck, BioserverVideoUI, __ */
/* eslint-disable no-console */
const commonutils = require('../../utils/commons');

const ID_SOCKET_INIT = '#socket-init';
const ID_STEP_ACCESS_PERMISSION = '#step-access-permission';
const ID_STEP_LIVENESS = '#step-liveness';
const ID_STEP_LIVENESS_OK = '#step-liveness-ok';
const ID_STEP_AGE_ESTIMATION = '#step-age-estimation';
const D_NONE_FADEOUT = 'd-none-fadeout';
const CLASS_SIGNAL_VALUE = '.signal-value';
const CLASS_MIN_SIGNAL_VALUE = '.signal-min-value';

const ID_AGE_THRESHOLD_VALUE = '#age-threshold-value';
const ID_AGE_ESTIMATION_VALUE = '#age-estimation-value';

const ID_CONNECTIVITY_CHECK = '#connectivity-check';
const VIDEO_ID = 'user-video';
const BEST_IMG_ID = 'best-image';
const BEST_IMG_IPV_ID = 'best-image-ipv';
const BEST_IMG_AGE_ID = 'best-image-age';
const BEST_IMG_MATCH_ID = 'best-image-match';
const bestImageIPV = document.querySelector('#' + BEST_IMG_IPV_ID);
const getIPVStatus = document.querySelector('#get-ipv-status-result');
const connectivityCheck = document.querySelector(ID_CONNECTIVITY_CHECK);
const socketInit = document.querySelector(ID_SOCKET_INIT);
const stepLiveness = document.querySelector(ID_STEP_LIVENESS);

const videoOutput = document.querySelector('#' + VIDEO_ID);
const monitoring = document.querySelectorAll('.monitoring');

const retryFp = document.querySelector('.retry-fp');

const getIpvTransactionButton = document.querySelector('#get-ipv-transaction');
const getIpvPortraitButton = document.querySelector('#get-ipv-portrait');

const headStartPositionOutline = document.querySelector('#center-head-animation');

const stopCapture = document.querySelector('#stop-capture');
const moveCloserMsg = document.querySelector('#move-closer-animation');
const moveFurtherMsg = document.querySelector('#move-further-animation');
const dontMoveMsg = document.querySelector('#dont-move-animation');
const scanningMsg = document.querySelector('#scan-animation');

const phoneNotVerticalMsg = document.querySelector('#phone-not-vertical-animation');
const loadingInitialized = document.querySelector('#loading-initialized');
const loadingResults = document.querySelector('#loading-results');

const selfieInput = document.querySelector('#selfieInput');
const weakNetworkCheckPage = document.querySelector('#step-weak-network');
const goodNetworkCheckPage = document.querySelector('#step-good-network');
const videoLoadingMsgOverlays = document.querySelectorAll('#step-liveness .video-overlay');
const videoInstructionMsgOverlays = document.querySelectorAll('#step-liveness .move-message');

const uploadingLoader = document.querySelector('#uploading-results');
const uploadingInfinite = uploadingLoader.querySelector('#uploading-infinite');
const uploadingProgress = uploadingLoader.querySelector('#uploading-progress');

const initLoader = document.querySelector('#init-loader');
const donwloadingLoader = document.querySelector('#downloading-loader');
const downloadingProgress = document.querySelector('#downloading-progress');

const { hideAllStepsAndDisplay, hideAllSteps } = commonutils;

let timeoutCheckConnectivity; // settimeout used to stop if network event received
let connectivityOK = false;
let client; // let start & stop face capture
let videoStream; // user video camera stream
let sessionId; // current sessionId
let bestImageId; // best image captured from user video stream
let cameraPermissionAlreadyAsked;
let identityId;
let bestImageInfo;
let faceImg;
let ageInfo;
const urlParams = new URLSearchParams(window.location.search); // let you extract params from url
const matchingEnabled = urlParams.get('enableMatching') === 'true';
const ageEstimationEnabled = urlParams.get('ageThreshold') != null;


const sessionIdParam = urlParams.get('sessionId');
const identityIdParam = urlParams.get('identityId');
const ageThresholdParam = urlParams.get('ageThreshold');

const basePath = BASE_PATH;
const videoUrlWithBasePath = VIDEO_URL + VIDEO_BASE_PATH;
const videoBasePath = VIDEO_BASE_PATH;
const videoUrl = VIDEO_URL;
const enablePolling = !DISABLE_CALLBACK;
const healthPath = DEMO_HEALTH_PATH;
const idProofingWorkflow = IDPROOFING;

commonutils.initLivenessPassiveVideoTutorial();

/**
 * 1- init liveness session (from backend)
 * 2- init the communication with the server via socket
 * 3- get liveness result (from backend)
 * 4- [Optional] ask the end user to push his reference image (post to backend)
 * 5- [Optional] get the matching result between the best image from liveness check and the reference image
 */

// call getCapabilities from demo-server which will call with apikey the endpoint from video-server
commonutils.getCapabilities(basePath, healthPath).then(response => {
    console.log('getMonitoring ok', response);
    if (response?.version) {
        monitoring.forEach((element) => { element.innerHTML = `${response.version}`; });
    }
}).catch(async (err) => {
    console.error(err);
    await stopVideoCaptureAndProcessResult(false, 'Service unavailable');
});

/**
 * Button stop activated
 **/
stopCapture.addEventListener('click', async () => {
    resetLivenessDesign();
    if (client) {
        videoOutput.srcObject = null;
        client.disconnect();
    }
});

const D_NONE = 'd-none';
const BTN_BLOCK = 'btn-block';
const D_NONE_VISIBLE = 'invisible';

async function init() {
    // Disconnect any existing client
    if (client) {
        client.disconnect();
    }
    client = undefined;
    videoOutput.disablePictureInPicture = true;

    // Request a sessionId from backend
    try {
        const session = await commonutils.initLivenessSession(basePath, sessionIdParam || '',
            identityIdParam || '', ageThresholdParam || '');
        sessionId = session.sessionId;
        identityId = session.identityId;
    } catch (err) {
        console.error(err);
        clearTimeout(timeoutCheckConnectivity);
        sessionId = false;
        const msg = err.status === 429 ? 'Server overloaded' : __('Failed to initialize session');
        await stopVideoCaptureAndProcessResult(false, msg);
    }
    if (!sessionId) {
        return;
    }
    // initialize the face capture client with callbacks
    let challengeInProgress = false;
    const faceCaptureOptions = {
        bioSessionId: sessionId,
        onClientInitEnd: () => {
            console.log('init ended');
            loadingInitialized.classList.add(D_NONE_FADEOUT); // initialization successfully, remove loading for video
            headStartPositionOutline.classList.remove(D_NONE_FADEOUT);
            stopCapture.classList.remove(D_NONE_FADEOUT); // display
            BioserverVideoUI.initPassiveVideoGraphics(VIDEO_ID);
        },
        showChallengeInstruction: (challengeInstruction) => {
            if (challengeInstruction === 'TRACKER_CHALLENGE_PENDING') {
                // pending ==> display waiting msg meanwhile the showChallengeResult callback is called with result
                challengeInProgress = false;
                // When 'TRACKER_CHALLENGE_PENDING' message under showChallengeInstruction callback is received, a loader should be displayed to
                // the end user so he understands that the capture is yet finished but best image is still being computing
                // and that he should wait for his results. If you don't implement this way, a black screen should be visible !
                hideCaptureInstructions();
                // display of upload loader
                resetLivenessDesign();
                hideAllStepsAndDisplay(uploadingLoader);
                // Display infinite loader first and hide progress bar since we don't know yet the percentage
                uploadingInfinite.classList.remove(D_NONE);
                uploadingProgress.classList.add(D_NONE);
            } else { // challengeInstruction == TRACKER_CHALLENGE_DONT_MOVE
                challengeInProgress = true;
            }
        },
        showChallengeResult: async (result) => {
            console.log('Liveness Challenge done > requesting result ...', result);
            resetLivenessDesign();
            hideAllStepsAndDisplay(loadingResults);
            bestImageInfo = result && result.bestImageInfo; // store best image info to be used to center the image when it'll be displayed
            const livenessResult = await commonutils.getLivenessChallengeResult(basePath, enablePolling, sessionId)
                .catch(async () => await stopVideoCaptureAndProcessResult(false, __('Failed to retrieve liveness results')));
            console.log('Liveness result: ' + livenessResult.message, livenessResult);
            if (client) {
                videoOutput.srcObject = null;
                client.disconnect();
            }
            // result.diagnostic not currently set as last param of stopVideoCaptureAndProcessResult(), as we need to know the impact of displaying it to the user
            if (livenessResult) {
                await stopVideoCaptureAndProcessResult(livenessResult.isLivenessSucceeded, livenessResult.message, livenessResult.bestImageId, livenessResult.age);
            }
        },
        trackingFn: (trackingInfo) => {
            displayInstructionsToUser(trackingInfo, challengeInProgress);
        },
        errorFn: async (error) => {
            clearTimeout(timeoutCheckConnectivity);
            console.log('got error', error);
            challengeInProgress = false;
            if (error.code && error.code === 429) { //  enduser is blocked
                // we reset the session when we finished the liveness check real session
                resetLivenessDesign();
                userBlockInterval(new Date(error.unlockDateTime).getTime());
                hideAllStepsAndDisplay('#step-liveness-fp-block');
            } else if (error.code && error.code === 503) { //  server overloaded
                resetLivenessDesign();
                hideAllStepsAndDisplay('#step-server-overloaded');
            } else {
                await stopVideoCaptureAndProcessResult(false, __('Sorry, there was an issue.'));
            }
            if (client) {
                videoOutput.srcObject = null;
                client.disconnect();
            }
        }
    };
    faceCaptureOptions.wspath = videoBasePath + '/engine.io';
    faceCaptureOptions.bioserverVideoUrl = videoUrl;
    
    client = await BioserverVideo.initFaceCaptureClient(faceCaptureOptions);
}

async function initStream() {
    initLivenessDesign();
    if (client) {
        // get user camera video (front camera is default)
        videoStream = await BioserverVideo.getMediaStream({ videoId: VIDEO_ID })
            .catch(async (e) => {
                let msg = __('Failed to get camera device stream');
                let extendedMsg;
                if (e.name && e.name.indexOf('NotAllowed') > -1) {
                    msg = __('You denied camera permissions, either by accident or on purpose.');
                    extendedMsg = __('In order to use this demo, you need to enable camera permissions in your browser settings or in your operating system settings. Please refresh the page to restart the demo.');
                }
                await stopVideoCaptureAndProcessResult(false, msg, '', extendedMsg);
            });
        if (!videoStream) {
            videoOutput.srcObject = null;
            client.disconnect();
            return;
        }
        // display the video stream
        videoOutput.srcObject = videoStream;
    }
}

function displayAgeEstimationResult({ referenceImage, referenceImageInfo } = {}) {
    // hide all buttons
    document.querySelectorAll('#step-age-estimation button').forEach((btn) => btn.classList.add(D_NONE));
    // initialize field displaying age estimation result
    document.querySelector(ID_AGE_THRESHOLD_VALUE).innerHTML = ageInfo.threshold;
    document.querySelector(ID_AGE_ESTIMATION_VALUE).innerHTML = Math.floor(ageInfo.ageEstimated);
    // check whether estimation is above threshold
    const bestImgLayer = document.querySelector('#best-image-age-result');
    let graphicOptions;
    if (ageInfo.aboveThreshold) {
        // case age estimated returned and above threshold
        bestImgLayer.src = './img/success_tick.svg';
        document.querySelectorAll('#step-age-estimation .age-success').forEach((element) => element.classList.remove(D_NONE));
        document.querySelectorAll('#step-age-estimation .age-failure').forEach((element) => element.classList.add(D_NONE));
    } else {
        // case age estimated not returned
        bestImgLayer.src = './img/failure_tick.svg';
        // case age estimated returned and below threshold
        graphicOptions = { oval: { borderColor: '#AC1B20' } };
        document.querySelectorAll('#step-age-estimation .age-success').forEach((element) => element.classList.add(D_NONE));
        document.querySelectorAll('#step-age-estimation .age-failure').forEach((element) => element.classList.remove(D_NONE));
    }

    // Display best image
    if (faceImg && bestImageInfo) {
        BioserverVideoUI.displayPassiveVideoBestImage(faceImg, bestImageInfo, BEST_IMG_AGE_ID, graphicOptions);
    }
    // Display reference image
    if (referenceImage && referenceImageInfo) {
        // Add description of best image if reference is displayed
        document.querySelector('#best-image-age-description').classList.remove(D_NONE);
        // Add reference image container if reference is displayed
        document.querySelector('#best-image-match-container').classList.remove(D_NONE);
        BioserverVideoUI.displayPassiveVideoBestImage(referenceImage, referenceImageInfo, BEST_IMG_MATCH_ID, graphicOptions);
    } else {
        // Remove description of best image if reference is not displayed
        document.querySelector('#best-image-age-description').classList.add(D_NONE);
        // Remove reference image container if reference is not displayed
        document.querySelector('#best-image-match-container').classList.add(D_NONE);
    }
    document.querySelectorAll('#step-age-estimation button').forEach((element) => element.classList.remove(D_NONE));
}

/**
 * Get GIPS Transaction Button activated
 **/
getIpvTransactionButton.addEventListener('click', async () => {
    console.log('calling getGipsStatus with identityId=' + identityId);
    getIPVStatus.innerHTML = '';
    const result = await commonutils.getGipsStatus(basePath, identityId);
    console.log('result IPV response' + result);
    getIPVStatus.innerHTML = JSON.stringify(result, null, 2);
    getIPVStatus.classList.remove(D_NONE);
});

/**
 * Get GIPS Transaction Button activated
 **/
getIpvPortraitButton.addEventListener('click', async () => {
    console.log('calling getIpvPortraitButton ');
    if (bestImageId) {
        const faceImg = await commonutils.getFaceImage(basePath, sessionId, bestImageId);
        BioserverVideoUI.displayBestImage(faceImg, bestImageInfo, BEST_IMG_IPV_ID);
        bestImageIPV.classList.remove(D_NONE);
    }
});

// when next button is clicked go to targeted step
document.querySelectorAll('*[data-target]')
    .forEach((btn) => btn.addEventListener('click', async () => {
        const targetStepId = btn.getAttribute('data-target');
        await processStep(targetStepId, btn.hasAttribute('data-delay') && (btn.getAttribute('data-delay') || 2000))
            .catch(async (ex) => {
                console.error(ex);
                await stopVideoCaptureAndProcessResult(false);
            });
    }));

function processTargetStep(targetStepId, displayWithDelay) {
    const targetStep = document.querySelector(targetStepId);
    targetStep.classList.remove(D_NONE);
    const targetStepFooter = targetStep.querySelector('.footer');
    if (targetStepFooter && displayWithDelay) {
        // make "next step" button invisible for a few seconds
        // "invisible" to avoid css jump when it's displayed
        targetStepFooter.classList.add(D_NONE_VISIBLE);
        setTimeout(() => targetStepFooter.classList.remove(D_NONE_VISIBLE), displayWithDelay);
    }
}

async function processStep(targetStepId, displayWithDelay, { referenceImage, referenceImageInfo } = {}) {
    // init debug ipv
    bestImageIPV.classList.add(D_NONE);
    getIPVStatus.classList.add(D_NONE);

    if (targetStepId === '#application-version') {
        document.querySelector(targetStepId).classList.remove(D_NONE);

        setTimeout(() => {
            document.querySelector(targetStepId).classList.add(D_NONE);
        }, 2000);
        return;
    }
    hideAllSteps();
    if (targetStepId === '#step-1') {
        scrollTo(0, 0);
    } else if (targetStepId === '#step-1-restore') {
        // We come from the tutorial or another step where we 'restore' the initial step (without forcing init call)
        scrollTo(0, 0);
        targetStepId = '#step-1';
    } else if (targetStepId === ID_CONNECTIVITY_CHECK) { // << if client clicks on start capture
        if (!connectivityOK) { // bypass this waiting time if we are still here 5 seconds
            connectivityCheck.classList.remove(D_NONE);
            timeoutCheckConnectivity = setTimeout(() => {
                processStep(targetStepId, displayWithDelay);
            }, 1000); // call this method until we got the results from the network connectivity
        } else if (!cameraPermissionAlreadyAsked) {
            cameraPermissionAlreadyAsked = true;
            displayWithDelay = null; // no delay applied to show the button
            targetStepId = ID_STEP_ACCESS_PERMISSION;
        } else {
            targetStepId = ID_SOCKET_INIT; // connectivity check done/failed, move to the next step
        }
    }
    if (targetStepId === ID_SOCKET_INIT) { // << if client clicks on start capture or retry
        socketInit.classList.remove(D_NONE);
        // Show infinite loader & hide downloading loader
        initLoader.classList.remove(D_NONE);
        donwloadingLoader.classList.add(D_NONE);
        await init();
        if (!sessionId) {
            // Init failed, error has already been handled
            return;
        }
        socketInit.classList.add(D_NONE);
        targetStepId = ID_STEP_LIVENESS; // init socket done, move to the next step
    }
    // Liveness page
    if (targetStepId === ID_STEP_LIVENESS) { // << if client clicks on start capture && socket initialisation is already done
        if (!cameraPermissionAlreadyAsked) {
            cameraPermissionAlreadyAsked = true;
            targetStepId = ID_STEP_ACCESS_PERMISSION;
        } else {
            stepLiveness.classList.remove(D_NONE);
            await initStream();
            if (client && videoStream) {
                client.startCapture({ stream: videoStream });
            } else {
                console.log('client or videoStream not available, start aborted');
                return;
            }
        }
    }
    // Age estimation step
    if (targetStepId === ID_STEP_AGE_ESTIMATION) {
        displayAgeEstimationResult({ referenceImage, referenceImageInfo });
    }

    processTargetStep(targetStepId, displayWithDelay);
}

// gif animations are played only once, this will make them play again
document.querySelectorAll('.reset-animations').forEach((btn) => {
    btn.addEventListener('click', () => {
        console.log('Click on reset animation');
        refreshImgAnimations();
    });
});

function refreshImgAnimations() {
    // reload only gif animations
    document.querySelectorAll('.step > .animation > img').forEach((img) => {
        const gifAnimation = img.src.split('?')[0];
        if (gifAnimation.endsWith('.gif')) {
            const nbRandom = Date.now();
            img.src = `${gifAnimation}?v=${nbRandom}`;
        }
    });
}

function displayBestImage() {
    if (faceImg && bestImageInfo) {
        BioserverVideoUI.displayPassiveVideoBestImage(faceImg, bestImageInfo, BEST_IMG_ID);
    }
}

window.addEventListener('resize', () => {
    // re-center best image display in case of screen rotation (only if we are displaying result screen)
    if (!document.querySelector(ID_STEP_LIVENESS_OK).classList.contains(D_NONE)) {
        displayBestImage();
    }
});

/**
 * Suspend video camera and return result
 */
async function stopVideoCaptureAndProcessResult(success, msg, faceId = '', age, _) {
    console.log('Stop video capture: message=' + msg + ', success=' + success);
    bestImageId = faceId;
    // we reset the session when we finished the liveness check real session
    resetLivenessDesign();
    hideAllSteps();
    if (success) {
        // Liveness is successful
        if (!idProofingWorkflow) {
            // display loader while loading best image
            loadingResults.classList.remove(D_NONE);
            faceImg = await commonutils.getFaceImage(basePath, sessionId, faceId);
            ageInfo = age;
            // if age estimation display directly the age estimation screen
            if (ageEstimationEnabled && !matchingEnabled && age != null) {
                await processStep(ID_STEP_AGE_ESTIMATION, 0);
                loadingResults.classList.add(D_NONE);
                return;
            }
            document.querySelector(ID_STEP_LIVENESS_OK).classList.remove(D_NONE);
            document.querySelectorAll('#step-liveness-ok [class*="-step"]').forEach((element) => element.classList.add(D_NONE));
            document.querySelector('.success-no-ipv').classList.remove(D_NONE);
            loadingResults.classList.add(D_NONE);
            displayBestImage();
        } else {
            document.querySelector(ID_STEP_LIVENESS_OK).classList.remove(D_NONE);
            document.querySelectorAll('#step-liveness-ok [class*="-step"]').forEach((element) => element.classList.add(D_NONE));
            document.querySelector('.success-ipv').classList.remove(D_NONE);
            document.querySelector('#get-ipv-transaction').classList.remove(D_NONE);
            document.querySelector('#get-ipv-portrait').classList.remove(D_NONE);
        }
        const nextButton = matchingEnabled ? 'next-step' : 'reset-step';

        document.querySelectorAll(`#step-liveness-ok .${nextButton}`).forEach((element) => element.classList.remove(D_NONE));
    } else if (msg?.includes('Timeout')) { // msg from /liveness-challenge-result endpoint
        // Liveness goes until timeout, maybe face is not detected
        document.querySelector('#step-liveness-timeout').classList.remove(D_NONE);
        setTimeout(() => {
            document.querySelector('#step-liveness-timeout .footer').classList.remove(D_NONE);
        }, 2000);
    } else if (msg?.includes('Liveness failed')) { // msg from /liveness-challenge-result endpoint
        // Liveness fails
        document.querySelector('#step-liveness-ko').classList.remove(D_NONE);
    } else if (msg === __('You denied camera permissions, either by accident or on purpose.')) {
        // No-camera-access issue
        document.querySelector('#step-No-camera-access').classList.remove(D_NONE);
    } else if (msg === 'Server overloaded') {
        document.querySelector('#step-server-overloaded').classList.remove(D_NONE);
    } else {
        // All other fatal errors
        document.querySelector('#step-liveness-failed').classList.remove(D_NONE);
    }
}

function userBlockInterval(fpBlockDate) {
    let fpCountdown = null;
    retryFp.classList.add(D_NONE);
    document.querySelector('.please-try-again-in').classList.remove(D_NONE);
    const updateBlockInterval = () => {
        const currentDate = new Date().getTime();
        const timeLeft = fpBlockDate - currentDate; // difference between blocking time and now in milliseconds
        // when browser's javascript is not working, timeLeft can be < 0
        if (timeLeft > 0) {
            // retrieve days/hours/minutes/seconds left before end of freeze
            const timerLeft = countTimeLeft(timeLeft);
            if (timerLeft) {
                // update UX with the countdown
                document.querySelector('.fp-countdown').innerHTML = timerLeft;
                return;
            }
        }
        // stop internal and display retry button
        clearInterval(fpCountdown);
        document.querySelector('.fp-countdown').innerHTML = ''; // remove countdown since time is over
        document.querySelector('.please-try-again-in').classList.add(D_NONE);
        // display retry button
        retryFp.classList.remove(D_NONE);
    };
    updateBlockInterval();
    // update the UI each second to update the left time of blocking
    fpCountdown = setInterval(updateBlockInterval, 1000);
}

/**
 * count time left regarding user blocking step
 * @param timeLeft
 * @returns {string}
 */
function countTimeLeft(timeLeft) {
    // retrieve days/hours/minutes/seconds left before end of freeze
    let days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    let hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    let minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    let seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    // remove 0 if needed + add suffix to understand if day/hours/minutes/seconds
    if (days !== 0) {
        days = days + 'd ';
        hours = hours + 'h ';
        minutes = (minutes < 10 ? '0' + minutes : minutes) + 'm ';
        seconds = (seconds < 10 ? '0' + seconds : seconds) + 's';
        return days + hours + minutes + seconds;
    }

    days = '';
    if (hours !== 0) {
        hours = hours + 'h ';
        minutes = (minutes < 10 ? '0' + minutes : minutes) + 'm ';
        seconds = (seconds < 10 ? '0' + seconds : seconds) + 's';
        return days + hours + minutes + seconds;
    }

    hours = '';
    if (minutes !== 0) {
        minutes = minutes + 'm ';
        seconds = (seconds < 10 ? '0' + seconds : seconds) + 's';
        return days + hours + minutes + seconds;
    }

    minutes = '';
    if (seconds !== 0) {
        seconds = seconds + 's';
    } else {
        seconds = '';
    }
    return days + hours + minutes + seconds;
}

/**
 * prepare video capture elements
 */
function initLivenessDesign() {
    document.querySelector('header').classList.add(D_NONE);
    document.querySelector('main').classList.add('darker-bg');
    hideCaptureInstructions();
    loadingInitialized.classList.remove(D_NONE_FADEOUT); // display loading until initialization is done
    BioserverVideoUI.stopPassiveVideoAnimation();
}

let headAnimationOn;
let headAnimationOff;
/**
 * reset video capture elements at the end of the process
 */
function resetLivenessDesign() {
    document.querySelector('header').classList.remove(D_NONE);
    document.querySelector('main').classList.remove('darker-bg');

    BioserverVideoUI.resetBestImage();

    if (headAnimationOn || headAnimationOff) {
        window.clearTimeout(headAnimationOn);
        window.clearTimeout(headAnimationOff);
    }
    stopCapture.classList.add(D_NONE_FADEOUT); // remove
}

/**
 * Display messages to user during capture (eg: move closer, center your face ...)
 * @param {object} trackingInfo face tracking info
 * @param {boolean} challengeInProgress challenge has started?
 */
function displayInstructionsToUser(trackingInfo, challengeInProgress) {
    if (challengeInProgress) {
        return;
    }
    const downloadProgress = trackingInfo.downloadProgress;
    if (downloadProgress) {
        setDownloadProgress(downloadProgress);
        if (downloadProgress === 1 && donwloadingLoader.classList.contains(D_NONE)) {
            // Avoid displaying 100% if it is the first value to be displayed (to avoid flickering)
            return;
        }
        // Hide infinite loader, display the download progress bar
        initLoader.classList.add(D_NONE);
        donwloadingLoader.classList.remove(D_NONE);
        // Do not reset anything when reaching 100% to avoid screen flickering between the infinite loader and next screen
        return;
    }

    const uploadProgress = trackingInfo.uploadProgress;
    if (uploadProgress) {
        setUploadProgress(uploadProgress);
        // Hide infinite loader, display the upload progress bar
        uploadingInfinite.classList.add(D_NONE);
        uploadingProgress.classList.remove(D_NONE);

        // When progress has reached 100%, we can switch to next screen
        if (uploadProgress === 1) {
            resetLivenessDesign();
            hideAllStepsAndDisplay(loadingResults);
        }
        return;
    }

    // Tracking : Keep your phone vertical
    if (trackingInfo.phoneNotVertical) { // << user phone not up to face
        displayMsg({ elementToDisplay: phoneNotVerticalMsg, forceDisplay: true, ttl: 3000 });
    } else {
        // Tracking : User position
        handlePositionInfo(trackingInfo);
    }
}

document.querySelector('#takeMyPickture').addEventListener('click', () => {
    selfieInput.click();
});
selfieInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    // Reset value to allow further upload
    event.target.value = '';
    await pushFaceAndDoMatch(basePath, sessionId, bestImageId, file);
});

document.querySelector('#step-1-anim').id = 'step-1';

if (document.querySelector('#step-1')) {
    window.envBrowserOk && document.querySelector('#step-1').classList.remove(D_NONE);
}

/**
 * check user connectivity (latency, download speed, upload speed)
 */
function updateWeakNetworkCheckPage(networkConnectivity) {
    weakNetworkCheckPage.querySelector('.animation').classList.add(D_NONE);
    weakNetworkCheckPage.querySelector('.check-phone').classList.remove(D_NONE);
    weakNetworkCheckPage.querySelector('.upload').classList.add(D_NONE);
    weakNetworkCheckPage.querySelector('.download').classList.add(D_NONE);
    hideAllStepsAndDisplay(weakNetworkCheckPage);
    if (networkConnectivity) {
        const uploadNotGood = !networkConnectivity.upload ? true : (networkConnectivity.upload < BioserverNetworkCheck.UPLOAD_SPEED_THRESHOLD);
        const signalValue = networkConnectivity.upload;
        const signalThreshold = BioserverNetworkCheck.UPLOAD_SPEED_THRESHOLD;
        weakNetworkCheckPage.querySelector(CLASS_SIGNAL_VALUE).innerHTML = (signalValue && '(' + signalValue + ' kb/s)') || '';
        weakNetworkCheckPage.querySelector(CLASS_MIN_SIGNAL_VALUE).innerHTML = signalThreshold + ' kb/s';
        if (uploadNotGood) {
            weakNetworkCheckPage.querySelector('.upload').classList.remove(D_NONE);
        }
    } else { // << case of error
        weakNetworkCheckPage.querySelector(CLASS_SIGNAL_VALUE).innerHTML = '';
        weakNetworkCheckPage.querySelector(CLASS_MIN_SIGNAL_VALUE).innerHTML = BioserverNetworkCheck.UPLOAD_SPEED_THRESHOLD + ' kb/s';
        weakNetworkCheckPage.querySelector('.upload').classList.remove(D_NONE);
    }
}

window.onload = () => {
    if (BioserverNetworkCheck && window.envBrowserOk) {
        let displayGoodSignal = false;

        // eslint-disable-next-line no-inner-declarations
        function onNetworkCheckUpdate(networkConnectivity) {
            if (!networkConnectivity) {
                console.warn('Unable to check user connectivity.');
            }

            if (!networkConnectivity || !networkConnectivity.goodConnectivity) {
                updateWeakNetworkCheckPage(networkConnectivity);
                // close VideoCapture If Needed;
                resetLivenessDesign();
                if (client) {
                    videoOutput.srcObject = null;
                    client.disconnect();
                }
            } else if (networkConnectivity && displayGoodSignal && networkConnectivity.goodConnectivity && networkConnectivity.upload) {
                goodNetworkCheckPage.querySelector(CLASS_SIGNAL_VALUE).innerHTML = '(' + networkConnectivity.upload + ' kb/s)';
                goodNetworkCheckPage.querySelector(CLASS_MIN_SIGNAL_VALUE).innerHTML = BioserverNetworkCheck.UPLOAD_SPEED_THRESHOLD + ' kb/s';
                hideAllStepsAndDisplay(goodNetworkCheckPage);
                displayGoodSignal = false;
                connectivityOK = true; // connectivity results retrieved enough (page displayed)
            } else {
                connectivityOK = true; // connectivity results retrieved enough
            }
            if (!connectivityOK) { // clear the other waiting screen since we are going to show data from network event
                clearTimeout(timeoutCheckConnectivity); // clear the timeout connectivity check
                connectivityCheck.classList.add(D_NONE); // hide the waiting page
            }
        }

        // eslint-disable-next-line no-inner-declarations
        function doNetworkCheck() {
            BioserverNetworkCheck.connectivityMeasure({
                uploadURL: videoUrlWithBasePath + '/network-speed',
                latencyURL: videoUrlWithBasePath + '/network-latency',
                onNetworkCheckUpdate: onNetworkCheckUpdate,
                errorFn: (err) => {
                    console.error('An error occurred while calling connectivityMeasure: ', err);
                    onNetworkCheckUpdate();
                }
            });
        }

        doNetworkCheck();

        document.querySelector('#check-network').onclick = function () {
            const weakNetworkCheckPage = document.querySelector('#step-weak-network');
            weakNetworkCheckPage.querySelector('.animation').classList.remove(D_NONE);
            weakNetworkCheckPage.querySelector('.check-phone').classList.add(D_NONE);
            displayGoodSignal = true;
            window.setTimeout(() => {
                doNetworkCheck();
            }, 100);
        };
    }
};

function displayMsgAndCircle(elementToDisplay, trackingInfo) {
    displayMsg({ elementToDisplay });
    BioserverVideoUI.displayPassiveVideoAnimation(trackingInfo);
}
let msgCurrentlyDisplayed = false;
let msgCurrentlyDisplayedTimer;
/**
 * display a message during ttl and ignore any incoming message during this duration
 * @param {Object} displayOption
 * @param {Element} displayOption.elementToDisplay html element to be displayed during 2s
 * @param {boolean?} displayOption.forceDisplay allow to force display of the provided element even if a message is being displayed
 * @param {number?} displayOption.ttl=2000 duration of message display
 */
function displayMsg({ elementToDisplay, forceDisplay, ttl = 2000 }) {
    if (msgCurrentlyDisplayed && !forceDisplay) {
        return; // discard other messages when a message is already being displayed
    }
    window.clearTimeout(msgCurrentlyDisplayedTimer);
    hideCaptureInstructions();
    // for phoneNotVertical, we don't force the display of the message for 3 sec
    msgCurrentlyDisplayed = elementToDisplay !== phoneNotVerticalMsg;
    elementToDisplay.classList.remove(D_NONE_FADEOUT);
    msgCurrentlyDisplayedTimer = setTimeout(() => {
        msgCurrentlyDisplayed = false;
        elementToDisplay.classList.add(D_NONE_FADEOUT);
    }, ttl);
}
function hideCaptureInstructions() {
    videoInstructionMsgOverlays.forEach((overlay) => !overlay.classList.contains(D_NONE_FADEOUT) && overlay.classList.add(D_NONE_FADEOUT));
    videoLoadingMsgOverlays.forEach((overlay) => !overlay.classList.contains(D_NONE_FADEOUT) && overlay.classList.add(D_NONE_FADEOUT));
}
/**
 PositionInfo are :
 TRACKER_POSITION_INFO_GOOD
 TRACKER_POSITION_INFO_MOVE_BACK_INTO_FRAME
 TRACKER_POSITION_INFO_CENTER_MOVE_BACKWARDS
 TRACKER_POSITION_INFO_CENTER_MOVE_FORWARDS
 TRACKER_POSITION_INFO_CENTER_TURN_RIGHT
 TRACKER_POSITION_INFO_CENTER_TURN_LEFT
 TRACKER_POSITION_INFO_CENTER_ROTATE_UP
 TRACKER_POSITION_INFO_CENTER_ROTATE_DOWN
 TRACKER_POSITION_INFO_MOVING_TOO_FAST
 TRACKER_POSITION_INFO_CENTER_TILT_RIGHT
 TRACKER_POSITION_INFO_CENTER_TILT_LEFT
 TRACKER_POSITION_INFO_MOVE_DARKER_AREA
 TRACKER_POSITION_INFO_MOVE_BRIGHTER_AREA
 TRACKER_POSITION_INFO_STAND_STILL
 TRACKER_POSITION_INFO_OPEN_EYES
 TRACKER_POSITION_INFO_CENTER_MOVE_LEFT
 TRACKER_POSITION_INFO_CENTER_MOVE_RIGHT
 TRACKER_POSITION_INFO_CENTER_MOVE_UP
 TRACKER_POSITION_INFO_CENTER_MOVE_DOWN
 TRACKER_POSITION_INFO_UNKNOWN
 */
function handlePositionInfo(trackingInfo) {
    let logText = 'Tracking info: ';
    // Text instruction management
    if (trackingInfo.positionInfo) {
        logText = logText + 'Position info is: ' + trackingInfo.positionInfo + '. ';
        switch (trackingInfo.positionInfo) {
            case 'TRACKER_POSITION_INFO_CENTER_MOVE_BACKWARDS': // Move away from the camera
                displayMsgAndCircle(moveFurtherMsg, trackingInfo);
                break;
            case 'TRACKER_POSITION_INFO_CENTER_MOVE_FORWARDS': // Move closer to the camera
                displayMsgAndCircle(moveCloserMsg, trackingInfo);
                break;
            case 'TRACKER_POSITION_INFO_GOOD':
            case 'TRACKER_POSITION_INFO_STAND_STILL':
                if (trackingInfo.targetInfo && trackingInfo.targetInfo.stability && trackingInfo.targetInfo.stability > 0) {
                    displayMsgAndCircle(scanningMsg, trackingInfo);
                } else if (trackingInfo.positionInfo === 'TRACKER_POSITION_INFO_GOOD') {
                    displayMsgAndCircle(dontMoveMsg, trackingInfo);
                } else {
                    displayMsgAndCircle(headStartPositionOutline, trackingInfo);
                }
                break;
            default:
                displayMsgAndCircle(headStartPositionOutline, trackingInfo);
                break;
        }
    } else {
        logText = logText + 'No position info.';
        displayMsgAndCircle(headStartPositionOutline, trackingInfo);
    }
    if (trackingInfo.targetInfo) {
        if (trackingInfo.targetInfo.targetR) {
            logText = logText + 'Radius: ' + trackingInfo.targetInfo.targetR + '. ';
        }
        // Circle Animation management
        if (trackingInfo.targetInfo.stability && trackingInfo.targetInfo.stability > 0) {
            logText = logText + 'Stability: ' + trackingInfo.targetInfo.stability;
        }
    }
    console.log(logText);
}

// TODO read these values from css file
const progressBarColor = '#430099';
const progressBarBackgroundColor = '#D1C4E3';

/**
 * @param {string|number} progress
 */
function setDownloadProgress(progress) {
    setProgress(downloadingProgress, progress);
}

/**
 * @param {string|number} progress
 */
function setUploadProgress(progress) {
    setProgress(uploadingProgress, progress);
}

/**
 * @param {Element} element Parent HTML element of the progress bar
 * @param {string|number} progress the value of the progress to display
 */
function setProgress(element, progress) {
    progress = Number(progress * 100).toFixed(0);
    element.querySelector('.progress-spinner').style.background = `conic-gradient(${progressBarColor} ${progress}%,${progressBarBackgroundColor} ${progress}%)`;
    element.querySelector('.middle-circle').innerHTML = `${progress}%`;
}

/**
 * Send another image to match with video best image
 * @param basePath {string}
 * @param sessionId {string}
 * @param bestImageId {string}
 * @param selfieImage {string}
 * @return {Promise<void>}
 */
async function pushFaceAndDoMatch(basePath, sessionId, bestImageId, selfieImage) {
    try {
        hideAllSteps();
        // Show loading screen
        document.getElementById('loading').classList.remove(D_NONE);
        const reference = await commonutils.createFace(basePath, sessionId, selfieImage);
        const matches = await commonutils.getMatches(basePath, sessionId, bestImageId, reference.faceId);
        // Hide all steps (and loading screen)
        document.querySelectorAll('.step').forEach((step) => step.classList.add(D_NONE));
        if (matches.matching === 'ok') {
            if (ageEstimationEnabled) {
                processStep(ID_STEP_AGE_ESTIMATION, 0, {
                    referenceImage: selfieImage,
                    referenceImageInfo: reference.imageInfo
                });
                return;
            }
            const matchingOKDescription = document.querySelector('#step-selfie-ok .description');
            if (matchingOKDescription) {
                // eslint-disable-next-line no-undef
                matchingOKDescription.innerHTML = __('Matching succeeded <br> score: ') + matches.score;
            }
            document.querySelector('#step-selfie-ok').classList.remove(D_NONE);
        } else {
            document.querySelector('#step-selfie-ko').classList.remove(D_NONE);
            const matchingNOKDescription = document.querySelector('#step-selfie-ko .description');
            if (matches.score && matchingNOKDescription) {
                // eslint-disable-next-line no-undef
                matchingNOKDescription.innerHTML = __('Matching failed <br> score: ') + matches.score || '';
            }
        }
        console.log(matches);
    } catch (ex) {
        // if an error happen during createFace or getMatches
        console.error(ex);
        document.querySelectorAll('.step').forEach((step) => step.classList.add(D_NONE));
        document.querySelector('#step-selfie-ko').classList.remove(D_NONE); // Should be technical issue
        const matchingNOKDescription = document.querySelector('#step-selfie-ko .description');
        if (matchingNOKDescription) {
            matchingNOKDescription.innerHTML = 'Matching failed';
        }
    }
};
