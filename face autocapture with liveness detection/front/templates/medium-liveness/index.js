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

// this file is the main program that uses video server api for medium liveness

// define html elements
const videoOutput = document.querySelector('#user-video');
const startCaptureButtons = document.querySelectorAll('.start-capture');
const stopCaptureButton = document.querySelector('#stop-capture');
const challengeAnimation = document.querySelector('#challenge-animation');
const headStartPostionOutline = document.querySelector('#center-head-animation');
const moveCloserMsg = document.querySelector('#move-closer-animation');
const illuminationOverlay = document.querySelector('#illumination-overlay');
const selfieInput = document.querySelector('#selfieInput');

let timeoutCheckConnectivity; // settimeout used to stop if network event received
let connectivityOK = false; // network connectivity result even received and is enough
let client, videoStream, sessionId, face1;

const urlParams = new URLSearchParams(window.location.search);
const isMatchingEnabled = urlParams.get('enableMatching') === 'true';
const isSkipTutorial = urlParams.get('skipTutorial') === 'true';
const recordLabel = urlParams.get('videoBackup');

const sessionIdParam = urlParams.get("sessionId");
const identityIdParam = urlParams.get("identityId");

const basePath = BASE_PATH;
const videoUrlWithBasePath = VIDEO_URL + VIDEO_BASE_PATH;
const videoBasePath = VIDEO_BASE_PATH;
const videoUrl = VIDEO_URL;
const enablePolling = !DISABLE_CALLBACK;
const authenticationInProgress = document.querySelector('#authentication-in-progress');
const useProxy = USE_INTERNAL_PROXY;

/**
 * 1- init liveness session (from backend)
 * 2- init the communication with the server via webrtc & socket
 * 3- get liveness result (from backend)
 * 4- ask the enduser to push his reference image (post to backend)
 * 5- get the matching result between the best image from webRTC and the reference image
 */
async function init() {
    const session = await initLivenessSession(sessionIdParam?sessionIdParam:'', identityIdParam?identityIdParam:'').catch(() => stopVideoCaptureAndProcessResult(false));
    sessionId = session.sessionId;
    identityId = session.identityId
    if (!sessionId) return;
    // get user camera video (front camera is default)
    videoStream = await BioserverVideo.getDeviceStream({video: {width: 1280, height: 720}})
        .catch(() => stopVideoCaptureAndProcessResult(false));
    if (!videoStream) return;
    // display the video stream
    videoOutput.srcObject = videoStream;
    let challengeInProgress = false;

    // initialize the face capture client with callbacks
    const faceCaptureOptions = {
        bioSessionId: sessionId,
        identityId: identityId,
        showChallengeInstruction: (challengeInstruction) => {
            if (challengeInstruction === 'TRACKER_CHALLENGE_PENDING') {
                // pending ==> display waiting msg meanwhile the showChallengeResult callback is called with result
                challengeInProgress = false;
                authenticationInProgress.classList.remove('d-none-fadeout');
            } else { // challengeInstruction == TRACKER_CHALLENGE_2D
                challengeInProgress = true;
                // display challenge animation
                challengeAnimation.classList.remove('d-none-fadeout');
                headStartPostionOutline.classList.add('d-none-fadeout');
                moveCloserMsg.classList.add('d-none-fadeout');
                authenticationInProgress.classList.add('d-none-fadeout');
            }

        },
        showChallengeResult: async () => {
            console.log('Liveness Challenge done > requesting result ...');
            const result= await getLivenessChallengeResult(sessionId).catch(() => stopVideoCaptureAndProcessResult(false));
            stopVideoCaptureAndProcessResult(result.isLivenessSucceeded, result.message, result.bestImageId);
            if (client) client.disconnect();
        },
        trackingFn: (trackingInfo) => {
            displayInstructionsToUser(trackingInfo, challengeInProgress)
            if (trackingInfo.colorDisplay) {
                displayIlluminationOverlay(trackingInfo.colorDisplay, 0);
            }
        },
        errorFn: (error) => {
            console.log("got error", error);
            challengeInProgress = false;
            stopVideoCaptureAndProcessResult(false);
            if (client) client.disconnect();

        }
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
    stopVideoCaptureAndProcessResult(false, 'Liveness interrupted');
    if (client) client.disconnect();
});

