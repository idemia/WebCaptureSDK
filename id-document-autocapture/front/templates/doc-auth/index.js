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
/*
 * All the JS source code to integrate the demo-doc is present here.
 */

/* global Blob, DocserverVideo, DocserverNetworkCheck, __, DOCSERVER_VIDEO_URL_WITH_BASE_PATH, BASE_PATH, IDPROOFING */
/* eslint no-console: ["error", { allow: ["log", "error"] }] */
const { $, $$ } = require('../../utils/commons');
const { getCurrentDocumentRule } = require('./country-doc-selection');
const lottie = require('lottie-web/build/player/lottie_light.js');
// define html elements
const videoOutput = $('#user-video');
// user instructions msg
const docAuthMask = $('#doc-auth-mask');
const alignDocMsg = $('#align-doc-msg');
const capturedDoc = $('#doc-captured');
const capturedDocBorder = $('#doc-captured .doc-captured-border polygon');
const blurryDocMsg = $('#blurry-doc-msg');
const holdStraightDocMsg = $('#hold-straight-msg');
const reflectionDocMsg = $('#doc-reflection-msg');
const lowLightDocMsg = $('#doc-low-light-msg');
const tooCloseDocMsg = $('#too-close-doc-msg');
const tooFarDocMsg = $('#too-far-doc-msg');
const loadingResults = $('#loading-doc-results');
const videoScanOverlays = $$('#step-doc-auth .video-overlay');

const gipsImageBlock = $('#gips-image-block');
const gipsImageButton = $('#gips-image-button');
const gipsImageContent = $('#gips-image-content');

const gipsTransactionBlock = $('#gips-transaction-block');
const gipsTransactionButton = $('#gips-transaction-button');
const gipsTransactionContent = $('#gips-transaction-content');

let timeoutCheckConnectivity; // settimeout used to stop if network event received
let connectivityOK = false; // network connectivity result even received and is enough
let client; // let start & stop doc capture
let identityId; // identity of the GIPS transaction (if GIPS workflow)
let evidenceId; // evidenceId associated to a document on GIPS (if GIPS workflow)
let bestImageURL; // best image url (in memory window.URL.createObjectURL) (if GIPS workflow)
let videoStream; // user video camera stream
let docSide; // current captured document type (front/back)
let captureInProgress;
let cameraPermissionAlreadyAsked;
let currentDocCorners;
const urlParams = new URLSearchParams(window.location.search); // let you extract params from url

const showLiveCorners = urlParams.get('showLiveCorners') === 'true';
const sessionIdParam = urlParams.get('sessionId');
const connectivityCheckId = '#connectivity-check';
const stepDocAuthId = '#step-doc-auth';
const documentNumberString = 'Document number';
const documentCountryString = 'Document country';
const documentIssueString = 'Document issue date';
const documentExpiryString = 'Document expiry date';
const nameString = 'Name';
const birthDateString = 'Birth date';
const notSpecifiedString = 'Not specified';
const dNoneFadeoutString = 'd-none-fadeout';
const signalValueClass = '.signal-value';
const signalMinValueClass = '.signal-min-value';
const networkSpeedString = '/network-speed';
const networkLatencyString = '/network-latency';

/**
 * 1- init doc auth session (from backend) // TODO TBD
 * 2- init the communication with the server via socket
 * 3- get doc auth result (from backend) // TODO TBD
 */

async function init(options = {}) {
    client = undefined;
    currentDocCorners = undefined;
    docSide = options.docSide;
    initDocAuthDesign(docSide.toLowerCase());
    // get user camera video (front camera is default)
    console.log('Get user camera video');
    videoStream = await DocserverVideo.getDeviceStream({ video: { deviceId: options.deviceId } })
        .catch((e) => {
            let msg = __('Failed to get camera device stream');
            let extendedMsg;
            if (e.name && e.name.indexOf('NotAllowed') > -1) {
                msg = __('You denied camera permissions, either by accident or on purpose.');
                extendedMsg = __('In order to use this demo, you need to enable camera permissions in your browser settings or in your operating system settings.');
            }
            if (e.name && e.name.indexOf('OverconstrainedError') > -1) {
                extendedMsg = __("The selected camera doesn't support required resolution: ") + e.extendedInfo;
            }
            stopVideoCaptureAndProcessResult(false, msg, extendedMsg);
        });
    if (!videoStream) {
        return;
    }
    // display the video stream
    videoOutput.srcObject = videoStream;

    // initialize the doc capture client with callbacks
    const docCaptureOptions = {
        docserverVideoUrl: DOCSERVER_VIDEO_URL_WITH_BASE_PATH,
        onDocCaptured: async (result) => {
            console.log('Document side ' + docSide + ' is captured ...', result);
            captureInProgress = false;
            const sessionId = getCurrentDocumentRule().currentSession;

            console.log('Start polling to retrieve capture result ...', result);
            const docCaptureResult = await getDocCaptureResult(sessionId, getCurrentDocumentRule().selectedDocType, docSide)
                .catch(() => stopVideoCaptureAndProcessResult(false, __('Failed to retrieve capture results')));

            if (docCaptureResult) {
                stopVideoCaptureAndProcessResult(docCaptureResult);
            }
            if (client) {
                client.disconnect();
            }
        },
        trackingFn: (trackingInfo) => {
            displayInstructionsToUser(trackingInfo);
        },
        errorFn: (error) => {
            console.log('got error', error);
            captureInProgress = false;
            stopVideoCaptureAndProcessResult(false, __('Sorry, there was an issue.'));
            if (client) {
                client.disconnect();
            }
        }
    };
    console.log('Init document capture client. Side is : ' + docSide);
    client = await DocserverVideo.initDocCaptureClient(docCaptureOptions);
}

