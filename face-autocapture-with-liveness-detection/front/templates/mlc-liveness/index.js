/*
Copyright 2025-2026 IDEMIA Public Security
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

// this file is the main program that uses video server api for mlc liveness

/* global BASE_PATH, VIDEO_URL, VIDEO_BASE_PATH, DISABLE_CALLBACK, DEMO_HEALTH_PATH, IDPROOFING, BioserverVideo, BioserverNetworkCheck, BioserverVideoUI, __ */
/* eslint-disable no-console */
const commonutils = require('../../utils/commons');
const { userBlockInterval } = require('../../utils/commons');

const ID_SOCKET_INIT = '#socket-init';
const ID_STEP_ACCESS_PERMISSION = '#step-access-permission';
const ID_STEP_LIVENESS = '#step-liveness';
const ID_STEP_CONTINUE_LIVENESS = '#step-continue-liveness';
const ID_STEP_LIVENESS_OK = '#step-liveness-ok';
const ID_STEP_LUMINOSITY_KO = '#step-luminosity-ko';
const ID_START_ILLUMINATION = '#start-illumination';

const D_NONE_FADEOUT = 'd-none-fadeout';

const ID_CONNECTIVITY_CHECK = '#connectivity-check';
const VIDEO_ID = 'user-video';
const BEST_IMG_ID = 'best-image';

const connectivityCheck = document.querySelector(ID_CONNECTIVITY_CHECK);
const socketInit = document.querySelector(ID_SOCKET_INIT);
const stepLiveness = document.querySelector(ID_STEP_LIVENESS);
const videoOutput = document.querySelector('#' + VIDEO_ID);

const D_NONE = 'd-none';
const D_NONE_VISIBLE = 'invisible';

// TODO read these values from css file
const progressBarColor = '#430099';
const progressBarBackgroundColor = '#D1C4E3';

const monitoring = document.querySelectorAll('.monitoring');

const headStartPositionOutline = document.querySelector('#center-head-animation');

// list of MLC animation
const keepSmilingMsg = document.querySelector('#keep-smile-animation');
const moveDarkerArea = document.querySelector('#move-darker-area-animation');
const moveCloserMsg = document.querySelector('#move-closer-animation');
const moveFurtherMsg = document.querySelector('#move-further-animation');
const makeNeutralExpressionMsg = document.querySelector('#make-neutral-expression-animation');
const makeSmileMsg = document.querySelector('#make-smile-animation');
const noSmileMsg = document.querySelector('#no-smile-animation');
const makeMoreSmileMsg = document.querySelector('#make-more-smile-animation');
const faceCameraMsg = document.querySelector('#face-camera-animation');
const noFaceMsg = document.querySelector('#no-face-animation');
const holdStillMsg = document.querySelector('#hold-still-illumination-animation');

const phoneNotVerticalMsg = document.querySelector('#phone-not-vertical-animation');
const illuminationTutoMsg = document.querySelector('#illumination-tuto-animation');
const loadingInitialized = document.querySelector('#loading-initialized');
const loadingResults = document.querySelector('#loading-results');

const videoOverlays = document.querySelectorAll('#step-liveness .video-overlay');
const feedbackOverlays = document.querySelectorAll('#step-liveness .feedback-overlay');

const uploadingLoader = document.querySelector('#uploading-results');
const uploadingInfinite = uploadingLoader.querySelector('#uploading-infinite');
const uploadingProgress = uploadingLoader.querySelector('#uploading-progress');

const initLoader = document.querySelector('#init-loader');
const downloadingLoader = document.querySelector('#downloading-loader');
const downloadingProgress = document.querySelector('#downloading-progress');
const captureFooter = document.querySelector('#step-liveness .footer');
const illuminationTutorialFooter = document.querySelector('#step-liveness .tutorial-footer');

