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

/* global VIDEO_URL, VIDEO_BASE_PATH, BioserverNetworkCheck */
/* eslint-disable no-console */
const lottie = require('lottie-web/build/player/lottie_light.js');

const CONTENT_TYPE = 'Content-type';
const APPLICATION_JSON = 'application/json';
const ERROR_CREATE_FACE = 'createFace failed';
const CLASS_SIGNAL_VALUE = '.signal-value';
const CLASS_SIGNAL_MIN_VALUE = '.signal-min-value';
const ID_CONNECTIVITY_CHECK = '#connectivity-check';
const D_NONE_FADEOUT = 'd-none-fadeout';
const CLASS_VIDEO_OVERLAY = '#step-liveness .video-overlay';
const urlParams = new URLSearchParams(window.location.search); // let you extract params from url

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
    return str && str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

exports.getCapabilities = async function (basePath, healthPath) {
    return new Promise(function (resolve, reject) {
        console.log(' >> get monitoring', healthPath);

        const xhttp = new window.XMLHttpRequest();
        xhttp.open('GET', basePath + healthPath, true);
        xhttp.setRequestHeader(CONTENT_TYPE, APPLICATION_JSON);

        xhttp.responseType = 'json';
        xhttp.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                console.log('getMonitoring ok', xhttp.response);
                resolve(xhttp.response);
            } else {
                console.error('getMonitoring failed');
                // eslint-disable-next-line prefer-promise-reject-errors
                reject('getMonitoring failed');
            }
        };
        xhttp.onerror = function () {
            // eslint-disable-next-line no-undef
            console.log('Error ' + httpError.status + '  ' + httpError.code);
            // eslint-disable-next-line no-undef
            reject(httpError);
        };
        xhttp.send();
    });
};

/**
 * init a liveness session
 * @return sessionId
 */
exports.initLivenessSession = async function (basePath, sessionId = '', identityId = '') {
    console.log('init liveness session');
    return new Promise((resolve, reject) => {
        const xhttp = new window.XMLHttpRequest();
        let path = `${basePath}/init-liveness-session/${sessionId}`;
        if (identityId && identityId !== '') {
            path = `${path}?identityId=${identityId}`;
        }
        xhttp.open('GET', path, true);
        xhttp.responseType = 'json';
        xhttp.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                resolve(xhttp.response);
            } else {
                console.error('initLivenessSession failed');
                // eslint-disable-next-line prefer-promise-reject-errors
                reject();
            }
        };
        xhttp.onerror = function () {
            // eslint-disable-next-line prefer-promise-reject-errors
            reject();
        };
        xhttp.send();
    });
};

/**
 * retrieve the complete GIPS/IPV status
 * @param basePath
 * @param identityId
 * @return {isLivenessSucceeded, message}
 */
exports.getGipsStatus = async function (basePath, identityId) {
    return new Promise((resolve, reject) => {
        const xhttp = new window.XMLHttpRequest();
        xhttp.open('GET', `${basePath}/gips-status/${identityId}`, true);
        xhttp.setRequestHeader(CONTENT_TYPE, APPLICATION_JSON);
        xhttp.responseType = 'json';
        xhttp.onload = () => {
            if (xhttp.status) {
                if (xhttp.status === 200) {
                    resolve(xhttp.response);
                } else {
                    console.error('getGipsStatus failed...');
                    // eslint-disable-next-line prefer-promise-reject-errors
                    reject();
                }
            }
        };

        // eslint-disable-next-line no-unused-vars
        xhttp.onerror = function (e) {
            // eslint-disable-next-line prefer-promise-reject-errors
            reject();
        };
        xhttp.send();
    });
};

/**
 * retrieve the liveness challenge result from backend (via polling)
 * @param sessionId
 * @param maxAttempts
 * @param interval
 * @return {isLivenessSucceeded, message}
 */
