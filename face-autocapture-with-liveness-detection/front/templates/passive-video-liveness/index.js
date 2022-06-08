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

/* global BASE_PATH, VIDEO_URL, VIDEO_BASE_PATH, DISABLE_CALLBACK, DEMO_HEALTH_PATH, IDPROOFING, BioserverVideo, BioserverNetworkCheck, BioserverVideoUI __ */
/* eslint-disable no-console */
const commonutils = require('../../utils/commons');

const ID_SOCKET_INIT = '#socket-init';
const ID_STEP_LIVENESS = '#step-liveness';
const D_NONE_FADEOUT = 'd-none-fadeout';
const CLASS_SIGNAL_VALUE = '.signal-value';
const CLASS_MIN_SIGNAL_VALUE = '.signal-min-value';

const ID_CONNECTIVITY_CHECK = '#connectivity-check';
const VIDEO_ID = 'user-video';
const BEST_IMG_ID = 'best-image';
const BEST_IMG_IPV_ID = 'best-image-ipv';
const bestImageIPV = document.querySelector('#' + BEST_IMG_IPV_ID);
const getIPVStatus = document.querySelector('#get-ipv-status-result');
const connectivityCheck = document.querySelector(ID_CONNECTIVITY_CHECK);
const socketInitDocument = document.querySelector(ID_SOCKET_INIT);
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
const loadingChallenge = document.querySelector('#loading-challenge');
const loadingInitialized = document.querySelector('#loading-initialized');
const loadingResults = document.querySelector('#loading-results');

const selfieInput = document.querySelector('#selfieInput');
const weakNetworkCheckPage = document.querySelector('#step-weak-network');
const goodNetworkCheckPage = document.querySelector('#step-good-network');
const videoLoadingMsgOverlays = document.querySelectorAll('#step-liveness .video-overlay');
const videoInstructionMsgOverlays = document.querySelectorAll('#step-liveness .move-message');

let timeoutCheckConnectivity; // settimeout used to stop if network event received
let connectivityOK = false;
let client; // let start & stop face capture
let videoStream; // user video camera stream
let sessionId; // current sessionId
let bestImageId; // best image captured from user video stream
let cameraPermissionAlreadyAsked;
let identityId;
let initCalled; // used to avoid double call to init
let bestImageInfo;
const urlParams = new URLSearchParams(window.location.search); // let you extract params from url
const isMatchingEnabled = urlParams.get('enableMatching') === 'true';


const sessionIdParam = urlParams.get('sessionId');
const identityIdParam = urlParams.get('identityId');

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
 * 2- init the communication with the server via webrtc & socket
 * 3- get liveness result (from backend)
 * 4- [Optional] ask the end user to push his reference image (post to backend)
 * 5- [Optional] get the matching result between the best image from webRTC and the reference image
 */