// the goal is to display a specific message to the user that didn't smile for more than 3sec
// once the user smiles; we reset this flag
let noSmileForWhile;
let noSmileForWhileTimer;
const NO_SMILE_MAX_DURATION = 3_000; // 3sec
//
const LUMINOSITY_KO_MAX_COUNT = 2;
// Number of luminosity check failed
let luminosityKoCount = 0;

const LivenessDiagnostic = {
    MOVEMENT_DURING_ILLUMINATION: 'User moved during illumination',
    TOO_BRIGHT: 'Too much brightness',
    NO_FACE_DETECTED: 'No face detected'
};

// ID_PROOFING specific
const BEST_IMG_IPV_ID = 'best-image-ipv';
const getIpvStatus = document.querySelector('#get-ipv-status-result');
const getIpvTransactionButton = document.querySelector('#get-ipv-transaction');
const getIpvPortraitButton = document.querySelector('#get-ipv-portrait');
const getIPVStatus = document.querySelector('#get-ipv-status-result');
const bestImageIPV = document.querySelector('#' + BEST_IMG_IPV_ID);

// fetch the boolean configuration defining if the demo is using idproofing
const idProofingWorkflow = IDPROOFING;
let identityId;
let bestImageId;

const { hideAllStepsAndDisplay, hideAllSteps } = commonutils;

const networkContext = { connectivityOK: false, timeoutCheckConnectivity: undefined };
let client; // let start & stop face capture
let videoStream; // user video camera stream
let sessionId; // current sessionId
let cameraPermissionAlreadyAsked;
let bestImageInfo;
let faceImg;
let msgCurrentlyDisplayed = false;
let msgCurrentlyDisplayedTimer;
let smileCompleted = false;

const urlParams = new URLSearchParams(window.location.search); // let you extract params from url

const sessionIdParam = urlParams.get('sessionId');
const identityIdParam = urlParams.get('identityId');

const basePath = BASE_PATH;
const videoBasePath = VIDEO_BASE_PATH;
const videoUrl = VIDEO_URL;
const enablePolling = !DISABLE_CALLBACK;
const healthPath = DEMO_HEALTH_PATH;

// Call getCapabilities from demo-server which will call the endpoint from video-server with apikey
// it verifies that all services are available
commonutils.getCapabilities(basePath, healthPath).then(response => {
    console.log('getMonitoring ok', response);
    if (response?.version) {
        monitoring.forEach((element) => { element.innerHTML = `${response.version}`; });
    }
}).catch(async (err) => {
    console.error(err);
    await stopVideoCaptureAndProcessResult({ isLivenessSucceeded: false, message: 'Service unavailable' });
});

// Network speed check
window.onload = () => {
    commonutils.initializeNetworkCheck(client, resetLivenessDesign, networkContext);
};

// Demo landing page
document.querySelector('#step-1-anim').id = 'step-1';
if (document.querySelector('#step-1')) {
    window.envBrowserOk && document.querySelector('#step-1').classList.remove(D_NONE);
}

/**
 * Display different depending on the current step
 */