/**
 * Get GIPS Transaction Button activated
 **/
gipsTransactionButton.addEventListener('click', async () => {
    console.log('User clicked on getGipsStatus button with identityId=' + identityId);
    gipsTransactionContent.innerHTML = '';
    const transaction = await getGipsTransaction();
    console.log('IPV response', transaction);
    gipsTransactionContent.innerHTML = JSON.stringify(transaction, null, 2);
    gipsTransactionContent.classList.remove('d-none');
});

/**
 * Get GIPS Transaction Button activated
 **/
gipsImageButton.addEventListener('click', async () => {
    console.log('User clicked on getIpvPortrait button');
    gipsImageContent.src = '';
    const docImg = await getGipsBestImage(identityId, evidenceId);
    bestImageURL = window.URL.createObjectURL(docImg);
    gipsImageContent.src = bestImageURL;
    gipsImageContent.classList.remove('d-none');
});

// when next button is clicked go to targeted step
$$('*[data-target]')
    .forEach(btn => btn.addEventListener('click', async (e) => {
        const sourceStep = e.path && e.path.length && e.path.find(p => p.classList.contains('step'));
        const sourceStepId = sourceStep && sourceStep.id;
        const targetStepId = btn.getAttribute('data-target');
        await processStep(
            sourceStepId, targetStepId,
            btn.hasAttribute('data-delay') && (btn.getAttribute('data-delay') || 2000),
            btn.getAttribute('data-doc-type'))
            .catch(() => stopVideoCaptureAndProcessResult(false));
    }));

