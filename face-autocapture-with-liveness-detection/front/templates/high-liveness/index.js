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

// this file is the main program that uses video server api for high liveness

/* global __,BioserverVideo,BioserverEnvironment,BioserverNetworkCheck, BioserverVideoUI, BASE_PATH,BASE_PATH,VIDEO_URL,VIDEO_BASE_PATH,DISABLE_CALLBACK,IDPROOFING */
/* eslint-disable no-console */
const commonutils = require('../../utils/commons');

const settings = {};
settings.idProofingWorkflow = IDPROOFING;
settings.basePath = BASE_PATH;
settings.videoUrlWithBasePath = VIDEO_URL + VIDEO_BASE_PATH;
settings.videoBasePath = VIDEO_BASE_PATH;
settings.videoUrl = VIDEO_URL;
settings.enablePolling = !DISABLE_CALLBACK;

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

const isGifOverlayEnabled = new URLSearchParams(window.location.search).get('gifOverlay') === 'true';

let tooManyAttempts = false;

function getFaceCaptureOptions() {
    let challengeInProgress = false;
    let challengePending = false;
    return {
        bioSessionId: session.sessionId,
        identityId: session.identityId,
        showChallengeInstruction: (challengeInstruction) => {
            if (challengeInstruction === 'TRACKER_CHALLENGE_PENDING') {
            // pending ==> display waiting msg meanwhile the showChallengeResult callback is called with result
                challengeInProgress = false;
                challengePending = true;
                BioserverVideoUI.resetLivenessHighGraphics();
                headRotationAnimation.classList.add(settings.D_NONE_FADEOUT);
                authenticationInProgress.classList.remove(settings.D_NONE_FADEOUT);
            } else { // challengeInstruction == TRACKER_CHALLENGE_2D
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

                BioserverVideoUI.resetLivenessHighGraphics(options);
            }
        },
        showChallengeResult: async () => {
            console.log('Liveness Challenge done > requesting result ...');
            const result = await commonutils.getLivenessChallengeResult(settings.basePath, settings.enablePolling, session.sessionId)
                .catch(() => stopVideoCaptureAndProcessResult(false, __('Failed to retrieve liveness results')));
            if (result) {
                stopVideoCaptureAndProcessResult(result.isLivenessSucceeded, result.message, result.bestImageId);
            }
            if (session.client) {
                session.videoOutput.srcObject = null;
                session.client.disconnect();
            }
        },
        trackingFn: (trackingInfo) => {
            if (!challengePending) { // tracking info can be received  after challengeInstruction === 'TRACKER_CHALLENGE_PENDING'
            // In this case , skip received tracking message
                displayInstructionsToUser(trackingInfo, challengeInProgress);
                BioserverVideoUI.updateLivenessHighGraphics('user-video', trackingInfo);
            }
        },
        errorFn: (error) => {
            console.log('got error', error);
            challengeInProgress = false;
            if (error.code && error.code === 429) { //  enduser is blocked
                tooManyAttempts = true;
                // we reset the session when we finished the liveness check real session
                resetLivenessDesign();
                document.querySelectorAll('.step').forEach((step) => step.classList.add('d-none'));
                commonutils.userBlockInterval(new Date(error.unlockDateTime).getTime());
                document.querySelector('#step-liveness-fp-block').classList.remove('d-none');
            } else {
                stopVideoCaptureAndProcessResult(false, __('Sorry, there was an issue.'));
            }
            if (session.client) {
                session.videoOutput.srcObject = null;
                session.client.disconnect();
            }
        }
    };
}

/**
 * 1- init liveness session (from backend)
 * 2- init the communication with the server via webrtc & socket
 * 3- get liveness result (from backend)
 * 4- [Optional] ask the end user to push his reference image (post to backend)
 * 5- [Optional] get the matching result between the best image from webRTC and the reference image
 */
async function init(options = {}) {
    session.client = undefined;
    initLivenessDesign();

    // request a sessionId from backend (if we are switching camera we use the same session)
    if (!session.sessionId || !options.switchCamera) {
        try {
            const createdSession = await commonutils.initLivenessSession(settings.basePath, session.sessionIdParam || '', session.identityIdParam || '');
            session.sessionId = createdSession.sessionId;
            session.identityId = createdSession.identityId;
        } catch (err) {
            session.sessionId = false;
            await stopVideoCaptureAndProcessResult(false, __('Failed to initialize session'));
        }
    }
    if (!session.sessionId) {
        return;
    }
    // initialize the face capture client with callbacks
    const faceCaptureOptions = getFaceCaptureOptions();
    faceCaptureOptions.wspath = settings.videoBasePath + '/engine.io';
    faceCaptureOptions.bioserverVideoUrl = settings.videoUrl;
    faceCaptureOptions.rtcConfigurationPath = settings.videoUrlWithBasePath + '/coturnService?bioSessionId=' + encodeURIComponent(session.sessionId);
    
    session.client = await BioserverVideo.initFaceCaptureClient(faceCaptureOptions);

    if (session.client) {
        // get user camera video (front camera is default)
        session.videoStream = await BioserverVideo.getMediaStream({ videoId: 'user-video', video: { deviceId: options.deviceId } })
            .catch((e) => {
                let msg = __('Failed to get camera device stream');
                let extendedMsg;
                if (e.name && e.name.indexOf('NotAllowed') > -1) {
                    msg = __('You denied camera permissions, either by accident or on purpose.');
                    extendedMsg = __('In order to use this demo, you need to enable camera permissions in your browser settings or in your operating system settings.');
                }
                stopVideoCaptureAndProcessResult(false, msg, '', extendedMsg);
            });
        if (!session.videoStream) {
            session.videoOutput.srcObject = null;
            session.client.disconnect();
            return;
        }
        // display the video stream
        session.videoOutput.srcObject = session.videoStream;
        session.loadingInitialized.classList.add(settings.D_NONE_FADEOUT); // initialization successfully, remove loading for video
        session.headStartPositionOutline.classList.remove(settings.D_NONE_FADEOUT);
    }
}