exports.getLivenessChallengeResult = async function (basePath, enablePolling, sessionId, maxAttempts = 10, interval = 1000) {
    console.log('getLivenessChallengeResult call : maxAttempts=' + maxAttempts + ', enablePolling=' + enablePolling);
    return new Promise((resolve, reject) => {
        const xhttp = new window.XMLHttpRequest();
        xhttp.open('GET', `${basePath}/liveness-challenge-result/${sessionId}/?polling=${enablePolling}`, true);
        xhttp.setRequestHeader(CONTENT_TYPE, APPLICATION_JSON);
        xhttp.responseType = 'json';
        xhttp.onload = () => {
            if (xhttp.status) {
                console.log('getLivenessChallengeResult status', xhttp.status);

                if (xhttp.status === 200) {
                    resolve(xhttp.response);
                } else if (maxAttempts) { // >> polling
                    console.log('getLivenessChallengeResult retry ...', maxAttempts);
                    // eslint-disable-next-line promise/param-names
                    return new Promise((r) => setTimeout(r, interval))
                        .then(() => {
                            resolve(this.getLivenessChallengeResult(basePath, enablePolling, sessionId, maxAttempts - 1));
                        });
                } else {
                    console.error('getLivenessChallengeResult failed, max retries reached');
                    // eslint-disable-next-line prefer-promise-reject-errors
                    reject();
                }
            }
        };

        xhttp.onerror = function (_) {
            // eslint-disable-next-line prefer-promise-reject-errors
            reject();
        };
        xhttp.send();
    });
};

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
            const matchingOKDescription = document.querySelector('#step-selfie-ok .description');
            if (matchingOKDescription) {
                // eslint-disable-next-line no-undef
                matchingOKDescription.innerHTML = __('Matching succeeded <br> score: ') + matches.score;
            }
            document.querySelector('#step-selfie-ok').classList.remove('d-none');

            const bestImgMatching = document.querySelector('#step-selfie-ok .best-image');
            if (bestImgMatching) {
                const faceImg = await this.getFaceImage(basePath, sessionId, bestImageId);
                const bestImageURL = window.URL.createObjectURL(faceImg);
                bestImgMatching.style.backgroundImage = `url(${bestImageURL})`;
            }
        } else {
            document.querySelector('#step-selfie-ko').classList.remove('d-none');
            const matchingNOKDescription = document.querySelector('#step-selfie-ko .description');
            if (matches.score && matchingNOKDescription) {
                // eslint-disable-next-line no-undef
                matchingNOKDescription.innerHTML = __('Matching failed <br> score: ') + matches.score || '';
            }
        }
        console.log(matches);
    } catch (e) {
        console.error(e);
        document.querySelectorAll('.step').forEach((step) => step.classList.add('d-none'));
        document.querySelector('#step-selfie-ko').classList.remove('d-none'); // Should be technical issue
        const matchingNOKDescription = document.querySelector('#step-selfie-ko .description');
        if (matchingNOKDescription) {
            matchingNOKDescription.innerHTML = 'Matching failed';
        }
    }
};

/**
 * associate a new face to session
 * @param sessionId session id
 * @param imageFile face image
 * @param faceInfo face information
 * @return {Promise<void>}
 */
exports.createFace = async function (basePath, sessionId, imageFile, faceInfo = '{"imageType" : "SELFIE","friendlyName" : "selfie", "imageRotationEnabled":"true"}') {
    return new Promise((resolve, reject) => {
        const formData = new window.FormData();
        const xhttp = new window.XMLHttpRequest();
        formData.append('image', imageFile);
        formData.append('face', new window.Blob([faceInfo], { type: APPLICATION_JSON }));
        xhttp.open('POST', `${basePath}/bio-session/${sessionId}/faces`, true);
        xhttp.responseType = 'json';
        xhttp.onload = function () {
            document.getElementById('loading').classList.add('d-none');
            if (this.status === 200) {
                resolve(xhttp.response);
            } else {
                console.error(ERROR_CREATE_FACE);
                // eslint-disable-next-line prefer-promise-reject-errors
                reject();
            }
        };
        xhttp.onerror = function () {
            console.error(ERROR_CREATE_FACE);
            reject(xhttp);
        };
        xhttp.send(formData);
        document.getElementById('loading').classList.remove('d-none');
    });
};

/**
 * retrieve face for a given session
 * @param sessionId
 * @param faceId
 */