async function processStep(sourceStepId, targetStepId, displayWithDelay, docSide) {
    // d-none all steps
    $$('.step').forEach(row => row.classList.add('d-none'));
    if (sessionIdParam && targetStepId === '#step-country-selection') {
        document.location.reload();
    }
    if (targetStepId === connectivityCheckId) {
        if (!connectivityOK) { // bypass this waiting time if we are still here 5 seconds
            document.querySelector(connectivityCheckId).classList.remove('d-none');
            timeoutCheckConnectivity = setTimeout(() => {
                processStep(sourceStepId, targetStepId, displayWithDelay, docSide);
            }, 1000); // call this method until we got the results from the network connectivity
        } else {
            targetStepId = stepDocAuthId; // connectivity check done/failed, move to the next step
        }
    }

    if (targetStepId === stepDocAuthId) { // << if client clicks on start capture
        if (!cameraPermissionAlreadyAsked) { // << display the camera access permission step the first time only
            cameraPermissionAlreadyAsked = true; // TODO: use localStorage ??
            targetStepId = '#step-access-permission';
            // when client accepts camera permission access > we redirect it to the document capture check
            document.querySelector(targetStepId + ' button').setAttribute('data-doc-type', docSide);
        } else {
            $(stepDocAuthId).classList.remove('d-none');

            await init({ docSide: docSide });
            if (client) {
                setTimeout(() => {
                    const { currentSession, selectedDocRule } = getCurrentDocumentRule();
                    selectedDocRule.forEach(docTypeSide => {
                        if (docTypeSide.side.name.toUpperCase() === docSide) {
                            docTypeSide.status = 'processing';
                            // start in currentSession
                            const isRetry = !!docTypeSide.side.scanned;
                            const startCaptureRequest = { stream: videoStream, sessionId: currentSession, isRetry: isRetry };
                            client.start(startCaptureRequest);

                            captureInProgress = true;

                            docTypeSide.side.scanned = captureInProgress;
                        }
                    });
                }, 3000);
            } else {
                return; // no client > no process
            }
        }
    }
    const targetStep = document.querySelector(targetStepId);
    targetStep.classList.remove('d-none');
    const targetStepFooter = targetStep.querySelector('.footer');
    if (targetStepId !== stepDocAuthId && targetStepFooter) {
        targetStepFooter.classList.add('d-none');
        if (displayWithDelay) {
            // display next button after few seconds
            setTimeout(() => targetStepFooter.classList.remove('d-none'), displayWithDelay);
        } else {
            targetStepFooter.classList.remove('d-none');
        }
    }
}
async function stopVideoCaptureAndProcessResult(result, msg, extendedMsg) {
    console.log('Stop capture side');
    resetDocAuthDesigns();
    const isPassport = docSide === 'INSIDE_PAGE';
    const captureOnlyDocImg = getCurrentDocumentRule().selectedDocRule
        .find(r => r.side.name === docSide).captureFeatures.includes('NONE');
    $$('.step').forEach(step => step.classList.add('d-none'));
    const { done, ocr, pdf417, diagnostic, docImage, docCorners } = result;
    const stepId = isPassport ? '#step-scan-passport-result' : `#step-scan-doc-${docSide.toLowerCase()}-result`;
    const stepResult = $(stepId + ' .formatted-results');
    stepResult.innerHTML = '';

    if (result) {
        if (IDPROOFING) {
            identityId = result.identityId;
            evidenceId = result.evidenceId;
            gipsImageBlock.classList.remove('d-none');
            gipsTransactionBlock.classList.remove('d-none');
        }

        if (!done) { // if status is not done => failed/timeout/aborted
            if (diagnostic) { // we cannot have diagnostic when status is done
                appendResultsTo(stepResult, 'Diagnostic', Object.keys(diagnostic).join(', '));
            }
            console.log('Timeout or no result found or partial result found gainst several rules', result);
            if (isPassport) {
                $('#step-scan-passport-error').classList.remove('d-none');
            } else {
                $(`#step-scan-doc-${docSide.toLowerCase()}-error`).classList.remove('d-none');
            }
        } else if (captureOnlyDocImg && docImage) { // we display captured doc for unknown doc - rectangle rule
            docImageCase(docImage, stepResult, docCorners);
            console.log('Unknown doc captured', result);
            $(stepId).classList.remove('d-none');
        } else {
            // calculate pdf417 / OCR / docImage results
            pdf417Case(pdf417, stepResult, stepId);
            const ocrFound = ocrCase(ocr, stepResult);
            docImageCase(docImage, stepResult, docCorners); // docImage is behind ocr + pdf to have image at the bottom
            if (ocrFound) {
                $(stepId).classList.remove('d-none');
            }
        }
    } else {
        $('#step-doc-auth-ko').classList.remove('d-none');
        if (msg) {
            $('#step-doc-auth-ko .description').textContent = msg;
        }
        const small = $('#step-doc-auth-ko small');
        small.textContent = extendedMsg || '';
    }
}

function pdf417Case(pdf417, stepResult, stepId) {
    if (pdf417) { // got pdf417 results
        if (pdf417.documentInfo && pdf417.identity) {
            appendResultsTo(stepResult, documentNumberString, pdf417.documentInfo.documentNumber);
            appendResultsTo(stepResult, documentCountryString, pdf417.documentInfo.issuingCountry);
            appendResultsTo(stepResult, documentIssueString, pdf417.documentInfo.dateOfIssuance);
            appendResultsTo(stepResult, documentExpiryString, pdf417.documentInfo.dateOfExpiry);
            appendResultsTo(stepResult, nameString, buildFullName(pdf417.identity));
            appendResultsTo(stepResult, birthDateString, pdf417.identity.dateOfBirth);
            if (pdf417.identity.gender === notSpecifiedString) {
                pdf417.identity.gender = '';
            }
            appendResultsTo(stepResult, 'Gender', pdf417.identity.gender);
            appendResultsTo(stepResult, 'Address', pdf417.identity.completeAddress);
        } else if (pdf417.rawData) { // got pdf417 raw data on
            appendResultsTo(stepResult, 'Unable to parse information from your barcode', pdf417.rawData, true);
        }
        $(stepId).classList.remove('d-none');
    }
}