/**
 * End of tutorial
 **/
stopTutorialButton.addEventListener('click', async () => {
    tutorialVideoPlayer.pause();
    session.livenessHeader.classList.remove('d-none');
});
tutorialVideoPlayer.addEventListener('ended', () => {
    stopTutorialButton.click();
}, false);

// when next button is clicked go to targeted step
document.querySelectorAll('*[data-target]')
    .forEach((btn) => btn.addEventListener('click', async () => {
        const targetStepId = btn.getAttribute('data-target');
        await processStep(targetStepId, btn.hasAttribute('data-delay') && (btn.getAttribute('data-delay') || 2000))
            .catch(() => { if (!tooManyAttempts) stopVideoCaptureAndProcessResult(false); });
    }));

async function processStep(targetStepId, displayWithDelay) {
    // init debug ipv
    document.querySelector('#best-image-ipv').classList.add('d-none');
    document.querySelector('#get-ipv-status-result').classList.add('d-none');

    // d-none all steps
    document.querySelectorAll('.step').forEach(row => row.classList.add('d-none'));
    if (targetStepId === '#step-tutorial') {
        // start playing tutorial video (from the beginning)
        tutorialVideoPlayer.currentTime = 0;
        tutorialVideoPlayer.play();
    } else if (targetStepId === settings.ID_CONNECTIVITY_CHECK) { // << if client clicks on start capture or start training
        if (session.networkContext.connectivityOK) {
            targetStepId = settings.ID_STEP_LIVENESS; // connectivity check done & successful, move to the next step
        } else if (session.networkContext.connectivityOK === undefined) {
            // connectivity check in progress, display waiting screen
            document.querySelector(settings.ID_CONNECTIVITY_CHECK).classList.remove('d-none');
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
            document.querySelector(settings.ID_STEP_LIVENESS).classList.remove('d-none');
            session.livenessHeader.classList.remove('d-none');
            await init();
            if (session.client && session.videoStream) {
                session.client.startCapture({ stream: session.videoStream });
            } else {
                console.log('client or videoStream not available, start aborted');
                return;
            }
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

document.querySelector('#step-liveness .tutorial').addEventListener('click', async () => {
    resetLivenessDesign();
    if (session.client) {
        session.videoOutput.srcObject = null;
        session.client.disconnect();
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
    await commonutils.stopVideoCaptureAndProcessResult(session, settings, resetLivenessDesign, success, msg, faceId, extendedMsg);
}

/**
 * prepare video capture elements
 */
function initLivenessDesign() {
    document.querySelector('header').classList.add('d-none');
    document.querySelector('main').classList.add('darker-bg');
    session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
    session.loadingInitialized.classList.remove(settings.D_NONE_FADEOUT); // display loading until initialization is done
}

/**
 * reset video capture elements at the end of the process
 */
function resetLivenessDesign() {
    BioserverVideoUI.resetLivenessHighGraphics();
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
 * display messages to user during capture (eg: move closer, center your face ...)
 * @param trackingInfo face tracking info
 * @param challengeInProgress challenge has started?
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
    const livenessHighData = trackingInfo.livenessHigh;

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
    } else if (livenessHighData && (livenessHighData.stillFace || livenessHighData.movingPhone) && !userInstructionMsgToDisplay) {
        session.videoMsgOverlays.forEach((overlay) => overlay.classList.add(settings.D_NONE_FADEOUT));
        userInstructionMsgToDisplay = true;
        // << user not moving his head
        if (livenessHighData.stillFace) {
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
    } else if (challengeInProgress && livenessHighData) {
        displayChallenge(livenessHighData);
    } // end of join-the dot-display
}

function displayChallenge(livenessHighData) {
    // Clean screen
    document.querySelectorAll(settings.CLASS_VIDEO_OVERLAY)
        .forEach(overlay =>
            ![headRotationAnimation.id, positiveMessage.id].includes(overlay.id) &&
        overlay.classList.add(settings.D_NONE_FADEOUT));
    // join-the-dot animation
    if (livenessHighData.targetOnHover && (headAnimationOn || headAnimationOff)) {
        window.clearTimeout(headAnimationOn);
        window.clearTimeout(headAnimationOff);
        headRotationAnimation.classList.add(settings.D_NONE_FADEOUT);
    }
    if (livenessHighData.targetChallengeIndex !== lastChallengeIndex) {
        lastChallengeIndex = livenessHighData.targetChallengeIndex;
        if (lastChallengeIndex === 1) { // << if first point done display positive message and hide it after 3 seconds
            positiveMessage.classList.remove(settings.D_NONE_FADEOUT);
            session.livenessHeader.classList.add('d-none');
            setTimeout(() => {
                positiveMessage.classList.add(settings.D_NONE_FADEOUT);
                session.livenessHeader.classList.remove('d-none');
            }, 3000);
        }
        if (isGifOverlayEnabled) { // display animated face overlay
            if (headAnimationOn || headAnimationOff) {
                window.clearTimeout(headAnimationOn);
                window.clearTimeout(headAnimationOff);
                headRotationAnimation.classList.add(settings.D_NONE_FADEOUT);
            }
            headAnimationOn = window.setTimeout(() => {
                const pos = livenessHighData.challengeCircles[livenessHighData.targetChallengeIndex].pos;
                headRotationAnimation.style.backgroundImage = `url(./img/rotate_head_${pos}.gif)`;
                if (!livenessHighData.targetOnHover) {
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