exports.getFaceImage = async function (basePath, sessionId, faceId) {
    return new Promise((resolve, reject) => {
        const xhttp = new window.XMLHttpRequest();
        xhttp.open('GET', `${basePath}/bio-session/${sessionId}/faces/${faceId}/image`, true);
        xhttp.responseType = 'blob';
        xhttp.onload = function () {
            if (this.status === 200) {
                resolve(xhttp.response);
            } else {
                console.error(ERROR_CREATE_FACE);
                // eslint-disable-next-line prefer-promise-reject-errors
                reject();
            }
        };
        xhttp.onerror = function () {
            console.error(ERROR_CREATE_FACE);
            reject(xhttp);
        };
        xhttp.send();
    });
};

/**
 * get matches result for a given session and two faces
 * @param sessionId
 * @param referenceFaceId
 * @param candidateFaceId
 */
exports.getMatches = async function (basePath, sessionId, referenceFaceId, candidateFaceId) {
    return new Promise((resolve, reject) => {
        const xhttp = new window.XMLHttpRequest();
        xhttp.open('GET', `${basePath}/bio-session/${sessionId}/faces/${referenceFaceId}/matches/${candidateFaceId}`, true);
        xhttp.responseType = 'json';
        xhttp.onload = function () {
            if (this.status === 200) {
                resolve(xhttp.response);
            } else {
                console.error(ERROR_CREATE_FACE);
                // eslint-disable-next-line prefer-promise-reject-errors
                reject();
            }
        };
        xhttp.onerror = function () {
            console.error(ERROR_CREATE_FACE);
            reject(xhttp);
        };
        xhttp.send();
    });
};

function getFPMinuts(minutes) {
    return (minutes < 10 ? '0' + minutes : minutes) + 'm ';
}

function getFPSeconds(seconds) {
    return (seconds < 10 ? '0' + seconds : seconds) + 's';
}

function getTimeLeftBeforeEndFreeze(timeLeft) {
    let days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    let hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    let minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    let seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    // remove 0 if needed + add suffix to understand if day/hours/minutes/seconds
    if (days !== 0) {
        days = days + 'd ';
        hours = hours + 'h ';
        minutes = getFPMinuts(minutes);
        seconds = getFPSeconds(seconds);
    } else {
        days = '';
        if (hours !== 0) {
            hours = hours + 'h ';
            minutes = getFPMinuts(minutes);
            seconds = getFPSeconds(seconds);
        } else {
            hours = '';
            if (minutes !== 0) {
                minutes = minutes + 'm ';
                seconds = getFPSeconds(seconds);
            } else {
                minutes = '';
                if (seconds !== 0) {
                    seconds = seconds + 's';
                } else {
                    seconds = '';
                }
            }
        }
    }
    return { days, hours, minutes, seconds };
};

// msg is following this regex : 'Please retry after ' + new Date(delay)
// const delayDate = new Date('Mon Dec 14 2020 22:20:39 GMT+0000');
exports.userBlockInterval = function (fpBlockDate) {
    document.querySelector('.retry-fp').classList.add('d-none');
    let fpCountdown = null;
    const updateBlockInterval = () => {
        const currentDate = new Date().getTime();
        const timeLeft = fpBlockDate - currentDate; // difference between blocking time and now in milliseconds

        // when browser's javascript is not working, timeLeft can be < 0
        if (timeLeft > 0) {
            // retrieve days/hours/minutes/seconds left before end of freeze
            const { days, hours, minutes, seconds } = getTimeLeftBeforeEndFreeze(timeLeft);
            const timerLeft = days + hours + minutes + seconds;
            if (timerLeft) {
                // update UX with the countdown
                document.querySelector('.fp-countdown').innerHTML = timerLeft;
                return;
            }
        }
        // stop internal and display retry button
        clearInterval(fpCountdown);
        document.querySelector('.fp-countdown').innerHTML = ''; // remove countdown since time is over
        document.querySelector('.please-try-again-in').classList.add('d-none');
        // display retry button
        document.querySelector('.retry-fp').classList.remove('d-none');
    };
    updateBlockInterval();
    // update the UI each second to update the left time of blocking
    fpCountdown = setInterval(updateBlockInterval, 1000);
};

// Will be overridden after initializeNetworkCheck has been called
let networkConnectivityNotGood = () => {};
/**
 * To be called externally when connectivityOK is false strictly (to avoid looping on 'please wait' screen)
 */
exports.networkConnectivityNotGood = function () {
    networkConnectivityNotGood();
};