function ocrCase(ocr, stepResult) {
    let ocrFound = false;
    if (ocr) {
    // got ocr or/and mrz results
        if (ocr.mrz) {
            ocrFound = true;
            const { documentInfo, identity } = ocr.mrz;
            const mrzTitle = document.createElement('h6');
            mrzTitle.innerHTML = 'MRZ Results: ';
            mrzTitle.style.flex = '1 100%';
            stepResult.appendChild(mrzTitle);
            if (documentInfo) {
                appendResultsTo(stepResult, documentNumberString, documentInfo.documentNumber);
                appendResultsTo(stepResult, documentCountryString, documentInfo.issuingCountry);
                appendResultsTo(stepResult, documentIssueString, documentInfo.dateOfIssuance);
                appendResultsTo(stepResult, documentExpiryString, documentInfo.dateOfExpiry);
            }
            if (identity) {
                appendResultsTo(stepResult, nameString, buildFullName(identity));
                appendResultsTo(stepResult, birthDateString, identity.dateOfBirth);
                if (identity.gender === notSpecifiedString) {
                    identity.gender = '';
                }
                appendResultsTo(stepResult, 'Gender', identity.gender);
                appendResultsTo(stepResult, 'Address', identity.completeAddress);
            }
        } else if (ocr.documentInfo || ocr.identity) {
            ocrFound = true;
            if (ocr.documentInfo) {
                appendResultsTo(stepResult, documentNumberString, ocr.documentInfo.documentNumber);
                appendResultsTo(stepResult, documentCountryString, ocr.documentInfo.issuingCountry);
                appendResultsTo(stepResult, documentIssueString, ocr.documentInfo.dateOfIssuance);
                appendResultsTo(stepResult, documentExpiryString, ocr.documentInfo.dateOfExpiry);
            }
            if (ocr.identity) {
                appendResultsTo(stepResult, nameString, buildFullName(ocr.identity));
                appendResultsTo(stepResult, birthDateString, ocr.identity.dateOfBirth);
                if (ocr.identity.gender === notSpecifiedString) {
                    ocr.identity.gender = '';
                }
                appendResultsTo(stepResult, 'Gender', ocr.identity.gender);
                appendResultsTo(stepResult, 'Address', ocr.identity.completeAddress);
            }
        }
    }
    return ocrFound;
}

function docImageCase(docImage, stepResult, docCorners) {
    if (docImage && !IDPROOFING) {
        const imgLabel = document.createElement('div');
        imgLabel.className = 'result-header';
        imgLabel.innerText = 'Extracted image :';
        const img = document.createElement('img');

        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'result-block best-image-wrapper';
        imgWrapper.appendChild(imgLabel);
        imgWrapper.appendChild(img);
        stepResult.appendChild(imgWrapper);
        img.addEventListener('load', () => {
            const imgWrapperHeight = img.offsetHeight + 20;
            imgWrapper.style.height = imgWrapperHeight + 'px';
            if (docCorners) {
                currentDocCorners = docCorners;
                // display corners on the image
                /*
          <svg class="doc-captured-border">
              <polygon points="0,0" stroke="#ac85df" fill="rgba(67, 0, 153, 0.5)" stroke-linejoin="round" stroke-width="10"/>
          </svg>
        */
                const svgNS = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(svgNS, 'svg');
                svg.style.position = 'absolute';
                svg.style.height = imgWrapperHeight + 'px';
                const coefW = img.offsetWidth / img.naturalWidth;
                const coefH = img.offsetHeight / img.naturalHeight;
                const points = docCorners.map(p => p[0] * coefW + ',' + p[1] * coefH).join(' ');
                const polygon = document.createElementNS(svgNS, 'polygon');
                polygon.style.stroke = '#ac85df';
                polygon.style.fill = 'rgba(172, 133, 223, 0.25)';
                polygon.style.strokeLinejoin = 'round';
                polygon.style.strokeWidth = '10';
                polygon.setAttribute('points', points);
                svg.appendChild(polygon);
                imgWrapper.appendChild(svg);
            }
        });
        img.src = 'data:image/jpeg;base64, ' + docImage;
    }
}

/**
 * prepare video capture elements
 */
function initDocAuthDesign(docSide) {
    gipsImageBlock.classList.add('d-none');
    gipsTransactionBlock.classList.add('d-none');
    $('header').classList.add('d-none');
    $('main').classList.add('darker-bg');
    videoScanOverlays.forEach(overlay => overlay.classList.add(dNoneFadeoutString));
    docAuthMask.classList.remove(dNoneFadeoutString);
    alignDocMsg.querySelectorAll('.video-msg').forEach(msg => msg.classList.add('d-none'));
    alignDocMsg.querySelector(`.video-msg-${docSide.replace('_', '-')}`).classList.remove('d-none');
    alignDocMsg.classList.remove(dNoneFadeoutString);
    adjustDocumentCaptureOverlay();
}
/**
 * reset video capture elements at the end of the process
 */