// when next button is clicked go to targeted section
document.querySelectorAll('.step button[data-target]')
    .forEach(btn => btn.addEventListener('click', async () => {
        onClick(btn.getAttribute('data-target'));
        if (btn.getAttribute('data-target') === '#connectivity-check') {
            if (!connectivityOK) { 
                timeoutCheckConnectivity = setTimeout(() => {
                    onClick(btn.getAttribute('data-target'))
                }, 1000); //call this method until we got the results from the network connectivity
            } else {
                await startVideoCapture();
            }
        }
    }))

async function startVideoCapture() {
    onClick('#step-4'); // connectivity check done/failed, move to the next step

    // initiatialize the camera
    document.querySelector('header').classList.add('d-none');
    document.querySelector('main').classList.add('darker-bg');

    await init().catch(() => stopVideoCaptureAndProcessResult(false));
    if (client) setTimeout(() => {
        client.start(videoStream, recordLabel)
    }, 2000);
}

function onClick(target) {
    // d-none all steps
    document.querySelectorAll('.step').forEach(row => row.classList.add('d-none'));
    // display targeted step
    const targetStep = document.querySelector(target);
    targetStep.classList.remove('d-none');

    const targetStepFooter = targetStep.querySelector('.footer');
    if (targetStepFooter) {
        targetStepFooter.classList.add('d-none');
        setTimeout(() => targetStepFooter.classList.remove('d-none'), 3000);
    }
}

// gif animations are played only once, this will make them play again
document.querySelectorAll('.reset-animations').forEach(btn => {
    btn.addEventListener('click', () => {
        refreshImgAnimations();
    });
});
// Display first next button of tutorial after 3 sec.
setTimeout(() => document.querySelector('#step-1 .footer').classList.remove('d-none'), 3000);

function refreshImgAnimations() {
    // reload img animations
    document.querySelectorAll('.step > .animation > img').forEach(img => {
        img.src = img.src + '?v=' + Math.random();
    })
}

async function stopVideoCaptureAndProcessResult(success, msg, faceId="") {
    face1=faceId;
    document.querySelector('header').classList.remove('d-none');
    document.querySelector('main').classList.remove('darker-bg');
    challengeAnimation.classList.add('d-none-fadeout');
    authenticationInProgress.classList.add('d-none-fadeout');
    moveCloserMsg.classList.add('d-none-fadeout');
    headStartPostionOutline.classList.remove('d-none-fadeout');
    document.querySelectorAll('.step').forEach(step =>  step.classList.add('d-none'));
    if (success) {
        document.querySelector('#step-5').classList.remove('d-none');
        document.querySelectorAll('#step-5 button').forEach(btn => btn.classList.add('d-none'));
        const faceImg = await getFaceImage(sessionId, faceId);
        const bestImg = document.querySelector('#step-5 .animation .best-image');
        bestImg.style.backgroundImage = 'url('+ window.URL.createObjectURL(faceImg) + ')';
        const nextButton = isMatchingEnabled ? 'next-step' : 'reset-step';
        document.querySelector('#step-5 button.' + nextButton).classList.remove('d-none');
    } else {
        document.querySelector('#step-8').classList.remove('d-none');
        if (msg) document.querySelector('#step-8 .description').textContent = __('Liveness failed');
    }
}

function displayInstructionsToUser(trackingInfo, challengeInProgress) {
    if (trackingInfo.distance) { // << user face found but too far from camera
        challengeAnimation.classList.add('d-none-fadeout');
        headStartPostionOutline.classList.add('d-none-fadeout');
        moveCloserMsg.classList.remove('d-none-fadeout');
    } else if (trackingInfo.faceh === 0 && trackingInfo.facew === 0) { // << no face detected
        challengeAnimation.classList.add('d-none-fadeout');
        headStartPostionOutline.classList.remove('d-none-fadeout');
        moveCloserMsg.classList.add('d-none-fadeout');
    } else { // display challenge instruction
        moveCloserMsg.classList.add('d-none-fadeout');
        headStartPostionOutline.classList.add('d-none-fadeout');
        if (challengeInProgress) {
            challengeAnimation.classList.remove('d-none-fadeout');
        }
    }
}

function displayIlluminationOverlay(colors, i) {
    // show illumination. overlay
    illuminationOverlay.style.backgroundColor = colors[i];
    illuminationOverlay.classList.remove('d-none');
    if (client) client.colorDisplayed();
    // switch illumination overlay color
    setTimeout(function () {
        illuminationOverlay.classList.add('d-none');
        if (colors[i + 2]) displayIlluminationOverlay(colors, i + 2);
    }, colors[i + 1]);
}