function onFirstConnectivityCheck(networkConnectivity, uploadThreshold) {
    if (!networkConnectivity) {
        console.warn('Unable to check user connectivity.');
    }
    const weakNetworkCheckPage = document.querySelector('#step-weak-network');
    weakNetworkCheckPage.querySelector('.animation').classList.add('d-none');
    weakNetworkCheckPage.querySelector('.check-phone').classList.remove('d-none');
    weakNetworkCheckPage.querySelector('.upload').classList.add('d-none');
    weakNetworkCheckPage.querySelector('.download').classList.add('d-none');

    document.querySelectorAll('.step').forEach((s) => s.classList.add('d-none'));
    weakNetworkCheckPage.classList.remove('d-none');
    if (networkConnectivity) {
        const uploadNotGood = !networkConnectivity.upload ? true : (networkConnectivity.upload < uploadThreshold);
        const signalValue = networkConnectivity.upload;
        const signalThreshold = uploadThreshold;
        weakNetworkCheckPage.querySelector(CLASS_SIGNAL_VALUE).innerHTML = (signalValue && '(' + signalValue + ' kb/s)') || '';
        weakNetworkCheckPage.querySelector(CLASS_SIGNAL_MIN_VALUE).innerHTML = signalThreshold + ' kb/s';
        if (uploadNotGood) {
            weakNetworkCheckPage.querySelector('.upload').classList.remove('d-none');
        }
    } else { // << case of error
        weakNetworkCheckPage.querySelector(CLASS_SIGNAL_VALUE).innerHTML = '';
        weakNetworkCheckPage.querySelector(CLASS_SIGNAL_MIN_VALUE).innerHTML = uploadThreshold + ' kb/s';
        weakNetworkCheckPage.querySelector('.upload').classList.remove('d-none');
    }
};

function doNetworkCheck(onNetworkCheckUpdate) {
    BioserverNetworkCheck.connectivityMeasure({
        uploadURL: VIDEO_URL + VIDEO_BASE_PATH + '/network-speed',
        latencyURL: VIDEO_URL + VIDEO_BASE_PATH + '/network-latency',
        onNetworkCheckUpdate: onNetworkCheckUpdate,
        errorFn: (err) => {
            console.error('An error occurred while calling connectivityMeasure: ', err);
            onNetworkCheckUpdate();
        }
    });
}

exports.initializeNetworkCheck = function (client, resetLivenessDesign, networkContext) {
    // Override networkConnectivityNotGood with client & resetLivenessDesign params
    networkConnectivityNotGood = function (networkConnectivity) {
        onFirstConnectivityCheck(networkConnectivity, BioserverNetworkCheck.UPLOAD_SPEED_THRESHOLD);
        // close VideoCapture If Needed;
        if (resetLivenessDesign) {
            resetLivenessDesign();
        }
        if (client) {
            document.querySelector('#user-video').srcObject = null;
            client.disconnect();
        }
    };

    if (BioserverNetworkCheck && window.envBrowserOk) {
        // object is used in order to modify content from another function
        const displayGoodSignal = { value: false };

        // eslint-disable-next-line no-inner-declarations
        function onNetworkCheckUpdate(networkConnectivity) {
            if (!networkConnectivity || !networkConnectivity.goodConnectivity) {
                networkContext.connectivityOK = false;
                networkConnectivityNotGood(networkConnectivity);
            } else if (networkConnectivity && displayGoodSignal.value && networkConnectivity.goodConnectivity && networkConnectivity.upload) {
                document.querySelectorAll('.step').forEach(s => s.classList.add('d-none'));
                const goodNetworkCheckPage = document.querySelector('#step-good-network');
                goodNetworkCheckPage.classList.remove('d-none');
                goodNetworkCheckPage.querySelector(CLASS_SIGNAL_VALUE).innerHTML = '(' + networkConnectivity.upload + ' kb/s)';
                goodNetworkCheckPage.querySelector(CLASS_SIGNAL_MIN_VALUE).innerHTML = BioserverNetworkCheck.UPLOAD_SPEED_THRESHOLD + ' kb/s';
                displayGoodSignal.value = false;
                networkContext.connectivityOK = true; // connectivity results retrieved enough (page displayed)
            } else {
                networkContext.connectivityOK = true; // connectivity results retrieved enough
            }
            if (!networkContext.connectivityOK) { // clear the other waiting screen since we are going to show data from network event
                clearTimeout(networkContext.timeoutCheckConnectivity); // clear the timeout connectivity check
                document.querySelector(ID_CONNECTIVITY_CHECK).classList.add('d-none'); // hide the waiting page
            }
        }

        document.querySelector('#check-network').onclick = function () {
            const weakNetworkCheckPage = document.querySelector('#step-weak-network');
            weakNetworkCheckPage.querySelector('.animation').classList.remove('d-none');
            weakNetworkCheckPage.querySelector('.check-phone').classList.add('d-none');
            displayGoodSignal.value = true;
            window.setTimeout(() => {
                // Possibly reset networkContext.connectivityOK to undefined if needed
                doNetworkCheck(onNetworkCheckUpdate);
            }, 100);
        };
        doNetworkCheck(onNetworkCheckUpdate);
    }
};