function resetDocAuthDesigns() {
    $('header').classList.remove('d-none');
    $('main').classList.remove('darker-bg');
    if (bestImageURL) {
        window.URL.revokeObjectURL(bestImageURL);
    } // free memory
}
/**
 * display messages to user during capture (eg: move closer, center your doc ...)
 */
let userInstructionMsgDisplayed;
function displayMsg(elementToDisplay, ttl = 2000) {
    // hide all messages
    if (!userInstructionMsgDisplayed) {
        videoScanOverlays.forEach(overlay => overlay.id !== elementToDisplay.id && overlay.classList.add(dNoneFadeoutString));
        elementToDisplay.classList.remove(dNoneFadeoutString);
        userInstructionMsgDisplayed = window.setTimeout(() => {
            videoScanOverlays.forEach(overlay => overlay.classList.add(dNoneFadeoutString));
            alignDocMsg.classList.remove(dNoneFadeoutString);
            userInstructionMsgDisplayed = window.clearTimeout(userInstructionMsgDisplayed);
        }, ttl);
    }
}

/**
 *
 * @param position
 * @param {boolean} position.blur is frame blurry
 * @param {boolean} position.holdStraight
 * @param {boolean} position.badFraming
 * @param {boolean} position.movement
 * @param {boolean} position.reflection
 * @param {boolean} position.tooClose
 * @param {boolean} position.tooFar
 * @param {boolean} position.goodPosition
 * @param {boolean} position.bestImage
 * @param {Object} corners {w,h,x0,y0,x1,y1,x2,y2,x3,y3}
 * @param pending
 */
function displayInstructionsToUser({ position, corners, pending }) {
    // Event list: badFraming, glare, blur, tooClose, tooFar, holdStraight, lowlight
    if (position) { // << got some message related to document position
        if (position.pdf417) {
            displayMsg(blurryDocMsg);
        } else if (position.holdStraight) {
            displayMsg(holdStraightDocMsg);
        } else if (position.badFraming) {
            displayMsg(alignDocMsg);
        } else if (position.lowlight) {
            displayMsg(lowLightDocMsg);
        } else if (position.reflection) {
            displayMsg(reflectionDocMsg);
        } else if (position.tooClose) {
            displayMsg(tooCloseDocMsg);
        } else if (position.tooFar) {
            displayMsg(tooFarDocMsg);
        } else if (position.blur) {
            displayMsg(blurryDocMsg);
        } else {
            displayMsg(alignDocMsg);
        }
    }
    if (corners) {
    // displayMsg(scanningDocMsg, 5000);
        if (showLiveCorners) {
            const { x0, y0, x1, y1, x2, y2, x3, y3 } = corners;
            const coefW = videoOutput.offsetWidth / videoOutput.videoWidth;
            const coefH = videoOutput.offsetHeight / videoOutput.videoHeight;
            const points = x0 * coefW + ',' + y0 * coefH + ' ' + x1 * coefW + ',' + y1 * coefH + ' ' + x2 * coefW + ',' + y2 * coefH + ' ' + x3 * coefW + ',' + y3 * coefH;
            capturedDocBorder.setAttribute('points', points);
            capturedDoc.classList.remove(dNoneFadeoutString);
        }
    }
    if (pending) {
    // we are waiting for results OCR
        if (userInstructionMsgDisplayed) {
            userInstructionMsgDisplayed = window.clearTimeout(userInstructionMsgDisplayed);
        }
        $$('.step').forEach(step => step.classList.add('d-none'));
        loadingResults.classList.remove('d-none');
    }
}

window.envBrowserOk && $('#step-country-selection').classList.remove('d-none');
/**
 * check user connectivity (latency, download speed, upload speed)
 */