// call getCapabilities from demo-server which will call with apikey the endpoint from video-server
commonutils.getCapabilities(basePath, healthPath).then(
    (response) => {
        if (response && response.version) {
            monitoring.forEach((element) => { element.innerHTML = `${response.version}`; });
        }
    }
).catch(() => {
    stopVideoCaptureAndProcessResult(false, 'Service unavailable');
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

async function init(options = {}) {
    if (initCalled) {
        return;
    }
    // Disconnect any existing client
    if (client) {
        client.disconnect();
    }
    client = undefined;
    initCalled = true;
    videoOutput.disablePictureInPicture = true;

    // request a sessionId from backend (if we are switching camera we use the same session)
    if (!sessionId || !options.switchCamera) {
        try {
            const session = await commonutils.initLivenessSession(basePath, sessionIdParam || '', identityIdParam || '');
            sessionId = session.sessionId;
            identityId = session.identityId;
        } catch (err) {
            clearTimeout(timeoutCheckConnectivity);
            initCalled = false; // force init next time
            sessionId = false;
            await stopVideoCaptureAndProcessResult(false, __('Failed to initialize session'));
        }
    }
    if (!sessionId) {
        return;
    }
    // initialize the face capture client with callbacks
    let challengeInProgress = false;
    const faceCaptureOptions = {
        bioSessionId: sessionId,
        identityId,
        onClientInitEnd: () => {
            console.warn('init ended');
            loadingInitialized.classList.add(D_NONE_FADEOUT); // initialization successfully, remove loading for video
            headStartPositionOutline.classList.remove(D_NONE_FADEOUT);
            stopCapture.classList.remove(D_NONE_FADEOUT); // display
            BioserverVideoUI.initPassiveVideoGraphics(VIDEO_ID);
        },
        showChallengeInstruction: (challengeInstruction) => {
            if (challengeInstruction === 'TRACKER_CHALLENGE_PENDING') {
                // pending ==> display waiting msg meanwhile the showChallengeResult callback is called with result
                challengeInProgress = false;
                videoInstructionMsgOverlays.forEach((overlay) => overlay.classList.add(D_NONE_FADEOUT));
                videoLoadingMsgOverlays.forEach((overlay) => overlay.classList.add(D_NONE_FADEOUT));
                loadingChallenge.classList.remove(D_NONE_FADEOUT);
                stopCapture.classList.add(D_NONE_FADEOUT); // remove
            } else { // challengeInstruction == TRACKER_CHALLENGE_DONT_MOVE
                challengeInProgress = true;
            }
        },
        showChallengeResult: async (result) => {
            console.log('Liveness Challenge done > requesting result ...', result);
            resetLivenessDesign();
            hideAllSteps();
            loadingResults.classList.remove(D_NONE);
            bestImageInfo = result && result.bestImageInfo; // store best image info to be used to center the image when it'll be displayed
            const livenessResult = await commonutils.getLivenessChallengeResult(basePath, enablePolling, sessionId)
                .catch(() => stopVideoCaptureAndProcessResult(false, __('Failed to retrieve liveness results')));
            console.log('Liveness result : ' + livenessResult.message, livenessResult);
            // result.diagnostic not currently set as last param of stopVideoCaptureAndProcessResult(), as we need to know the impact of displaying it to the user
            if (livenessResult) {
                stopVideoCaptureAndProcessResult(livenessResult.isLivenessSucceeded, livenessResult.message, livenessResult.bestImageId);
            }
            if (client) {
                videoOutput.srcObject = null;
                client.disconnect();
            }
        },
        trackingFn: (trackingInfo) => {
            displayInstructionsToUser(trackingInfo, challengeInProgress);
        },
        errorFn: (error) => {
            clearTimeout(timeoutCheckConnectivity);
            initCalled = false; // force init next time
            console.log('got error', error);
            challengeInProgress = false;
            if (error.code && error.code === 429) { //  enduser is blocked
                // we reset the session when we finished the liveness check real session
                resetLivenessDesign();
                userBlockInterval(new Date(error.unlockDateTime).getTime());
                displayStep('#step-liveness-fp-block');
            } else {
                stopVideoCaptureAndProcessResult(false, __('Sorry, there was an issue.'));
            }
            if (client) {
                videoOutput.srcObject = null;
                client.disconnect();
            }
        }
    };
    faceCaptureOptions.wspath = videoBasePath + '/engine.io';
    faceCaptureOptions.bioserverVideoUrl = videoUrl;
    faceCaptureOptions.rtcConfigurationPath = videoUrlWithBasePath + '/coturnService?bioSessionId=' + encodeURIComponent(sessionId);
    
    client = await BioserverVideo.initFaceCaptureClient(faceCaptureOptions);
}

async function initStream(options = {}) {
    initLivenessDesign();
    if (client) {
        // get user camera video (front camera is default)
        videoStream = await BioserverVideo.getMediaStream({ videoId: VIDEO_ID, video: { deviceId: options.deviceId } })
            .catch((e) => {
                let msg = __('Failed to get camera device stream');
                let extendedMsg;
                if (e.name && e.name.indexOf('NotAllowed') > -1) {
                    msg = __('You denied camera permissions, either by accident or on purpose.');
                    extendedMsg = __('In order to use this demo, you need to enable camera permissions in your browser settings or in your operating system settings.');
                }
                stopVideoCaptureAndProcessResult(false, msg, '', extendedMsg);
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

/**
 * Get GIPS Transaction Button activated
 **/
getIpvTransactionButton.addEventListener('click', async () => {
    console.log('calling getGipsStatus with identityId=' + identityId);
    getIPVStatus.innerHTML = '';
    const result = await commonutils.getGipsStatus(basePath, identityId);
    console.log('result IPV response' + result);
    getIPVStatus.innerHTML = JSON.stringify(result, null, 4);
    getIPVStatus.classList.remove(D_NONE);
});

/**
 * Get GIPS Transaction Button activated
 **/
getIpvPortraitButton.addEventListener('click', async () => {
    console.log('calling getIpvPortraitButton ');
    // bestImageIPV.src = '';
    const faceImg = await commonutils.getFaceImage(basePath, sessionId, bestImageId);
    // bestImageIPVbestImageURL = window.URL.createObjectURL(faceImg);
    // bestImageIPV.src = `${bestImageURL}`;
    BioserverVideoUI.displayBestImage(faceImg, bestImageInfo, BEST_IMG_IPV_ID);
    bestImageIPV.classList.remove(D_NONE);
    /* console.log('centering best image with info ', bestImageInfo);
    const { w, boxX, boxY, boxW, boxH } = bestImageInfo;
    const sizeCoeff = bestImgElement.offsetWidth / boxW;
    bestImgElement.style.backgroundSize = (w * sizeCoeff).toFixed() + 'px';
    // adjust Y position to fit oval shape ( oval form ==>  height = width x 1.3)
    // as height is 30% bigger so we center face on Y axis by adding the half of the 30% of surface that exceeds
    bestImgElement.style.backgroundPositionY = -((boxY - 0.3 * boxH / 2) * sizeCoeff).toFixed() + 'px';
    bestImgElement.style.backgroundPositionX = -(boxX * sizeCoeff).toFixed() + 'px';
    */
});

// when next button is clicked go to targeted step
document.querySelectorAll('*[data-target]')
    .forEach((btn) => btn.addEventListener('click', async () => {
        const targetStepId = btn.getAttribute('data-target');
        await processStep(targetStepId, btn.hasAttribute('data-delay') && (btn.getAttribute('data-delay') || 2000))
            .catch(() => stopVideoCaptureAndProcessResult(false));
    }));

function processTargetStep(targetStepId, displayWithDelay) {
    const targetStep = document.querySelector(targetStepId);
    targetStep.classList.remove(D_NONE);
    const targetStepFooter = targetStep.querySelector('.footer');
    if (targetStepFooter) {
        targetStepFooter.classList.add(D_NONE);
        if (displayWithDelay) {
            // display next button after few seconds
            setTimeout(() => targetStepFooter.classList.remove(D_NONE), displayWithDelay);
        } else {
            targetStepFooter.classList.remove(D_NONE);
        }
    }
}
async function processStep(targetStepId, displayWithDelay) {
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
        initCalled = false; // if we come to this page, we reinitialise the initCalled to false so that next call to init is forced
    } else if (targetStepId === '#step-1-restore') {
        // We come from the tutorial or another step where we 'restore' the initial step (without forcing init call)
        scrollTo(0, 0);
        targetStepId = '#step-1';
    } else if (targetStepId === ID_CONNECTIVITY_CHECK) { // << if client clicks on start capture or start training
        if (!connectivityOK) { // bypass this waiting time if we are still here 5 seconds
            connectivityCheck.classList.remove(D_NONE);
            timeoutCheckConnectivity = setTimeout(() => {
                processStep(targetStepId, displayWithDelay);
            }, 1000); // call this method until we got the results from the network connectivity
        } else {
            targetStepId = ID_SOCKET_INIT; // connectivity check done/failed, move to the next step
        }
    }
    if (targetStepId === ID_SOCKET_INIT) { // << if client clicks on start capture or retry
        init(); // this call will be ignored if init was previously called
        if (!client) {
            // waits until the client was initialized
            socketInitDocument.classList.remove(D_NONE);
            timeoutCheckConnectivity = setTimeout(() => {
                processStep(targetStepId, displayWithDelay);
            }, 1000); // call this method until we got the results from the network connectivity
        } else {
            targetStepId = ID_STEP_LIVENESS; // init socket done, move to the next step
        }
    }
    // Liveness page
    if (targetStepId === ID_STEP_LIVENESS) { // << if client clicks on start capture && socket initialisation is already done
        if (!cameraPermissionAlreadyAsked) {
            cameraPermissionAlreadyAsked = true;
            displayWithDelay = null; // no delay applied to show the button
            targetStepId = '#step-access-permission';
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

/**
 * suspend video camera and return result
 */
async function stopVideoCaptureAndProcessResult(success, msg, faceId = '', _) {
    console.log('Stop video capture: message=' + msg + 'reset-animations, success=' + success);
    bestImageId = faceId;
    // we reset the session when we finished the liveness check real session
    resetLivenessDesign();
    hideAllSteps();
    // Liveness is successful
    if (success) {
        if (!idProofingWorkflow) {
            // display loader while loading best image
            loadingResults.classList.remove(D_NONE);
            const faceImg = await commonutils.getFaceImage(basePath, sessionId, faceId);
            document.querySelector('#step-liveness-ok').classList.remove(D_NONE);
            document.querySelectorAll('#step-liveness-ok button').forEach((btn) => btn.classList.add(D_NONE));
            document.querySelector('.success-no-ipv').classList.remove(D_NONE);
            loadingResults.classList.add(D_NONE);
            BioserverVideoUI.displayPassiveVideoBestImage(faceImg, bestImageInfo, BEST_IMG_ID);
        } else {
            document.querySelector('#step-liveness-ok').classList.remove(D_NONE);
            document.querySelectorAll('#step-liveness-ok button').forEach((btn) => btn.classList.add(D_NONE));
            document.querySelector('.success-ipv').classList.remove(D_NONE);
            document.querySelector('#get-ipv-transaction').classList.remove(D_NONE);
            document.querySelector('#get-ipv-portrait').classList.remove(D_NONE);
        }
        const nextButton = isMatchingEnabled ? 'next-step' : 'reset-step';

        document.querySelectorAll(`#step-liveness-ok button.${nextButton}`).forEach((step) => step.classList.remove(D_NONE));

        // Liveness goes until timeout, maybe face is not detected
    } else if (msg && (msg.indexOf('Timeout') > -1)) {
        document.querySelector('#step-liveness-timeout').classList.remove(D_NONE);
        setTimeout(() => {
            document.querySelector('#step-liveness-timeout .footer').classList.remove(D_NONE);
        }, 2000);

        // Liveness fails
    } else if (msg && (msg.indexOf('Liveness failed') > -1)) {
        document.querySelector('#step-liveness-ko').classList.remove(D_NONE);
        // Technical issue
    } else if (msg && (msg.indexOf('You denied camera permissions') > -1)) {
        document.querySelector('#step-No-camera-access').classList.remove(D_NONE);
        // No-camera-access issue
    } else {
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
    videoInstructionMsgOverlays.forEach((overlay) => overlay.classList.add(D_NONE_FADEOUT));
    videoLoadingMsgOverlays.forEach((overlay) => overlay.classList.add(D_NONE_FADEOUT));
    loadingInitialized.classList.remove(D_NONE_FADEOUT); // display loading until initialization is done
    BioserverVideoUI.stopPassiveVideoAnimation();
}

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

function hideAllSteps() {
    document.querySelectorAll('.step').forEach(step => step.classList.add(D_NONE));
}

function displayStep(step) {
    hideAllSteps();
    typeof step === 'string' ? document.querySelector(step).classList.remove(D_NONE) : step.classList.remove(D_NONE);
}
/**
 * display messages to user during capture (eg: move closer, center your face ...)
 * @param trackingInfo face tracking info
 * @param challengeInProgress challenge has started?
 * @param trainingMode training mode enabled ?
 */
let headAnimationOn;
let headAnimationOff;
let userInstructionMsgDisplayed;
let userInstructionMsgToDisplay;

function displayInstructionsToUser(trackingInfo, challengeInProgress) {
    if (challengeInProgress || userInstructionMsgDisplayed) {
        return;
    }

    // Tracking : Keep your phone vertical
    if (trackingInfo.phoneNotVertical) { // << user phone not up to face
        videoInstructionMsgOverlays.forEach((overlay) => overlay.classList.add(D_NONE_FADEOUT));
        videoLoadingMsgOverlays.forEach((overlay) => overlay.classList.add(D_NONE_FADEOUT));
        phoneNotVerticalMsg.classList.remove(D_NONE_FADEOUT);
        if (userInstructionMsgToDisplay) {
            userInstructionMsgToDisplay = window.clearTimeout(userInstructionMsgToDisplay);
        }
        userInstructionMsgToDisplay = window.setTimeout(() => {
            userInstructionMsgToDisplay = false;
        }, 3000);
        // Tracking : User position
    } else {
        videoInstructionMsgOverlays.forEach((overlay) => overlay.classList.add(D_NONE_FADEOUT));
        videoLoadingMsgOverlays.forEach((overlay) => overlay.classList.add(D_NONE_FADEOUT));
        handlePositionInfo(trackingInfo);
    }
}

document.querySelector('#takeMyPickture').addEventListener('click', () => {
    selfieInput.click();
});
selfieInput.addEventListener('change', (e) => {
    commonutils.pushFaceAndDoMatch(basePath, sessionId, bestImageId, e.target.files[0]);
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
    displayStep(weakNetworkCheckPage);
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
                displayStep(goodNetworkCheckPage);
                displayGoodSignal = false;
                connectivityOK = true; // connectivity results retrieved enough (page displayed)
                // calling init function right after network check success
                init();
            } else {
                connectivityOK = true; // connectivity results retrieved enough
                // calling init function right after network check success
                init();
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
    elementToDisplay.classList.remove(D_NONE_FADEOUT); // add
    BioserverVideoUI.displayPassiveVideoAnimation(trackingInfo);
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
    let logText = 'Tracking info : ';
    // Text instruction management
    if (trackingInfo.positionInfo) {
        logText = logText + 'Position info is ... ' + trackingInfo.positionInfo + '. ';
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
        logText = logText + 'No position info. ';
        displayMsgAndCircle(headStartPositionOutline, trackingInfo);
    }
    if (trackingInfo.targetInfo.targetR) {
        logText = logText + 'Radius ... ' + trackingInfo.targetInfo.targetR + '. ';
    }
    // Circle Animation management
    if (trackingInfo.targetInfo && trackingInfo.targetInfo.stability && trackingInfo.targetInfo.stability > 0) {
        logText = logText + 'Stability ... ' + trackingInfo.targetInfo.stability;
    }
    console.log(logText);
}