/**
 init liveness animations from json files (instead pf GIFs)
 */
exports.initLivenessAnimationsPart1 = function () {
    document.querySelectorAll('.animation-part1').forEach((anim) => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/liveness_animation_part1.json') // the animation data
        });
    });
    document.querySelectorAll('.animation-part1-pc').forEach((anim) => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/liveness_animation_part1_pc.json') // the animation data
        });
    });
};

exports.initLivenessAnimationsPart2 = function () {
    document.querySelectorAll('.animation-part2').forEach((anim) => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/liveness_animation_part2.json') // the animation data
        });
    });
    document.querySelectorAll('.animation-part2-pc').forEach((anim) => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/liveness_animation_part2_pc.json') // the animation data
        });
    });
};

exports.initLivenessAnimationsPart3 = function () {
    document.querySelectorAll('.animation-part3').forEach(anim => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/liveness_animation_part3.json') // the animation data
        });
    });
    document.querySelectorAll('.animation-part3-pc').forEach(anim => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/liveness_animation_part3_pc.json') // the animation data
        });
    });
};

exports.initLivenessAnimationsPartFull = function () {
    document.querySelectorAll('.animation-full').forEach((animationFull) => {
        lottie.loadAnimation({
            container: animationFull, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/liveness_animation_full.json') // the animation data
        });
    });
    document.querySelectorAll('.animation-full-pc').forEach((animationFull) => {
        lottie.loadAnimation({
            container: animationFull, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/liveness_animation_full_pc.json') // the animation data
        });
    });
};

exports.initLivenessPassiveVideoTutorial = function () {
    document.querySelectorAll('.liveness-passive-video-tutorial').forEach((element) => {
        lottie.loadAnimation({
            container: element, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/liveness-passive-video-tutorial.json') // the animation data
        });
    });
};

function displayMsg(elementToDisplay, userInstructionMsgDisplayed, livenessHigh = false) {
    // hide all messages
    document.querySelectorAll(CLASS_VIDEO_OVERLAY).forEach((overlay) => overlay.classList.add(D_NONE_FADEOUT));
    elementToDisplay.classList.remove(D_NONE_FADEOUT);
    // TODO why don't we execute this code for liveness high ?
    if (!livenessHigh) {
        userInstructionMsgDisplayed = window.setTimeout(() => {
            elementToDisplay.classList.add(D_NONE_FADEOUT);
            userInstructionMsgDisplayed = window.clearTimeout(userInstructionMsgDisplayed);
        }, 2000);
    }
}