window.onload = () => {
    if (typeof DocserverNetworkCheck !== 'undefined') {
        let ttlInProgress = window.setTimeout(function () {
            onNetworkCheckUpdate();
        }, 10000);
        let displayGoodSignal = false;
        // eslint-disable-next-line no-inner-declarations
        function onNetworkCheckUpdate(networkConnectivity) {
            if (!ttlInProgress || !window.envBrowserOk) { // if environnement check fails, we stop here
                return;
            }
            if (!networkConnectivity || !networkConnectivity.goodConnectivity) {
                networkConnectivityNotGood(networkConnectivity);
            } else if (networkConnectivity && displayGoodSignal && networkConnectivity.goodConnectivity && networkConnectivity.upload) {
                $$('.step').forEach(s => s.classList.add('d-none'));
                const goodNetworkCheckPage = $('#step-good-network');
                goodNetworkCheckPage.classList.remove('d-none');
                goodNetworkCheckPage.querySelector(signalValueClass).innerHTML = '(' + networkConnectivity.upload + ' kb/s)';
                goodNetworkCheckPage.querySelector(signalMinValueClass).innerHTML = DocserverNetworkCheck.UPLOAD_SPEED_THRESHOLD + ' kb/s';
                displayGoodSignal = false;
                connectivityOK = true; // connectivity results retrives + enough (specific page)
            } else {
                connectivityOK = true; // connectivity results retrives + enough
            }
            if (!connectivityOK) { // clear the other waiting screen since we are going to show data from network event
                clearTimeout(timeoutCheckConnectivity); // clear the timeout connectivity check
                document.querySelector(connectivityCheckId).classList.add('d-none'); // hide the waiting page
            }
            ttlInProgress = window.clearTimeout(ttlInProgress);
        }
        DocserverNetworkCheck.connectivityMeasure({
            downloadURL: DOCSERVER_VIDEO_URL_WITH_BASE_PATH + networkSpeedString,
            uploadURL: DOCSERVER_VIDEO_URL_WITH_BASE_PATH + networkSpeedString,
            latencyURL: DOCSERVER_VIDEO_URL_WITH_BASE_PATH + networkLatencyString,
            onNetworkCheckUpdate: onNetworkCheckUpdate
        });
        $('#check-network').onclick = function () {
            const weakNetworkCheckPage = $('#step-weak-network');
            weakNetworkCheckPage.querySelector('.animation').classList.remove('d-none');
            weakNetworkCheckPage.querySelector('.check-phone').classList.add('d-none');
            ttlInProgress = window.setTimeout(function () {
                onNetworkCheckUpdate();
            }, 10000);
            displayGoodSignal = true;
            window.setTimeout(function () {
                DocserverNetworkCheck.connectivityMeasure({
                    downloadURL: DOCSERVER_VIDEO_URL_WITH_BASE_PATH + networkSpeedString,
                    uploadURL: DOCSERVER_VIDEO_URL_WITH_BASE_PATH + networkSpeedString,
                    latencyURL: DOCSERVER_VIDEO_URL_WITH_BASE_PATH + networkLatencyString,
                    onNetworkCheckUpdate: onNetworkCheckUpdate
                });
            }, 100);
        };
    }
};

function networkConnectivityNotGood(networkConnectivity) {
    if (!networkConnectivity && !networkConnectivity.upload) {
        console.log('Unable to check user connectivity within 2 sec.');
    }
    const weakNetworkCheckPage = $('#step-weak-network');
    weakNetworkCheckPage.querySelector('.animation').classList.add('d-none');
    weakNetworkCheckPage.querySelector('.check-phone').classList.remove('d-none');
    weakNetworkCheckPage.querySelector('.upload').classList.add('d-none');
    weakNetworkCheckPage.querySelector('.download').classList.add('d-none');

    $$('.step').forEach(s => s.classList.add('d-none'));
    weakNetworkCheckPage.classList.remove('d-none');
    if (networkConnectivity) {
        const uploadNotGood = !networkConnectivity.upload ? true : (networkConnectivity.upload < DocserverNetworkCheck.UPLOAD_SPEED_THRESHOLD);
        const signalValue = networkConnectivity.upload;
        const signalThreshold = DocserverNetworkCheck.UPLOAD_SPEED_THRESHOLD;
        weakNetworkCheckPage.querySelector(signalValueClass).innerHTML = (signalValue && '(' + signalValue + ' kb/s)') || '';
        weakNetworkCheckPage.querySelector(signalMinValueClass).innerHTML = signalThreshold + ' kb/s';
        if (uploadNotGood) {
            weakNetworkCheckPage.querySelector('.upload').classList.remove('d-none');
        }
    } else { // << case of time out
        weakNetworkCheckPage.querySelector(signalValueClass).innerHTML = '';
        weakNetworkCheckPage.querySelector(signalMinValueClass).innerHTML = DocserverNetworkCheck.UPLOAD_SPEED_THRESHOLD + ' kb/s';
        weakNetworkCheckPage.querySelector('.upload').classList.remove('d-none');
    }
    // close VideoCapture If Needed;
    resetDocAuthDesigns();
    if (client) {
        client.disconnect();
    }
}

