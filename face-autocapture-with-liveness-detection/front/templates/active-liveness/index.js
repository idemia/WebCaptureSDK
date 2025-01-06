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

// this file is the main program that uses video server api for active liveness

/* global __,BioserverVideo,BioserverEnvironment,BioserverNetworkCheck, BioserverVideoUI, BASE_PATH,BASE_PATH,VIDEO_URL,VIDEO_BASE_PATH,DISABLE_CALLBACK,IDPROOFING */
/* eslint-disable no-console */
const commonutils = require('../../utils/commons');

const settings = {
    idProofingWorkflow: IDPROOFING,
    basePath: BASE_PATH,
    videoUrlWithBasePath: VIDEO_URL + VIDEO_BASE_PATH,
    videoBasePath: VIDEO_BASE_PATH,
    videoUrl: VIDEO_URL,
    enablePolling: !DISABLE_CALLBACK
};

const session = {}; // every variable used under JS
commonutils.initComponents(session, settings, resetLivenessDesign);

// define html elements
const moveCloserMsg = document.querySelector('#move-closer-animation');
const moveFurtherMsg = document.querySelector('#move-further-animation');
const phoneNotVerticalMsg = document.querySelector('#phone-not-vertical-animation');
const movingPhoneMsg = document.querySelector('#move-phone-animation');
const headRotationAnimation = document.querySelector('#head-rotation-animation');
const moveHeadMsg = document.querySelector('#move-head-animation');
const authenticationInProgress = document.querySelector('#authentication-in-progress');
const tutorialVideoPlayer = document.querySelector('#video-player');
const stopTutorialButton = document.querySelector('#stop-tutorial');
const positiveMessage = document.querySelector('#positive-message');

const BEST_IMG_ID = '.best-image';
const isGifOverlayEnabled = new URLSearchParams(window.location.search).get('gifOverlay') === 'true';

let tooManyAttempts = false;
let serverOverloaded = false;