exports.handlePositionInfo = function (positionInfo, userInstructionMsgDisplayed, livenessHigh = false) {
    const headStartPositionOutline = document.querySelector('#center-head-animation');
    const moveCloserMsg = document.querySelector('#move-closer-animation');
    const moveFurtherMsg = document.querySelector('#move-further-animation');
    const tooBrightMsg = document.querySelector('#darkness');
    const tooDarkMsg = document.querySelector('#brightness');

    // do not show brightness information for high liveness
    if (livenessHigh && (positionInfo === 'TRACKER_POSITION_INFO_MOVE_DARKER_AREA' ||
      positionInfo === 'TRACKER_POSITION_INFO_MOVE_BRIGHTER_AREA')) {
        displayMsg(headStartPositionOutline, userInstructionMsgDisplayed, livenessHigh);
    } else {
        switch (positionInfo) {
            case 'TRACKER_POSITION_INFO_MOVE_BACK_INTO_FRAME': // No head detected
            case 'TRACKER_POSITION_INFO_CENTER_TURN_RIGHT': // Turn your head right
            case 'TRACKER_POSITION_INFO_CENTER_TURN_LEFT': // Turn your head left
            case 'TRACKER_POSITION_INFO_CENTER_ROTATE_UP': // Turn your head up
            case 'TRACKER_POSITION_INFO_CENTER_ROTATE_DOWN': // Turn your head down
            case 'TRACKER_POSITION_INFO_MOVING_TOO_FAST': // You are moving too fast
            case 'TRACKER_POSITION_INFO_CENTER_TILT_RIGHT': // Tilt your head right
            case 'TRACKER_POSITION_INFO_CENTER_TILT_LEFT': // Tilt your head left
            case 'TRACKER_POSITION_INFO_STAND_STILL': // Stand still
                displayMsg(headStartPositionOutline, userInstructionMsgDisplayed, livenessHigh);
                break;
            case 'TRACKER_POSITION_INFO_CENTER_MOVE_BACKWARDS': // Move away from the camera
                displayMsg(moveFurtherMsg, userInstructionMsgDisplayed, livenessHigh);
                break;
            case 'TRACKER_POSITION_INFO_CENTER_MOVE_FORWARDS': // Move closer to the camera
                displayMsg(moveCloserMsg, userInstructionMsgDisplayed, livenessHigh);
                break;
            case 'TRACKER_POSITION_INFO_MOVE_DARKER_AREA': // The place is too bright
                displayMsg(tooBrightMsg, userInstructionMsgDisplayed, livenessHigh);
                break;
            case 'TRACKER_POSITION_INFO_MOVE_BRIGHTER_AREA': // The place is too dark
                displayMsg(tooDarkMsg, userInstructionMsgDisplayed, livenessHigh);
                break;
            default:
                displayMsg(headStartPositionOutline, userInstructionMsgDisplayed, livenessHigh);
                break;
        }
    }
};

exports.genericResetLivenessDesign = async function (session) {
    document.querySelector('header').classList.remove('d-none');
    document.querySelector('main').classList.remove('darker-bg');
    if (session.bestImageURL) {
        window.URL.revokeObjectURL(session.bestImageURL); // free memory
    }
    session.bestImgElement.style.backgroundImage = null;
};

exports.stopVideoCaptureAndProcessResult = async function (session, settings, resetLivenessDesign, success, msg, faceId = '', extendedMsg) {
    session.bestImageId = faceId;
    // we reset the session when we finished the liveness check real session
    resetLivenessDesign();
    document.querySelectorAll('.step').forEach((step) => step.classList.add('d-none'));

    if (success) {
        document.querySelector('#step-liveness-ok').classList.remove('d-none');
        document.querySelectorAll('#step-liveness-ok button').forEach((btn) => btn.classList.add('d-none'));
        if (!settings.idProofingWorkflow) {
            const faceImg = await this.getFaceImage(settings.basePath, session.sessionId, faceId);
            session.bestImageURL = window.URL.createObjectURL(faceImg);
            session.bestImgElement.style.backgroundImage = `url(${session.bestImageURL})`;
            document.querySelector('.success-no-ipv').classList.remove('d-none');
        } else {
            document.querySelector('.success-ipv').classList.remove('d-none');
            document.querySelector('#get-ipv-transaction').classList.remove('d-none');
            document.querySelector('#get-ipv-portrait').classList.remove('d-none');
        }
        const isMatchingEnabled = urlParams.get('enableMatching') === 'true';
        const nextButton = isMatchingEnabled ? 'next-step' : 'reset-step';

        document.querySelectorAll(`#step-liveness-ok button.${nextButton}`).forEach((step) => step.classList.remove('d-none'));
    } else if (msg && (msg.indexOf('Timeout') > -1 || msg.indexOf('failed') > -1)) {
        // We handle failed and timeout similarly, but one may use the id #step-liveness-failed if needed
        document.querySelector('#step-liveness-timeout').classList.remove('d-none');
        document.querySelector('#step-liveness-timeout .footer').classList.add('d-none');
        setTimeout(() => {
            document.querySelector('#step-liveness-timeout .footer').classList.remove('d-none');
        }, 2000);
    } else {
        document.querySelector('#step-liveness-ko').classList.remove('d-none');
        if (msg) {
            // eslint-disable-next-line no-undef
            document.querySelector('#step-liveness-ko .description').textContent = __('Liveness failed');
        }
        const small = document.querySelector('#step-liveness-ko small');
        small.textContent = (extendedMsg && extendedMsg !== 'blur') ? extendedMsg : '';
    }
};