/**
 init doc auth animations from json files (instead of GIFs)
 */
function initDocAuthAnimations() {
    $$('.doc-auth-anim-start').forEach(anim => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/doc-auth-anim-start.json') // the animation data
        });
    });
    $$('.doc-place-back-doc').forEach(anim => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/doc-place-back-doc.json') // the animation data
        });
    });
    $$('.doc-scan-back-doc').forEach(anim => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/doc-scan-back-doc.json') // the animation data
        });
    });
    lottie.loadAnimation({
        container: $('.doc-scan-passport'), // the dom element that will contain the animation
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: require('./animations/doc-scan-passport.json') // the animation data
    });
    $$('.doc-scan-front-doc').forEach(anim => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/doc-scan-front-doc.json') // the animation data
        });
    });
}
initDocAuthAnimations();

/**
 * create block for the given title/text and append it to the given parent element
 * ex:
 * <pre>
 *   <div class="result-block">
 *     <div class="result-header">First Name</div>
 *     <div class="result-value">Michael</div>
 *   </div>
 * </pre>
 * @param {HTMLElement} parent the element that the block will be attached to
 * @param {string} title the text that will be set in result-header div
 * @param {string} text the text that will be set in result-value div
 * @param {boolean} rawData if true it will be displayed as link instead of text
 */
function appendResultsTo(parent, title = '', text = '', rawData) {
    const resultBlock = document.createElement('div');
    resultBlock.className = 'result-block';
    const resultHeader = document.createElement('div');
    resultHeader.className = 'result-header';
    resultHeader.innerText = title;
    const resultValue = document.createElement('div');
    resultValue.className = 'result-value result-value-scroll';
    if (text.indexOf('__') > -1) { // if text contains __ then replaced it by <br> html tag
        const p = document.createElement('p');
        text.split('__').forEach(line => {
            p.appendChild(document.createTextNode(line));
            p.innerHTML += '<br>';
        });
        resultValue.innerHTML = p.innerHTML;
    } else if (rawData) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([base64ToArrayBuffer(text).buffer], { type: 'text/plain' })); // or oct-stream ?
        link.innerText = 'Open barcode raw data';
        link.target = '_blank';
        // link.download = 'RawData';
        resultValue.appendChild(link);
    } else {
        resultValue.innerText = text;
    }

    resultBlock.appendChild(resultHeader);
    resultBlock.appendChild(resultValue);
    parent.appendChild(resultBlock);
}
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const binaryLen = binaryString.length;
    const bytes = new Uint8Array(binaryLen);
    for (let i = 0; i < binaryLen; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Retrieve document capture result for specific sessionId, current document type and document side
 * @param sessionId
 * @returns {Promise<*>}
 */
async function getDocCaptureResult(sessionId, docType, docSide, maxAttempts = 20, interval = 1000) {
    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        const path = BASE_PATH + '/doc-capture-result/' + sessionId + '/' + docType + '/' + docSide;

        xhttp.open('GET', path, true);
        xhttp.responseType = 'json';
        xhttp.setRequestHeader('Content-type', 'application/json');
        xhttp.onload = function () {
            console.log('Calling ' + BASE_PATH + '/doc-capture-result/' + sessionId + '/' + docType + '/' + docSide);
            if (xhttp.status) {
                if (xhttp.status === 200) {
                    resolve(xhttp.response);
                } else if (maxAttempts) { // >> polling
                    console.log('Document capture result retrieval, retry ...', maxAttempts);
                    return new Promise(resolve => setTimeout(resolve, interval))
                        .then(() => {
                            resolve(getDocCaptureResult(sessionId, docType, docSide, maxAttempts - 1));
                        });
                } else {
                    console.error('Document capture result retrieval failed, max retries reached');
                    reject(new Error('Document capture result retrieval failed, max retries reached'));
                }
            }
        };
        xhttp.onerror = function () {
            reject(JSON.parse(xhttp.response));
        };
        xhttp.send();
    });
}

async function getGipsBestImage() {
    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        const path = BASE_PATH + '/gips-best-image/' + identityId + '/' + evidenceId;

        xhttp.open('GET', path, true);
        xhttp.responseType = 'blob';
        xhttp.setRequestHeader('Content-type', 'application/json');
        xhttp.onload = function () {
            console.log('Calling ' + BASE_PATH + '/gips-best-image/' + identityId + '/' + evidenceId);

            if (xhttp.status && xhttp.status === 200) {
                resolve(xhttp.response);
            } else {
                console.error('getGipsBestImage failed, max retries reached');
                reject(new Error('getGipsBestImage failed, max retries reached'));
            }
        };
        xhttp.onerror = function () {
            reject(JSON.parse(xhttp.response));
        };
        xhttp.send();
    });
}