async function pushFaceAndDoMatch(selfieImage) {
    try {
        const face2 = await createFace(sessionId, selfieImage);
        const matches = await getMatches(sessionId, face1, face2.faceId);
        document.querySelectorAll('.step').forEach(step =>  step.classList.add('d-none'));
        if (matches.matching === 'ok') {
            document.querySelector('#step-7 .description').innerHTML = 'Matching succeeded <br> score: ' + matches.score;
            document.querySelector('#step-7').classList.remove('d-none');
        } else {
            document.querySelector('#step-8').classList.remove('d-none');
            if (matches.score) document.querySelector('#step-8 .description').innerHTML = 'Matching failed <br> score: ' + matches.score;
        }
        console.log(matches);
    } catch (e) {
        console.error(e);
        stopVideoCaptureAndProcessResult(false);
    }
}


/**
 * init a liveness session
 * @return sessionId
 */
async function initLivenessSession(sessionId='', identityId='') {
    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        let path = basePath + "/init-liveness-session/" + sessionId;
        if(identityId && identityId!=''){
            path = path+"?identityId="+identityId;
        }
        xhttp.open('GET', path, true);
        xhttp.responseType = 'json';

        xhttp.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                resolve(xhttp.response)
            } else {
                console.error('initLivenessSession failed')  ;
                reject();
            }
        };
        xhttp.onerror = function () {
            reject();
        }
        xhttp.send();
    })
}

/**
 * retrieve the liveness challenge result from backend (via polling)
 * @param sessionId
 * @param maxAttempts
 * @param interval
 * @return {isLivenessSucceeded, message}
 */
async function getLivenessChallengeResult(sessionId, maxAttempts = 10, interval = 1000) {

    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        xhttp.open('GET', basePath + '/liveness-challenge-result/'+sessionId+'/?polling='+enablePolling, true);
        xhttp.setRequestHeader('Content-type', 'application/json');
        xhttp.responseType = 'json';
        xhttp.onload = () => {
            if (xhttp.status) {
                if (xhttp.status === 200) {
                    resolve(xhttp.response)
                } else if (maxAttempts) { // >> polling
                    console.log('getLivenessChallengeResult retry ...', maxAttempts);
                    return new Promise(r => setTimeout(r, interval))
                        .then( () => {
                            resolve(getLivenessChallengeResult(sessionId, maxAttempts -1));
                        });
                } else {
                    console.error('getLivenessChallengeResult failed, max retries reached');
                    reject();
                }
            }

        };

        xhttp.onerror = function (e) {
            reject();
        }
        xhttp.send();
    })
}

/**
 * associate a new face to session 
 * @param sessionId session id 
 * @param imageFile face image 
 * @param faceInfo face information
 * @return {Promise<void>}
 */
async function createFace(sessionId, imageFile, faceInfo = '{"imageType" : "SELFIE","friendlyName" : "selfie", "imageRotationEnabled":"true"}') {

    return new Promise(function (resolve, reject) {
        const formData = new window.FormData();
        const xhttp = new window.XMLHttpRequest();
        formData.append('image', imageFile);
        formData.append('face', new window.Blob([faceInfo], {type: 'application/json'}));
        xhttp.open('POST', basePath + '/bio-session/' + sessionId + '/faces', true);
        xhttp.responseType = 'json';
        xhttp.onload = function () {
            document.getElementById("loading").classList.add('d-none');
            if (this.status === 200) {
                resolve(xhttp.response)
            } else {
                console.error('createFace failed')  ;
                reject();
            }
        }
        xhttp.onerror = function () {
            console.error('createFace failed')  ;
            reject(xhttp)
        }
        xhttp.send(formData);
        document.getElementById("loading").classList.remove('d-none');
    })
}

/**
 * retrieve face for a given session 
 * @param sessionId
 * @param faceId
 */
async function getFaceImage(sessionId, faceId) {

    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        xhttp.open('GET', basePath + '/bio-session/' + sessionId + '/faces/'+ faceId + '/image', true);
        xhttp.responseType = 'blob';
        xhttp.onload = function () {
            if (this.status === 200) {
                resolve(xhttp.response)
            } else {
                console.error('createFace failed')  ;
                reject();
            }
        }
        xhttp.onerror = function () {
            console.error('createFace failed')  ;
            reject(xhttp)
        }
        xhttp.send()
    })
}

