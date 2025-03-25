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
const { hideAllStepsAndDisplay } = commonutils;

const settings = {
    idProofingWorkflow: IDPROOFING,
    basePath: BASE_PATH,
    videoUrlWithBasePath: VIDEO_URL + VIDEO_BASE_PATH,
    videoBasePath: VIDEO_BASE_PATH,
    videoUrl: VIDEO_URL,
    enablePolling: !DISABLE_CALLBACK,
    healthPath: DEMO_HEALTH_PATH
};

const D_NONE_FADEOUT = 'd-none-fadeout';
const D_NONE = 'd-none';

const BEST_IMG_ID = '.best-image';
const bestImageIPV = document.querySelector('#best-image-ipv');
const getIPVStatus = document.querySelector('#get-ipv-status-result');

const session = {}; // every variable used under JS
commonutils.initComponents(session, settings, resetLivenessDesign);

const monitoring = document.querySelectorAll('.monitoring');
const countDown = document.querySelector('#count-down');
let tooManyAttempts = false;
let serverOverloaded = false;

const uploadingLoader = document.querySelector('#uploading-results');
const uploadingInfinite = uploadingLoader.querySelector('#uploading-infinite');
const uploadingProgress = uploadingLoader.querySelector('#uploading-progress');
const loadingResults = document.querySelector('#loading-results');

const initLoader = document.querySelector('#init-loader');
const downloadingLoader = document.querySelector('#downloading-loader');
const downloadingProgress = downloadingLoader.querySelector('#downloading-progress');

/**
 * 1- init liveness session (from backend)
 * 2- init the communication with the server via socket
 * 3- get liveness result (from backend)
 * 4- [Optional] ask the end user to push his reference image (post to backend)
 * 5- [Optional] get the matching result between the best image from liveness check and the reference image
 */