async function getGipsTransaction() {
    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        const path = BASE_PATH + '/gips-transaction/' + identityId;

        xhttp.open('GET', path, true);
        xhttp.responseType = 'json';
        xhttp.setRequestHeader('Content-type', 'application/json');
        xhttp.onload = function () {
            console.log('Calling ' + BASE_PATH + '/gips-transaction/' + identityId);

            if (xhttp.status && xhttp.status === 200) {
                resolve(xhttp.response);
            } else {
                console.error('getGipsTransaction failed, max retries reached');
                reject(new Error('getGipsTransaction failed, max retries reached'));
            }
        };
        xhttp.onerror = function () {
            reject(JSON.parse(xhttp.response));
        };
        xhttp.send();
    });
}

window.addEventListener('resize', () => {
    adjustBestImageCorners();
    adjustDocumentCaptureOverlay();
});

function adjustBestImageCorners() {
    $$('.best-image-wrapper').forEach(bestImgWrapper => {
        if (!bestImgWrapper) {
            return;
        }
        const img = bestImgWrapper.querySelector('img');
        if (!img) {
            return;
        }
        // adjust image wrapper height
        const imgWrapperHeight = img.offsetHeight + 20;
        bestImgWrapper.style.height = imgWrapperHeight + 'px';
        if (!currentDocCorners) {
            return;
        }
        // adjust corners on the image
        const svg = bestImgWrapper.querySelector('svg');
        svg.style.height = imgWrapperHeight + 'px';
        const coefW = img.offsetWidth / img.naturalWidth;
        const coefH = img.offsetHeight / img.naturalHeight;
        const points = currentDocCorners.map(p => p[0] * coefW + ',' + p[1] * coefH).join(' ');
        const polygon = svg.querySelector('polygon');
        polygon.setAttribute('points', points);
    });
}
/*
    display document borders regarding it format ID1/ID2/ID3
    (refer to official dimensions https://fr.wikipedia.org/wiki/ISO/CEI_7810 )
 */
function adjustDocumentCaptureOverlay() {
    let maskWidthRatio, maskHeightRatio;
    const iD1 = document.querySelector('.id1');
    const iD2 = document.querySelector('.id2');
    const iD3 = document.querySelector('.id3');
    if (iD1) {
    /* ID1 ratio h=85mm.6 w=53.98mm */
        maskWidthRatio = 158.577251; /* 85.6/53.98 = 1.58577251 */
        maskHeightRatio = 63.0607476; /* 100/63.0607476 = 1.58577251 */
    } else if (iD2) {
    /* ID2 ratio h=105mm w=74 mm */
        maskWidthRatio = 141.891892; /* 105/74 = 1.41891892 */
        maskHeightRatio = 70.4761904; /* 100/70.4761904 = 1.41891892 */
    } else if (iD3) {
    /* ID3 ratio h=125mm w=88mm */
        maskWidthRatio = 142.045455; /* 125/88 = 1.42045455 */
        maskHeightRatio = 70.3999998; /* 100/70.3999998 = 1.42045455 */
    }
    const documentBorders = iD1 || iD2 || iD3;
    if (!documentBorders) {
        return;
    }
    let rootWidth = documentBorders.clientWidth; // window.innerWidth;
    let rootHeight = documentBorders.clientHeight; // window.innerHeight;
    if (rootWidth < rootHeight) { // << if portrait mode then swap the width & height
        [rootWidth, rootHeight] = [rootHeight, rootWidth];
        document.querySelectorAll('.rotatable-wh').forEach(r => {
            r.classList.remove('w-100', 'h-100');
            r.style.width = window.innerHeight + 'px';
            r.style.height = window.innerWidth + 'px';
        });
    } else {
        document.querySelectorAll('.rotatable-wh').forEach(r => {
            r.classList.add('w-100', 'h-100');
        });
    }
    documentBorders.style.setProperty('--mask-h-ratio', (rootWidth * maskHeightRatio / 100) + 'px');
    documentBorders.style.setProperty('--mask-w-ratio', (rootHeight * maskWidthRatio / 100) + 'px');
}
adjustDocumentCaptureOverlay();

function buildFullName(identity) {
    let result;
    if (identity.fullName && identity.fullName.trim() !== '') {
        result = identity.fullName;
    } else {
        result = identity.surname + ' ' + (Array.isArray(identity.givenNames) ? identity.givenNames.join(' ') : '');
    }
    return result;
}