function getFaceCaptureOptions() {
    let challengeInProgress = false;
    let challengePending = false;
    return {
        bioSessionId: session.sessionId,
        showChallengeInstruction: (challengeInstruction) => {
            if (challengeInstruction === 'TRACKER_CHALLENGE_PENDING') {
                // pending ==> display waiting msg meanwhile the showChallengeResult callback is called with result
                challengeInProgress = false;
                challengePending = true;
                BioserverVideoUI.resetLivenessActiveGraphics();
                // When 'TRACKER_CHALLENGE_PENDING' message under showChallengeInstruction callback is received, a loader should be displayed to
                // the end user so he understands that the capture is yet finished but best image is still being computing
                // and that he should wait for his results. If you don't implement this way, a black screen should be visible !
                headRotationAnimation.classList.add(settings.D_NONE_FADEOUT);
                authenticationInProgress.classList.remove(settings.D_NONE_FADEOUT);
            } else { // challengeInstruction == FACEFLOW_CHALLENGE_2D
                challengeInProgress = true;
                // display challenge
                const options = {
                    tooltip: {
                        enabled: true,
                        text: __('Move the line with your head to this point')
                    }
                };

                // Clean screen
                document.querySelectorAll(settings.CLASS_VIDEO_OVERLAY)
                    .forEach(overlay =>
                        ![headRotationAnimation.id, positiveMessage.id].includes(overlay.id) &&
                overlay.classList.add(settings.D_NONE_FADEOUT));

                // Let appear "Wait a moment" message
                session.loadingChallenge.classList.remove(settings.D_NONE_FADEOUT);

                BioserverVideoUI.resetLivenessActiveGraphics(options);
            }
        },
        showChallengeResult: async (msgBody) => {
            console.log('Liveness Challenge done > requesting result ...');
            session.bestImageInfo = msgBody && msgBody.bestImageInfo; // store best image info to be used to center the image when it'll be displayed
            const result = await commonutils.getLivenessChallengeResult(settings.basePath, settings.enablePolling, session.sessionId)
                .catch(async () => await stopVideoCaptureAndProcessResult(false, __('Failed to retrieve liveness results')));
            if (result) {
                await stopVideoCaptureAndProcessResult(result.isLivenessSucceeded, result.message, result.bestImageId);
            }
            await commonutils.abortCapture(session);
        },
        trackingFn: (trackingInfo) => {
            if (!challengePending) { // tracking info can be received  after challengeInstruction === 'TRACKER_CHALLENGE_PENDING'
                // In this case , skip received tracking message
                displayInstructionsToUser(trackingInfo, challengeInProgress);
                BioserverVideoUI.updateLivenessActiveGraphics('user-video', trackingInfo);
            }
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

/**
 * 1- init liveness session (from backend)
 * 2- init the communication with the server via socket
 * 3- get liveness result (from backend)
 * 4- [Optional] ask the end user to push his reference image (post to backend)
 * 5- [Optional] get the matching result between the best image from liveness capture and the reference image
 */
async function init(options = {}) {
    initLivenessDesign();
    // Abort any previous client
    if (session.client) {
        await commonutils.abortCapture(session);
    }
    // request a sessionId from backend (if we are switching camera we use the same session)
    if (!session.sessionId || !options.switchCamera) {
        try {
            const createdSession = await commonutils.initLivenessSession(settings.basePath, session.sessionIdParam || '', session.identityIdParam || '');
            session.sessionId = createdSession.sessionId;
            session.identityId = createdSession.identityId;
        } catch (err) {
            session.sessionId = false;
            await stopVideoCaptureAndProcessResult(false, __('Failed to initialize session'));
            return;
        }
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

/**
 * End of tutorial
 **/
stopTutorialButton.addEventListener('click', async () => {
    tutorialVideoPlayer.pause();
    session.livenessHeader.classList.remove(settings.D_NONE);
});
tutorialVideoPlayer.addEventListener('ended', () => {
    stopTutorialButton.click();
}, false);

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
    document.querySelector('#best-image-ipv').classList.add(settings.D_NONE);
    document.querySelector('#get-ipv-status-result').classList.add(settings.D_NONE);

    // d-none all steps
    document.querySelectorAll('.step').forEach(row => row.classList.add(settings.D_NONE));
    if (targetStepId === '#step-tutorial') {
        // start playing tutorial video (from the beginning)
        tutorialVideoPlayer.currentTime = 0;
        tutorialVideoPlayer.play();
    } else if (targetStepId === settings.ID_CONNECTIVITY_CHECK) { // << if client clicks on start capture or start training
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
        } else {
            document.querySelector(settings.ID_STEP_LIVENESS).classList.remove(settings.D_NONE);
            await init();
            session.livenessHeader.classList.remove(settings.D_NONE); // Restore header during capture
            if (session.client && session.videoStream) {
                session.client.startCapture({ stream: session.videoStream });
            } else {
                console.log('client or videoStream not available, start aborted');
                return;
            }
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
        const nbRandom = Date.now();
        if (gifAnimation.endsWith('.gif')) {
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
    session.loadingInitialized.classList.remove(settings.D_NONE_FADEOUT); // display loading until initialization is done
    session.livenessHeader.classList.add(settings.D_NONE); // Hide header during init
}

/**
 * reset video capture elements at the end of the process
 */
function resetLivenessDesign() {
    BioserverVideoUI.resetLivenessActiveGraphics();
    commonutils.genericResetLivenessDesign(session);
    headRotationAnimation.style.backgroundImage = null;
    if (headAnimationOn || headAnimationOff) {
        window.clearTimeout(headAnimationOn);
        window.clearTimeout(headAnimationOff);
        headRotationAnimation.classList.add(settings.D_NONE_FADEOUT);
    }
    lastChallengeIndex = -1;
}

/**
 * Display messages to user during capture (eg: move closer, center your face ...)
 * @param {object} trackingInfo face tracking info
 * @param {boolean} challengeInProgress challenge has started?
 * @param trainingMode training mode enabled ?
 */
let lastChallengeIndex = -1;
let headAnimationOn;
let headAnimationOff;
let userInstructionMsgDisplayed;
let userInstructionMsgToDisplay;

function displayInstructionsToUser(trackingInfo, challengeInProgress) {
    if (userInstructionMsgDisplayed) {
        return;
    }
    const livenessActiveData = trackingInfo.livenessActive;

    // << user phone not up to face
    if (trackingInfo.phoneNotVertical) { // << user phone not up to face
        session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
        phoneNotVerticalMsg.classList.remove(settings.D_NONE_FADEOUT);
        if (userInstructionMsgToDisplay) {
            userInstructionMsgToDisplay = window.clearTimeout(userInstructionMsgToDisplay);
        }
        userInstructionMsgToDisplay = window.setTimeout(() => {
            userInstructionMsgToDisplay = false;
        }, 3000);

        // << user face found but too far from camera
    } else if (!challengeInProgress && trackingInfo.tooFar) {
        session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
        moveCloserMsg.classList.remove(settings.D_NONE_FADEOUT);

        // << user face found but too close from camera
    } else if (!challengeInProgress && trackingInfo.tooClose) {
        session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
        moveFurtherMsg.classList.remove(settings.D_NONE_FADEOUT);

        // << no face detected
    } else if (trackingInfo.faceh === 0 && trackingInfo.facew === 0) {
        session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
        session.headStartPositionOutline.classList.remove(settings.D_NONE_FADEOUT);

        // << user not moving his head or moving his phone
    } else if (livenessActiveData && (livenessActiveData.stillFace || livenessActiveData.movingPhone) && !userInstructionMsgToDisplay) {
        session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
        userInstructionMsgToDisplay = true;
        // << user not moving his head
        if (livenessActiveData.stillFace) {
            moveHeadMsg.classList.remove(settings.D_NONE_FADEOUT);
            userInstructionMsgDisplayed = window.setTimeout(() => {
                moveHeadMsg.classList.add(settings.D_NONE_FADEOUT);
                userInstructionMsgDisplayed = window.clearTimeout(userInstructionMsgDisplayed);
                window.setTimeout(() => {
                    userInstructionMsgToDisplay = false;
                }, 5000);
            }, 5000);
            // << user not moving his phone
        } else {
            movingPhoneMsg.classList.remove(settings.D_NONE_FADEOUT);
            userInstructionMsgDisplayed = window.setTimeout(() => {
                movingPhoneMsg.classList.add(settings.D_NONE_FADEOUT);
                userInstructionMsgDisplayed = window.clearTimeout(userInstructionMsgDisplayed);
                window.setTimeout(() => {
                    userInstructionMsgToDisplay = false;
                }, 5000);
            }, 5000);
        }

        // << user is doing something else, display an instruction from tracking info
    } else if (!challengeInProgress && trackingInfo.positionInfo) {
        commonutils.handlePositionInfo(trackingInfo.positionInfo);

        // << challenge is started
        // << challenge join-the-dots is displaying
    } else if (challengeInProgress && livenessActiveData) {
        displayChallenge(livenessActiveData);
    } // end of join-the dot-display
}

function displayChallenge(livenessActiveData) {
    // Clean screen
    document.querySelectorAll(settings.CLASS_VIDEO_OVERLAY)
        .forEach(overlay =>
            ![headRotationAnimation.id, positiveMessage.id].includes(overlay.id) &&
        overlay.classList.add(settings.D_NONE_FADEOUT));
    // join-the-dot animation
    if (livenessActiveData.targetOnHover && (headAnimationOn || headAnimationOff)) {
        window.clearTimeout(headAnimationOn);
        window.clearTimeout(headAnimationOff);
        headRotationAnimation.classList.add(settings.D_NONE_FADEOUT);
    }
    if (livenessActiveData.targetChallengeIndex !== lastChallengeIndex) {
        lastChallengeIndex = livenessActiveData.targetChallengeIndex;
        if (lastChallengeIndex === 1) { // << if first point done display positive message and hide it after 3 seconds
            positiveMessage.classList.remove(settings.D_NONE_FADEOUT);
            session.livenessHeader.classList.add(settings.D_NONE);
            setTimeout(() => {
                positiveMessage.classList.add(settings.D_NONE_FADEOUT);
                session.livenessHeader.classList.remove(settings.D_NONE);
            }, 3000);
        }
        if (isGifOverlayEnabled) { // display animated face overlay
            if (headAnimationOn || headAnimationOff) {
                window.clearTimeout(headAnimationOn);
                window.clearTimeout(headAnimationOff);
                headRotationAnimation.classList.add(settings.D_NONE_FADEOUT);
            }
            headAnimationOn = window.setTimeout(() => {
                const pos = livenessActiveData.challengeCircles[livenessActiveData.targetChallengeIndex].pos;
                headRotationAnimation.style.backgroundImage = `url(./img/rotate_head_${pos}.gif)`;
                if (!livenessActiveData.targetOnHover) {
                    headRotationAnimation.classList.remove(settings.D_NONE_FADEOUT);
                    headAnimationOff = setTimeout(() => {
                        headRotationAnimation.classList.add(settings.D_NONE_FADEOUT);
                    }, 3000);
                }
            }, 3000);
        } // end of display animated face overlay
    }
}

commonutils.initLivenessAnimationsPart3();