// call getCapabilities from demo-server which will call with apikey the endpoint from video-server
commonutils.getCapabilities(settings.basePath, settings.healthPath).then(
    (response) => {
        if (response && response.version) {
            // eslint-disable-next-line no-return-assign
            monitoring.forEach((element) => element.innerHTML = `${response.version}`);
        }
    }
).catch(async () => {
    await stopVideoCaptureAndProcessResult(false, 'Service unavailable');
});
function getFaceCaptureOptions() {
    let challengeInProgress = false;
    return {
        bioSessionId: session.sessionId,
        onClientInitEnd: () => {
            console.warn('init ended');
            session.loadingInitialized.classList.add(D_NONE_FADEOUT); // initialization successfully, remove loading for video
            session.headStartPositionOutline.classList.remove(D_NONE_FADEOUT);
        },
        showChallengeInstruction: (challengeInstruction) => {
            if (challengeInstruction === 'TRACKER_CHALLENGE_PENDING') {
                // pending ==> display waiting msg meanwhile the showChallengeResult callback is called with result
                challengeInProgress = false;
                // When 'TRACKER_CHALLENGE_PENDING' message under showChallengeInstruction callback is received, a loader should be displayed to
                // the end user so he understands that the capture is yet finished but best image is still being computing
                // and that he should wait for his results. If you don't implement this way, a black screen should be visible !
                session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
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
        showChallengeResult: async (msgBody) => {
            console.log('Liveness Challenge done > requesting result ...');
            session.bestImageInfo = msgBody && msgBody.bestImageInfo; // store best image info to be used to center the image when it'll be displayed
            const result = await commonutils.getLivenessChallengeResult(settings.basePath, settings.enablePolling, session.sessionId)
                .catch(async () => await stopVideoCaptureAndProcessResult(false, __('Failed to retrieve liveness results')));
            console.log('Liveness result ', result);
            // result.diagnostic not currently set as last param of stopVideoCaptureAndProcessResult(), as we need to know the impact of displaying it to the user
            if (result) {
                await stopVideoCaptureAndProcessResult(result.isLivenessSucceeded, result.message, result.bestImageId);
            }
            await commonutils.abortCapture(session);
        },
        trackingFn: (trackingInfo) => {
            displayInstructionsToUser(trackingInfo, challengeInProgress);
        },
        errorFn: async (error) => {
            console.log('got error', error);
            challengeInProgress = false;
            if (error.code && error.code === 429) { //  enduser is blocked
                tooManyAttempts = true;
                // we reset the session when we finished the liveness check real session
                resetLivenessDesign();
                document.querySelectorAll('.step').forEach((step) => step.classList.add(settings.D_NONE));

                document.querySelector('.please-try-again-in').classList.remove(settings.D_NONE);
                commonutils.userBlockInterval(new Date(error.unlockDateTime).getTime());
                document.querySelector('#step-liveness-fp-block').classList.remove(settings.D_NONE);
            } else if (error.code && error.code === 503) { //  server overloaded
                serverOverloaded = true;
                // we reset the session when we finished the liveness check real session
                resetLivenessDesign();
                document.querySelectorAll('.step').forEach((step) => step.classList.add(settings.D_NONE));

                document.querySelector('.please-try-again-in').classList.remove(settings.D_NONE);
                document.querySelector('#step-server-overloaded').classList.remove(settings.D_NONE);
            } else {
                await stopVideoCaptureAndProcessResult(false, __('Sorry, there was an issue.'));
                await commonutils.abortCapture(session);
            }
        }
    };
}

async function init() {
    initLivenessDesign();
    // Abort any previous client
    if (session.client) {
        await commonutils.abortCapture(session);
    }
    // Request a sessionId from backend
    try {
        const createdSession = await commonutils.initLivenessSession(settings.basePath, session.sessionIdParam || '', session.identityIdParam || '');
        session.sessionId = createdSession.sessionId;
        session.identityId = createdSession.identityId;
    } catch (err) {
        session.sessionId = false;
        await stopVideoCaptureAndProcessResult(false, __('Failed to initialize session'));
        return;
    }
    // initialize the face capture client with callbacks
    const faceCaptureOptions = getFaceCaptureOptions();
    faceCaptureOptions.wspath = settings.videoBasePath + '/engine.io';
    faceCaptureOptions.bioserverVideoUrl = settings.videoUrl;
    
    session.client = await BioserverVideo.initFaceCaptureClient(faceCaptureOptions);
    // get user camera video (front camera is default)
    try {
        session.videoStream = await BioserverVideo.getMediaStream({ videoId: 'user-video' });
    } catch (err) {
        let msg = __('Failed to get camera device stream');
        let extendedMsg;
        if (err.name && err.name.indexOf('NotAllowed') > -1) {
            msg = __('You denied camera permissions, either by accident or on purpose.');
            extendedMsg = __('In order to use this demo, you need to enable camera permissions in your browser settings or in your operating system settings. Please refresh the page to restart the demo.');
        }
        await stopVideoCaptureAndProcessResult(false, msg, '', extendedMsg);
        await commonutils.abortCapture(session);
        return;
    }
    // display the video stream
    session.videoOutput.srcObject = session.videoStream;
    session.loadingInitialized.classList.add(settings.D_NONE_FADEOUT); // initialization successfully, remove loading for video
    session.headStartPositionOutline.classList.remove(settings.D_NONE_FADEOUT);
}

// when next button is clicked go to targeted step
document.querySelectorAll('*[data-target]')
    .forEach((btn) => btn.addEventListener('click', async () => {
        const targetStepId = btn.getAttribute('data-target');
        await processStep(targetStepId, btn.hasAttribute('data-delay') && (btn.getAttribute('data-delay') || 2000))
            .catch(async () => {
                // Too many attempts or server overloaded error have been caught by errorFn, so no need to call further method in that case, just reset variables
                if (!tooManyAttempts && !serverOverloaded) {
                    await stopVideoCaptureAndProcessResult(false);
                } else {
                    tooManyAttempts = false;
                    serverOverloaded = false;
                }
            });
    }));

async function processStep(targetStepId, displayWithDelay) {
    // init debug ipv
    bestImageIPV.classList.add(settings.D_NONE);
    getIPVStatus.classList.add(settings.D_NONE);

    if (targetStepId === '#application-version') {
        document.querySelector(targetStepId).classList.remove(settings.D_NONE);

        setTimeout(() => {
            document.querySelector(targetStepId).classList.add(settings.D_NONE);
        }, 2000);
    } else {
        // d-none all steps

        document.querySelectorAll('.step').forEach((row) => row.classList.add(settings.D_NONE));
        if (targetStepId === settings.ID_CONNECTIVITY_CHECK) { // << if client clicks on start capture or start training
            if (session.networkContext.connectivityOK) {
                targetStepId = settings.ID_STEP_LIVENESS; // connectivity check done & successful, move to the next step
            } else if (session.networkContext.connectivityOK === undefined) {
                // connectivity check in progress, display waiting screen
                document.querySelector(settings.ID_CONNECTIVITY_CHECK).classList.remove(settings.D_NONE);
                session.networkContext.timeoutCheckConnectivity = setTimeout(() => {
                    processStep(targetStepId, displayWithDelay);
                }, 1000); // call this method until we got the results from the network connectivity
            } else {
                // Rare case where the connectivity error screen has been shown but covered by another 'step' screen, so show it again to avoid looping endlessly
                commonutils.networkConnectivityNotGood();
                return;
            }
        }

        if (targetStepId === settings.ID_STEP_LIVENESS) { // << if client clicks on start capture or start training
            if (!session.cameraPermissionAlreadyAsked) { // << display the camera access permission step the first time only
                session.cameraPermissionAlreadyAsked = true;
                targetStepId = '#step-access-permission';
                // when client accepts camera permission access > we redirect it to the liveness check
                document.querySelector(`${targetStepId} button`).classList.add('start-capture');
            } else if (!await processLivenessStep()) {
                return;
            }
        }
        const targetStep = document.querySelector(targetStepId);
        targetStep.classList.remove(settings.D_NONE);
        const targetStepFooter = targetStep.querySelector('.footer');
        if (targetStepFooter) {
            targetStepFooter.classList.add(settings.D_NONE);
            if (displayWithDelay) {
                // display next button after few seconds
                setTimeout(() => targetStepFooter.classList.remove(settings.D_NONE), displayWithDelay);
            } else {
                targetStepFooter.classList.remove(settings.D_NONE);
            }
        }
    }
}

async function processLivenessStep() {
    document.querySelector(settings.ID_STEP_LIVENESS).classList.remove(settings.D_NONE);
    await init();
    if (session.client && session.videoStream) {
        let timeleft = 4;
        const showCountDown = () => {
            document.getElementById('count-down-txt-id').innerHTML = 'Countdown... ' + timeleft;
            countDown.classList.remove(settings.D_NONE);
            session.livenessHeader.classList.add(settings.D_NONE); // hide header when countdown is here
        };
        const countDownTimer = setInterval(function () {
            timeleft--;
            if (timeleft <= 0) {
                clearInterval(countDownTimer);
                document.getElementById('count-down-txt-id').innerHTML = '';
                session.livenessHeader.classList.remove(settings.D_NONE); // Restore header during capture
                countDown.classList.add(settings.D_NONE);
            } else {
                showCountDown();
            }
        }, 1000);
        // Show countdown immediately
        showCountDown();
        setTimeout(() => {
            console.log('Starting capture after timeout');
            session.client.startCapture({ stream: session.videoStream });
        }, timeleft * 1000);
        return true;
    } else {
        console.log('client or videoStream not available, start aborted');
        return false;
    }
}

document.querySelector('#step-liveness .tutorial').addEventListener('click', async () => {
    resetLivenessDesign();
    await commonutils.abortCapture(session);
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
        if (gifAnimation.endsWith('.gif')) {
            const nbRandom = Date.now();
            img.src = `${gifAnimation}?v=${nbRandom}`;
        }
    });
}

/**
 * suspend video camera and return result
 */
async function stopVideoCaptureAndProcessResult(success, msg, faceId = '', extendedMsg) {
    // Download the image first
    let faceImg;
    if (faceId) {
        faceImg = await commonutils.getFaceImage(settings.basePath, session.sessionId, faceId);
    }
    // Then reset the UI to show result
    commonutils.stopVideoCaptureAndProcessResult(session, settings, resetLivenessDesign, success, msg, faceId, extendedMsg);
    // Finally display the image
    if (faceImg) {
        BioserverVideoUI.displayAndCenterBestImage(faceImg, session.bestImageInfo, BEST_IMG_ID);
    }
}

/**
 * prepare video capture elements
 */
function initLivenessDesign() {
    document.querySelector('header').classList.add(settings.D_NONE);
    document.querySelector('main').classList.add('darker-bg');
    session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
    downloadingLoader.classList.add(settings.D_NONE);
    initLoader.classList.remove(settings.D_NONE);
    session.loadingInitialized.classList.remove(settings.D_NONE_FADEOUT); // display loading until initialization is done
    session.livenessHeader.classList.add(settings.D_NONE); // Hide header during init
}

/**
 * reset video capture elements at the end of the process
 */
function resetLivenessDesign() {
    commonutils.genericResetLivenessDesign(session);
}

/**
 * Display messages to user during capture (eg: move closer, center your face ...)
 * @param {object} trackingInfo face tracking info
 * @param {boolean} challengeInProgress challenge has started?
 * @param trainingMode training mode enabled ?
 */
let userInstructionMsgToDisplay;

function displayInstructionsToUser(trackingInfo, challengeInProgress) {
    if (challengeInProgress) {
        return;
    }
    const downloadProgress = trackingInfo.downloadProgress;
    if (downloadProgress) {
        setDownloadProgress(downloadProgress);
        // Hide infinite loader, display the download progress bar
        initLoader.classList.add(D_NONE);
        downloadingLoader.classList.remove(D_NONE);
        // When progress has reached 100%, display again the infinite loader
        if (downloadProgress === 1) {
            initLoader.classList.remove(D_NONE);
            downloadingLoader.classList.add(D_NONE);
        }
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
    if (trackingInfo.phoneNotVertical) { // << user phone not up to face
        session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
        document.querySelector('#phone-not-vertical-animation').classList.remove(settings.D_NONE_FADEOUT);
        if (userInstructionMsgToDisplay) {
            userInstructionMsgToDisplay = window.clearTimeout(userInstructionMsgToDisplay);
        }
        userInstructionMsgToDisplay = window.setTimeout(() => {
            userInstructionMsgToDisplay = false;
        }, 3000);
    } else if (trackingInfo.tooFar) { // << user face found but too far from camera
        session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
        document.querySelector('#move-closer-animation').classList.remove(settings.D_NONE_FADEOUT);
    } else if (trackingInfo.tooClose) { // << user face found but too close from camera
        session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
        document.querySelector('#move-further-animation').classList.remove(settings.D_NONE_FADEOUT);
    } else {
        if (trackingInfo.faceh === 0 && trackingInfo.facew === 0) { // << no face detected
            session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
            session.headStartPositionOutline.classList.remove(settings.D_NONE_FADEOUT);
        } else if (trackingInfo.positionInfo) {
            session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
            commonutils.handlePositionInfo(trackingInfo.positionInfo);
        }
    }
}
// TODO read these values from css file
const progressBarColor = '#101010';
const progressBarBackgroundColor = '#cccccc';

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

commonutils.initLivenessAnimationsPart3();