exports.initComponents = function (session, settings, resetLivenessDesign) {
    settings.CLASS_VIDEO_OVERLAY = '#step-liveness .video-overlay';
    settings.D_NONE_FADEOUT = 'd-none-fadeout';
    settings.ID_CONNECTIVITY_CHECK = '#connectivity-check';
    settings.ID_STEP_LIVENESS = '#step-liveness';

    
    session.sessionIdParam = urlParams.get('sessionId');
    session.identityIdParam = urlParams.get('identityId');
    session.networkContext = { connectivityOK: undefined, timeoutCheckConnectivity: undefined };
    session.livenessHeader = document.querySelector('#step-liveness .header');
    session.headStartPositionOutline = document.querySelector('#center-head-animation');
    session.loadingChallenge = document.querySelector('#loading-challenge');
    session.loadingInitialized = document.querySelector('#loading-initialized');
    session.videoMsgOverlays = document.querySelectorAll(settings.CLASS_VIDEO_OVERLAY);

    // define html elements

    session.bestImgElement = document.querySelector('#step-liveness-ok .best-image');
    session.videoOutput = document.querySelector('#user-video');
    session.videoOutput.disablePictureInPicture = true;

    const ID_GET_IPV_STATUS_RESULT = '#get-ipv-status-result';
    const ID_BEST_IMAGE_IPV = '#best-image-ipv';

    /**
     * Button stop activated
     **/
    document.querySelector('#stop-capture').addEventListener('click', async () => {
        resetLivenessDesign();
        if (session.client) {
            session.videoOutput.srcObject = null;
            session.client.disconnect();
        }
    });

    /**
     * Get GIPS Transaction Button activated
     **/
    document.querySelector('#get-ipv-transaction').addEventListener('click', async () => {
        console.log('calling getGipsStatus with identityId=' + session.identityId);
        document.querySelector(ID_GET_IPV_STATUS_RESULT).innerHTML = '';
        const result = await this.getGipsStatus(settings.basePath, session.identityId);
        console.log('result IPV response' + result);
        document.querySelector(ID_GET_IPV_STATUS_RESULT).innerHTML = JSON.stringify(result, null, 2);
        document.querySelector(ID_GET_IPV_STATUS_RESULT).classList.remove('d-none');
    });

    /**
     * Get GIPS Transaction Button activated
     **/
    document.querySelector('#get-ipv-portrait').addEventListener('click', async () => {
        console.log('calling getIpvPortraitButton ');
        document.querySelector(ID_BEST_IMAGE_IPV).src = '';
        const faceImg = await this.getFaceImage(settings.basePath, session.sessionId, session.bestImageId);
        session.bestImageURL = window.URL.createObjectURL(faceImg);
        document.querySelector(ID_BEST_IMAGE_IPV).src = `${session.bestImageURL}`;
        document.querySelector(ID_BEST_IMAGE_IPV).classList.remove('d-none');
    });

    if (urlParams.get('videoTutorial') === 'true') {
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
    const selfieInput = document.querySelector('#selfieInput');

    document.querySelector('#takeMyPickture').addEventListener('click', () => {
        selfieInput.click();
    });
    selfieInput.addEventListener('change', (e) => {
        this.pushFaceAndDoMatch(settings.basePath, session.sessionId, session.bestImageId, e.target.files[0]);
    });

    /**
     * check user connectivity (latency, download speed, upload speed)
     */
    window.onload = () => {
        this.initializeNetworkCheck(session.client, resetLivenessDesign, session.networkContext);
    };

    this.initLivenessAnimationsPart1();
    this.initLivenessAnimationsPart2();
    this.initLivenessAnimationsPartFull();
};