async function processStep(targetStepId, displayWithDelay) {
    // hide all steps to show only the target step
    hideAllSteps();
    // hide ipv info
    bestImageIPV.classList.add(D_NONE);
    getIPVStatus.classList.add(D_NONE);
    // landing screen
    if (targetStepId === '#step-1') {
        scrollTo(0, 0);
    } else if (targetStepId === '#step-1-restore') {
        // We come from the tutorial or another step where we 'restore' the initial step (without forcing init call)
        scrollTo(0, 0);
        targetStepId = '#step-1';
    } else if (targetStepId === ID_CONNECTIVITY_CHECK) { // << if client clicks on start capture
        if (!networkContext.connectivityOK) { // bypass this waiting time if we are still here 5 seconds
            connectivityCheck.classList.remove(D_NONE);
            networkContext.timeoutCheckConnectivity = setTimeout(() => {
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
        downloadingLoader.classList.add(D_NONE);
        await initClient();
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
            await startLuminosityCheck();
            return;
        }
    }
    // luminosity too bright error
    if (targetStepId === ID_STEP_LUMINOSITY_KO) {
        // increment luminosity ko count
        luminosityKoCount++;
    }
    // when validate the LUMINOSITY_KO screen
    if (targetStepId === ID_STEP_CONTINUE_LIVENESS) {
        stepLiveness.classList.remove(D_NONE);
        // show basic capture instruction
        hideCaptureInstructions();
        // hide instruction if shown because of luminosity check,
        displayMsg(headStartPositionOutline, true, 2000);
        await startLuminosityCheck(3000);
        return;
    }
    if (targetStepId === ID_START_ILLUMINATION) {
        stepLiveness.classList.remove(D_NONE);
        illuminationTutorialFooter.classList.add(D_NONE_VISIBLE);
        illuminationTutoMsg.classList.add(D_NONE_FADEOUT);
        startIlluminationPhase();
        return;
    }

    // show step if not yet done and configure button with delay
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

/**
 * Reset video capture elements
 * Called at the end of each liveness session
 */
function resetLivenessDesign() {
    document.querySelector('header').classList.remove(D_NONE);
    // reset mlc specific graphic
    BioserverVideoUI.resetMlcGraphics();
    BioserverVideoUI.resetBestImage();

    // capture specific
    smileCompleted = false;
}

/**
 * Init FaceCaptureOptions and FaceCaptureClient
 */
async function initClient() {
    // Disconnect any existing client
    if (client) {
        client.disconnect();
    }
    client = undefined;
    videoOutput.disablePictureInPicture = true;

    // Request a sessionId from backend
    try {
        const session = await commonutils.initLivenessSession(basePath, sessionIdParam || '', identityIdParam || '');
        sessionId = session.sessionId;
        identityId = session.identityId;
    } catch (err) {
        console.error(err);
        clearTimeout(networkContext.timeoutCheckConnectivity);
        sessionId = null;
        const msg = err.status === 429 ? 'Server overloaded' : __('Failed to initialize session');
        await stopVideoCaptureAndProcessResult({ isLivenessSucceeded: false, message: msg });
    }
    if (!sessionId) {
        return;
    }
    // initialize the face capture client with callbacks
    let challengeInProgress = false;
    const faceCaptureOptions = {
        bioSessionId: sessionId,
        onClientInitEnd: () => {
            console.log('onClientInitEnd');
            loadingInitialized.classList.add(D_NONE_FADEOUT); // initialization successfully, remove loading for video
            headStartPositionOutline.classList.remove(D_NONE_FADEOUT);
        },
        showChallengeInstruction: (challengeInstruction) => {
            console.log(`challenge instruction = ${challengeInstruction}`);
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
            } else if (challengeInstruction === 'TRACKER_ILLUMINATION_PENDING') {
                // smile has been completed
                if (!smileCompleted) {
                    // clear current message to display first instruction after the smile
                    clearTimeout(msgCurrentlyDisplayedTimer);
                    msgCurrentlyDisplayed = false;
                }
                // smile have been detected, displaying tutorial
                smileCompleted = true;
                clearNoSmileTimeout();

                displayIlluminationTutorial();
            } else { // challengeInstruction == TRACKER_CHALLENGE_DONT_MOVE
                challengeInProgress = true;
            }
        },
        showChallengeResult: async (result) => {
            console.log('Liveness Challenge done > requesting result...', result);
            resetLivenessDesign();
            hideAllStepsAndDisplay(loadingResults);
            bestImageInfo = result && result.bestImageInfo; // store best image info to be used to center the image when it'll be displayed
            const livenessResult = await commonutils.getLivenessChallengeResult(basePath, enablePolling, sessionId)
                .catch(async () => await stopVideoCaptureAndProcessResult({ isLivenessSucceeded: false, message: __('Failed to retrieve liveness results') }));
            console.log('Liveness result: ' + livenessResult.message, livenessResult);
            if (client) {
                videoOutput.srcObject = null;
                client.disconnect();
            }
            // result.diagnostic not currently set as last param of stopVideoCaptureAndProcessResult(), as we need to know the impact of displaying it to the user
            if (livenessResult) {
                await stopVideoCaptureAndProcessResult(livenessResult);
            }
        },
        showLuminosityCheckResult: (status) => {
            console.log(`>> showLuminosityCheckResult: ${status}`);
            switch (status) {
                case 'NOT_GOOD':
                    console.log('luminosity verified but not good');
                    if (luminosityKoCount >= LUMINOSITY_KO_MAX_COUNT) {
                        console.log('Luminosity check failed: lighting conditions are not sufficient.');
                        startVideoCapture();
                    } else {
                        processStep(ID_STEP_LUMINOSITY_KO);
                    }
                    break;
                case 'GOOD':
                    console.log('luminosity verified and good');
                    startVideoCapture();
                    break;
                case 'TIMEOUT':
                    console.log('Timeout during check luminosity: user not correctly aligned with the camera.');
                    startVideoCapture();
                    break;
                default:
                    console.log('status not handled');
                    break;
            }
        },
        trackingFn: (trackingInfo) => {
            displayInstructionsToUser(trackingInfo, challengeInProgress);
        },
        errorFn: async (error) => {
            clearTimeout(networkContext.timeoutCheckConnectivity);
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
                await stopVideoCaptureAndProcessResult({ isLivenessSucceeded: false, message: __('Sorry, there was an issue.') });
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
    // initialize the smile progress bar
    BioserverVideoUI.prepareSmileProgress('.smile-progress-bar');
}

/*
 * Init the video stream with WebSDK API
 */
async function initStream() {
    hideCaptureInstructions();
    // display loading until initialization is done
    loadingInitialized.classList.remove(D_NONE_FADEOUT);
    if (client) {
        // get user camera video (front camera is default)
        videoStream = await BioserverVideo.getMediaStream({ videoId: VIDEO_ID })
            .catch(async (e) => {
                let msg = __('Failed to get camera device stream');
                if (e.name && e.name.indexOf('NotAllowed') > -1) {
                    msg = __('You denied camera permissions, either by accident or on purpose.');
                }
                await stopVideoCaptureAndProcessResult({ isLivenessSucceeded: false, message: msg, bestImageId: '' });
            });
        if (!videoStream) {
            videoOutput.srcObject = null;
            client.disconnect();
            return;
        }
        // display the video stream
        videoOutput.srcObject = videoStream;

        // init capture oval
        BioserverVideoUI.initMlcGraphics(videoOutput);
    }
}

async function startVideoCapture() {
    // show basic capture instruction
    hideCaptureInstructions();
    // start capture
    if (client && videoStream) {
        // check luminosity
        await client.startCapture({ stream: videoStream });
    } else {
        // hide step liveness as video stream could not be started
        stepLiveness.classList.add(D_NONE);
        console.log('client or videoStream not available, start aborted');
    }
}

async function startLuminosityCheck(badLuminosityMaxDuration) {
    if (client && videoStream) {
        // check luminosity
        await client.checkLuminosity({ badLuminosityMaxDuration });
    } else {
        // hide step liveness as video stream could not be started
        stepLiveness.classList.add(D_NONE);
        console.log('client or videoStream not available, start aborted');
    }
}

/**
 * Suspend video camera and return result
 */
async function stopVideoCaptureAndProcessResult(livenessResult) {
    console.log('Stop video capture: message=' + livenessResult.message + ', success=' + livenessResult.isLivenessSucceeded);
    bestImageId = livenessResult.bestImageId || '';
    const msg = livenessResult.message;
    // we reset the session when we finished the liveness check real session
    resetLivenessDesign();
    hideAllSteps();

    // reset check luminosity count
    luminosityKoCount = 0;

    if (livenessResult.isLivenessSucceeded) {
        if (!idProofingWorkflow) {
            // Liveness is successful
            // display loader while loading best image
            loadingResults.classList.remove(D_NONE);
            faceImg = await commonutils.getFaceImage(basePath, sessionId, bestImageId);
            document.querySelectorAll('#step-liveness-ok [class*="-step"]').forEach((element) => element.classList.add(D_NONE));
            document.querySelector(ID_STEP_LIVENESS_OK).classList.remove(D_NONE);
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
        document.querySelectorAll('#step-liveness-ok .reset-step').forEach((element) => element.classList.remove(D_NONE));
    } else if (msg?.includes('Liveness failed') || msg?.includes('Timeout')) {
        // check if diagnostic is present
        // hide everything
        document.querySelectorAll('#step-liveness-ko .too-bright, .no-face, .generic').forEach((element) => element.classList.add(D_NONE));
        switch (livenessResult.diagnostic) {
            case LivenessDiagnostic.TOO_BRIGHT:
                document.querySelectorAll('#step-liveness-ko .too-bright').forEach((element) => element.classList.remove(D_NONE));
                break;
            case LivenessDiagnostic.MOVEMENT_DURING_ILLUMINATION:
            case LivenessDiagnostic.NO_FACE_DETECTED:
                document.querySelectorAll('#step-liveness-ko .no-face').forEach((element) => element.classList.remove(D_NONE));
                break;
            case undefined:
            default:
                // display default message
                document.querySelectorAll('#step-liveness-ko .generic').forEach((element) => element.classList.remove(D_NONE));
        }
        // Liveness fails or timeout
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

/**
 * Display Best Image
 */
function displayBestImage() {
    if (faceImg && bestImageInfo) {
        BioserverVideoUI.displayAndCenterBestImage(faceImg, bestImageInfo, BEST_IMG_ID);
    }
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
    // Tracking : Download is in progress
    const { downloadProgress, uploadProgress } = trackingInfo;
    if (downloadProgress) {
        setDownloadProgress(downloadProgress);
        return;
    }
    // Tracking : Upload is in progress
    if (uploadProgress) {
        setUploadProgress(uploadProgress);
        return;
    }

    // Tracking : Keep your phone vertical
    if (trackingInfo.phoneNotVertical) { // << user phone not up to face
        displayMsg(phoneNotVerticalMsg, true, 3000);
    } else {
        // Tracking : User position
        handlePositionInfo(trackingInfo);
    }
}

/**
 * Display and update download progress on screen
 * @param {string|number} downloadProgress
 */
function setDownloadProgress(downloadProgress) {
    setProgress(downloadingProgress, downloadProgress);
    if (downloadProgress === 1 && downloadingLoader.classList.contains(D_NONE)) {
        // Avoid displaying 100% if it is the first value to be displayed (to avoid flickering)
        return;
    }
    // Hide infinite loader, display the download progress bar
    initLoader.classList.add(D_NONE);
    downloadingLoader.classList.remove(D_NONE);
    // Do not reset anything when reaching 100% to avoid screen flickering between the infinite loader and next screen
}

/**
 * Display and update upload progress on screen
 * @param {string|number} uploadProgress
 */
function setUploadProgress(uploadProgress) {
    setProgress(uploadingProgress, uploadProgress);
    // Hide infinite loader, display the upload progress bar
    uploadingInfinite.classList.add(D_NONE);
    uploadingProgress.classList.remove(D_NONE);

    // When progress has reached 100%, we can switch to next screen
    if (uploadProgress === 1) {
        resetLivenessDesign();
        hideAllStepsAndDisplay(loadingResults);
    }
}

/**
 * Update progress value displayed on screen (download and upload)
 * @param {Element} element Parent HTML element of the progress bar
 * @param {string|number} progress the value of the progress to display
 */
function setProgress(element, progress) {
    progress = Number(progress * 100).toFixed(0);
    element.querySelector('.progress-spinner').style.background = `conic-gradient(${progressBarColor} ${progress}%,${progressBarBackgroundColor} ${progress}%)`;
    element.querySelector('.middle-circle').innerHTML = `${progress}%`;
}
/**
 * Display a message during ttl and ignore any incoming message during this duration
 * @param {Object} displayOption
 * @param {Element} displayOption.elementToDisplay html element to be displayed during 2s
 * @param {boolean?} displayOption.forceDisplay allow to force display of the provided element even if a message is being displayed
 * @param {number?} displayOption.ttl=2000 duration of message display
 */
function displayMsg(elementToDisplay, forceDisplay = false, ttl = 1500) {
    if (msgCurrentlyDisplayed && !forceDisplay) {
        return; // discard other messages when a message is already being displayed
    }
    clearTimeout(msgCurrentlyDisplayedTimer);
    hideCaptureInstructions();
    // for phoneNotVertical, we don't force the display of the message for 3 sec
    msgCurrentlyDisplayed = elementToDisplay !== phoneNotVerticalMsg;
    // wait for next frame before displaying text
    // to avoid overlapped text on low-end devices
    requestAnimationFrame(() => {
        elementToDisplay.classList.remove(D_NONE_FADEOUT);
    });
    msgCurrentlyDisplayedTimer = setTimeout(() => {
        msgCurrentlyDisplayed = false;
        elementToDisplay.classList.add(D_NONE_FADEOUT);
    }, ttl);
    // should display smile progress bar
    if (elementToDisplay.classList.contains('with-progress')) {
        captureFooter.classList.remove(D_NONE);
    } else {
        captureFooter.classList.add(D_NONE);
    }
}

function hideCaptureInstructions() {
    videoOverlays.forEach((overlay) => !overlay.classList.contains(D_NONE_FADEOUT) && overlay.classList.add(D_NONE_FADEOUT));
    feedbackOverlays.forEach((overlay) => !overlay.classList.contains(D_NONE_FADEOUT) && overlay.classList.add(D_NONE_FADEOUT));
}
/**
 Handle tracker info returned by WebSDK callback

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
    const { positionInfo, smileSize, targetInfo } = trackingInfo;
    if (positionInfo) {
        logText = logText + 'Position info is: ' + positionInfo + '. ';
        switch (positionInfo) {
            case 'TRACKER_POSITION_INFO_CENTER_MOVE_BACKWARDS': // Move away from the camera
                displayMsg(moveFurtherMsg);
                break;
            case 'TRACKER_POSITION_INFO_CENTER_MOVE_FORWARDS': // Move closer to the camera
                displayMsg(moveCloserMsg);
                break;
            case 'TRACKER_POSITION_INFO_MOVE_BACK_INTO_FRAME':
                displayMsg(noFaceMsg);
                break;
            case 'TRACKER_POSITION_INFO_CENTER_TURN_RIGHT':
            case 'TRACKER_POSITION_INFO_CENTER_TURN_LEFT':
                displayMsg(faceCameraMsg);
                break;
            case 'TRACKER_POSITION_INFO_GOOD':
            case 'TRACKER_POSITION_INFO_STAND_STILL':
                if (trackingInfo.positionInfo === 'TRACKER_POSITION_INFO_GOOD') {
                    displayMsg(holdStillMsg);
                } else {
                    if (smileCompleted) {
                        displayMsg(holdStillMsg);
                    } else {
                        displayMsg(headStartPositionOutline);
                    }
                }
                break;
            case 'TRACKER_POSITION_INFO_MOVE_DARKER_AREA':
                displayMsg(moveDarkerArea);
                break;
            case 'TRACKER_POSITION_INFO_MAKE_A_NEUTRAL_EXPRESSION': // make a neutral expression
                displayMsg(makeNeutralExpressionMsg);
                break;
            case 'TRACKER_POSITION_INFO_MAKE_A_SMILE': // make a smile
                handleMakeSmilePositionInfo(smileSize, trackingInfo.thresholdSmile);
                break;
            default:
                displayMsg(headStartPositionOutline);
                break;
        }
    } else {
        logText = logText + 'No position info.';
        displayMsg(headStartPositionOutline);
    }

    // update smile progress bar
    if (smileSize != null) {
        BioserverVideoUI.applySmileProgress(smileSize);
    }

    // additional log :
    if (targetInfo) {
        if (targetInfo.targetR) {
            logText = logText + 'Radius: ' + trackingInfo.targetInfo.targetR + '. ';
        }
        // Circle Animation management
        if (targetInfo.stability && trackingInfo.targetInfo.stability > 0) {
            logText = logText + 'Stability: ' + trackingInfo.targetInfo.stability;
        }
    }
    console.log(logText);
}

/**
 * Handle smile phase with different message depending on how long this make smile info is returned
 */
function handleMakeSmilePositionInfo(smileSize, thresholdSmile) {
    if (!smileSize || !thresholdSmile) {
        displayMsg(makeSmileMsg);
        return;
    }
    if (smileSize >= thresholdSmile) {
        displayMsg(keepSmilingMsg);
        clearNoSmileTimeout();
    } else if (smileSize >= thresholdSmile / 2) {
        displayMsg(makeMoreSmileMsg);
        clearNoSmileTimeout();
    } else {
        triggerNoSmileTimer();
        if (noSmileForWhile) {
            displayMsg(noSmileMsg);
        } else {
            displayMsg(makeSmileMsg);
        }
    }
}

/**
 * Initialize timout to display a message if no smile is detected after some times
 */
function triggerNoSmileTimer() {
    if (!noSmileForWhileTimer) {
        noSmileForWhileTimer = setTimeout(() => {
            noSmileForWhile = true; // let display the no smiling msg
            noSmileForWhileTimer = undefined;
        }, NO_SMILE_MAX_DURATION);
    }
}

/**
 * Clear smile timeout
 */
function clearNoSmileTimeout() {
    noSmileForWhile = false;
    clearTimeout(noSmileForWhileTimer);
    noSmileForWhileTimer = undefined;
}

function displayIlluminationTutorial() {
    // hide any instruction / progress bar on screen
    hideCaptureInstructions();
    captureFooter.classList.add(D_NONE);
    illuminationTutoMsg.classList.remove(D_NONE_FADEOUT);
    // display the button after a small delay
    illuminationTutorialFooter.classList.add(D_NONE_VISIBLE);
    setTimeout(() => illuminationTutorialFooter.classList.remove(D_NONE_VISIBLE), 1000);
}

function startIlluminationPhase() {
    client.startIllumination();
    BioserverVideoUI.updateIlluminationLabels(__('Hold still'), __('Stay within the oval'));
    displayMsg(headStartPositionOutline, true, 4000);
}

// when next button is clicked go to targeted step
document.querySelectorAll('*[data-target]')
    .forEach((btn) => btn.addEventListener('click', async () => {
        const targetStepId = btn.getAttribute('data-target');
        await processStep(targetStepId, btn.hasAttribute('data-delay') && (btn.getAttribute('data-delay') || 2000))
            .catch(async (ex) => {
                console.error(ex);
                await stopVideoCaptureAndProcessResult({ isLivenessSucceeded: false });
            });
    }));

// handle resize screen for result screen
window.addEventListener('resize', () => {
    // re-center best image display in case of screen rotation (only if we are displaying result screen)
    if (!document.querySelector(ID_STEP_LIVENESS_OK).classList.contains(D_NONE)) {
        displayBestImage();
    }
});

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
 * Get GIPS Transaction Button activated
 **/
getIpvTransactionButton.addEventListener('click', async () => {
    console.log('calling getGipsStatus with identityId=' + identityId);
    getIpvStatus.innerHTML = '';
    const result = await commonutils.getGipsStatus(basePath, identityId);
    console.log('result IPV response' + result);
    getIpvStatus.innerHTML = JSON.stringify(result, null, 2);
    getIpvStatus.classList.remove(D_NONE);
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