/**
 * get matches result for a given session and two faces
 * @param sessionId
 * @param referenceFaceId
 * @param candidateFaceId
 */
async function getMatches(sessionId, referenceFaceId, candidateFaceId) {

    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        xhttp.open('GET', basePath + '/bio-session/' + sessionId + '/faces/'+ referenceFaceId + '/matches/' + candidateFaceId, true);
        xhttp.responseType = 'json';
        xhttp.onload = function () {
            if (this.status === 200) {
                resolve(xhttp.response)
            } else {
                console.error('createFace failed')  ;
                reject();
            }
        }
        xhttp.onerror = function () {
            console.error('createFace failed')  ;
            reject(xhttp)
        }
        xhttp.send()
    })
}


document.querySelector('#takeMyPickture').addEventListener('click', () => {
    selfieInput.click();
});
selfieInput.addEventListener('change', (e) => {
    pushFaceAndDoMatch(e.target.files[0])
});

if (isSkipTutorial) {
    // go directly to the capture screen
    startVideoCapture();
}

/**
 * check user connectivity (latency, download speed, upload speed)
 */
window.onload = () => {
    if (BioserverNetworkCheck && !isSkipTutorial) {
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

                document.querySelectorAll('.step').forEach(s => s.classList.add('d-none'));
                weakNetworkCheckPage.classList.remove('d-none');
                if (networkConnectivity) {
                    const uploadNotGood = networkConnectivity.upload;
                    const signalValue = uploadNotGood? networkConnectivity.upload : networkConnectivity.download;
                    const signalThreshold = uploadNotGood?
                        BioserverNetworkCheck.UPLOAD_SPEED_THRESHOLD
                        : BioserverNetworkCheck.DOWNLOAD_SPEED_THRESHOLD;
                    weakNetworkCheckPage.querySelector('.signal-value').innerHTML = signalValue && '(' + signalValue + 'kbps)' || '';
                    weakNetworkCheckPage.querySelector('.signal-min-value').innerHTML = signalThreshold + 'kbps';
                    if (uploadNotGood) weakNetworkCheckPage.querySelector('.upload').classList.remove('d-none');
                    else weakNetworkCheckPage.querySelector('.download').classList.remove('d-none');
                } else { // << case of time out
                    weakNetworkCheckPage.querySelector('.signal-value').innerHTML = '';
                    weakNetworkCheckPage.querySelector('.signal-min-value').innerHTML = BioserverNetworkCheck.DOWNLOAD_SPEED_THRESHOLD + 'kbps';
                    weakNetworkCheckPage.querySelector('.download').classList.remove('d-none');
                }
                // close VideoCapture If Needed;
                if (client) {
                    client.disconnect();
                }
            } else if (networkConnectivity
                && displayGoodSignal
                && networkConnectivity.goodConnectivity
                && networkConnectivity.upload) {
                document.querySelectorAll('.step').forEach(s => s.classList.add('d-none'));
                const goodNetworkCheckPage = document.querySelector('#step-good-network');
                goodNetworkCheckPage.classList.remove('d-none');
                goodNetworkCheckPage.querySelector('.signal-value').innerHTML = '(' + networkConnectivity.download + 'kbps)';
                goodNetworkCheckPage.querySelector('.signal-min-value').innerHTML = BioserverNetworkCheck.DOWNLOAD_SPEED_THRESHOLD + 'kbps';
                displayGoodSignal = false;
                connectivityOK = true; // connectivity results retrived enough (page displayed)
            } else {
                connectivityOK = true; // connectivity results retrives + enough
            }
            if (!connectivityOK) { // clear the other waiting screen since we are going to show data from network event
                clearTimeout(timeoutCheckConnectivity); // clear the timeout connectivity check
                document.querySelector('#connectivity-check').classList.add('d-none'); // hide the waiting page
            }
            ttlInProgress = window.clearTimeout(ttlInProgress);

        }
        let ttlInProgress = window.setTimeout(function () {
            onNetworkCheckUpdate();
        }, 10000);
        let displayGoodSignal = false;
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
            ttlInProgress = window.setTimeout(function () {
                onNetworkCheckUpdate();
            }, 10000);
            displayGoodSignal = true;
            window.setTimeout(function () {
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
}
