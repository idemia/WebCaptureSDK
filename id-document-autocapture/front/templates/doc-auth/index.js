/*
Copyright 2021 Idemia Identity & Security

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
const mrzNotDetectedMsg = $('#mrz-not-detected-msg');
const pdfNotDetectedMsg = $('#pdf-not-detected-msg');
const holdStraightDocMsg = $('#hold-straight-msg');
const wrongDocOrientationMsg = $('#wrong-orientation-msg');
const reflectionDocMsg = $('#doc-reflection-msg');
const lowLightDocMsg = $('#doc-low-light-msg');
const tooCloseDocMsg = $('#too-close-doc-msg');
const tooFarDocMsg = $('#too-far-doc-msg');
const uploadingCaptures = $('#uploading-doc-captures');
const uploadingInfinite = $('#uploading-infinite');
const uploadingProgress = $('#uploading-progress');
const loadingResults = $('#loading-doc-results');
const loadingInitialization = $('#loading-initialization');
const videoScanOverlays = $$('#step-doc-auth .video-overlay');
const stopCaptureButton = $('#stop-capture-button');

const manualCaptureInput = $('#upload-document-photo');

const gipsImageBlock = $('#gips-image-block');
const gipsImageButton = $('#gips-image-button');
const gipsLoadingProcessing = $('#gips-loading-processing');
const gipsTransactionBlock = $('#gips-transaction-block');
const gipsTransactionButton = $('#gips-transaction-button');
const gipsContinueButton = $('#gips-continue-button');
const gipsTransactionContent = $('#gips-transaction-content pre');

let timeoutCheckConnectivity; // settimeout used to stop if network event received
let connectivityOK; // network connectivity result even received and is enough (keep undefined by default)
let client; // let start & stop doc capture
let clientStartTimeout; // handle the setTimeout where the client.start happens
let identityId; // identity of the GIPS transaction (if GIPS workflow)
let evidenceId; // evidenceId associated to a document on GIPS (if GIPS workflow)
let bestImageURL; // best image url (in memory window.URL.createObjectURL) (if GIPS workflow)
let videoStream; // user video camera stream
let currentDocSide; // current captured document type (front/back)
let captureInProgress;
let changeSideRequired;
let cameraPermissionAlreadyAsked;
let imagesDocCorners;
let countDownTimer; // flip timer
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
const dNoneString = 'd-none';
const signalValueClass = '.signal-value';
const signalMinValueClass = '.signal-min-value';
const networkSpeedString = '/network-speed';
const networkLatencyString = '/network-latency';
const dataDocSideAttribute = 'data-doc-side';
let waitingForManualCapturePhoto;

// TODO read these values from css file
const progressBarBackgroundColor = '#D1C4E3';
const progressBarColor = '#430099';

const conicGradientSupported = CSS.supports('background: conic-gradient(white, black)');

stopCaptureButton.onclick = function () {
    if (!client) {
        console.error('client doesn\'t exist, ignoring stop...');
        return;
    }
    if (clientStartTimeout) {
        clearTimeout(clientStartTimeout); // stops any future execution to start
    }
    console.log('client stop request sent to backend...');
    resetDocAuthDesigns();
    // send abort message to backend
    client.stop();
    videoStream = null;
    videoOutput.srcObject = null;
    let currentTargetStepId;
    switch (currentDocSide.toLowerCase()) {
        case 'inside_page':
            currentTargetStepId = '#step-scan-passport';
            break;
        case 'front':
        case 'back': // back is not possible in fullcapture mode
            currentTargetStepId = '#step-scan-doc-front';
            break;
        default:
            currentTargetStepId = `#step-scan-doc-${currentDocSide.toLowerCase()}`;
            break;
    }
    // display the side to scan again
    processStep('step-doc-auth', currentTargetStepId, null, currentDocSide)
        .catch((err) => {
            console.log('Caught error calling processStep in stopCaptureButton onclick', err);
        });
};

// once user has chosen the document type on UI
// we trigger the capture initialization
// this event ensure document session is created before calling the init
document.addEventListener('sessionId', async function ({ detail: { sessionId, docType, firstSide } }) {
    console.log('<< Got session created', { sessionId, docType });
    if (client) {
        client.disconnect();
        client = undefined;
    }
    await initDocCaptureClient({ sessionId, docSide: firstSide });
});

async function initDocCaptureClient(options = {}) {
    if (client) {
        console.log('captureClient already exist');
        return;
    }
    imagesDocCorners = new Map();
    currentDocSide = options.docSide || 'FRONT';
    console.log('Init called in full document capture mode. Side is: ' + currentDocSide);
    // initialize the doc capture client with callbacks
    const docCaptureOptions = {
        docserverVideoUrl: DOCSERVER_VIDEO_URL_WITH_BASE_PATH,
        fullDocCapture: true,
        sessionId: options.sessionId,
        onClientInitEnd: () => {
            console.log('Capture client init end');
            loadingInitialization.classList.add(dNoneString); // initialization done, remove loading for video preview
            alignDocMsg.classList.remove(dNoneFadeoutString);
        },
        onChangeDocumentSide: (data) => {
            console.log('Document side ' + currentDocSide + ' is captured...');
            console.log('Received onChangeDocumentSide: ', data);
            changeSideRequired = true;
            processStep('step-scan-doc-back', stepDocAuthId, false, 'BACK', data.delay)
                .catch((err) => {
                    console.log('Caught error calling processStep in onChangeDocumentSide', err);
                    processCaptureResult(false);
                });
        },
        onDocCaptured: async (result) => {
            console.log('Document is captured, result received');
            captureInProgress = false;
            processCaptureResult(result);

            if (client && !window.manualCapture) {
                videoOutput.srcObject = null;
                videoStream = null; // it will allow to reload the stream on next capture
                client.disconnect();
            }
        },
        trackingFn: (trackingInfo) => {
            displayInstructionsToUser(trackingInfo);
        },
        errorFn: (error) => {
            console.log('got error', error);
            clearTimeout(countDownTimer);
            captureInProgress = false;
            processCaptureResult(error, __('Sorry, there was an issue.'));
            if (client) {
                videoOutput.srcObject = null;
                videoStream = null; // it will allow to reload the stream on next capture
                client.disconnect();
            }
        }
    };
    console.log('Init document capture client. Side is : ' + currentDocSide);
    try {
        client = await DocserverVideo.initDocCaptureClient(docCaptureOptions);
    } catch (err) {
        console.log('Init document capture client failed:', err);
        displayTechnicalError();
    }
}
async function retrieveUserCamera() {
    if (videoStream) {
        console.log('Video Stream already exist');
        return;
    }
    console.log('Get user camera video');
    try {
        videoStream = await DocserverVideo.getDeviceStream();
        // display the video stream
        videoOutput.srcObject = videoStream;
    } catch (err) {
        let msg = __('Failed to get camera device stream');
        let extendedMsg;
        if (err && err.name && err.name.indexOf('NotAllowed') > -1) {
            msg = __('You denied camera permissions, either by accident or on purpose.');
            extendedMsg = __('In order to use this demo, you need to enable camera permissions in your browser settings or in your operating system settings.');
        }
        if (err && err.name && err.name.indexOf('OverconstrainedError') > -1) {
            extendedMsg = __('The selected camera doesn\'t support required resolution');
        }
        processCaptureResult(false, msg, extendedMsg);
    }
}
/**
 * Get GIPS continue Button activated
 **/
gipsContinueButton.addEventListener('click', async () => {
    console.log('User clicked on getGipsContine button');
    gipsTransactionContent.innerHTML = '';
    gipsImageBlock.querySelectorAll('img')
        .forEach(img => { img.src = ''; });
});

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
 * Get GIPS Image Button activated
 **/
gipsImageButton.addEventListener('click', async () => {
    gipsImageBlock.querySelectorAll('img').forEach(img => { img.src = ''; });
    gipsLoadingProcessing.classList.remove('d-none');
    let transaction = {};
    let i = 0;
    // here we try each 4 seconds to recover gips best image
    const intervalId = window.setInterval(async () => {
        transaction = await getGipsTransaction();
        if (transaction && transaction.globalStatus && transaction.globalStatus.status === 'EXPECTING_INPUT') {
            // status is EXCPECTING_INPUT so we can display gips best image
            clearInterval(intervalId);
            gipsLoadingProcessing.classList.add('d-none');
            if (transaction.idDocuments && transaction.idDocuments.length) {
                const lastDocument = transaction.idDocuments[transaction.idDocuments.length - 1];
                evidenceId = lastDocument.evidenceId;
            }
            const docImages = await getGipsBestImage(identityId, evidenceId);
            if (docImages && docImages.length) {
                for (const item of docImages) {
                    const elem = document.createElement('img');
                    elem.src = 'data:image/jpeg;base64, ' + item.data;
                    elem.setAttribute('class', 'gips-image-content');
                    gipsImageBlock.appendChild(elem);
                }
            }
        }
        if (i === 20) {
            // retrieving image lasts more than 80 seconds
            gipsLoadingProcessing.classList.add('d-none');
            $('#step-scan-gips-result').classList.add('d-none');
            $('#step-doc-auth-ko').classList.remove('d-none');
            clearInterval(intervalId);
            return;
        }
        i++;
    }, 4000);
});

// when next button is clicked go to targeted step
$$('*[data-target]')
    .forEach(btn => btn.addEventListener('click', async (e) => {
        const sourceStep = e.target.closest('.step');
        const sourceStepId = '#' + sourceStep.id;
        const targetStepId = btn.getAttribute('data-target');
        await processStep(sourceStepId, targetStepId,
            btn.hasAttribute('data-delay') && (btn.getAttribute('data-delay') || 2000),
            btn.getAttribute(dataDocSideAttribute))
            .catch((err) => {
                console.log('Caught error calling processStep', err);
                processCaptureResult(false);
            });
    }));

function resetVideoMsgContent() {
    $('.video-msg-change-side').classList.add('d-none');
    alignDocMsg.querySelectorAll('.video-msg').forEach(msg => msg.classList.add('d-none'));
    alignDocMsg.classList.remove('video-overlay-flip'); // remove all background colors (used on flip message)
}

function displayChangeSideUI(startDelay) {
    // Display Change message
    resetVideoMsgContent();
    // remove the abort/close button during the flip operation
    removeAbortButton();
    $('.video-msg-change-side').classList.remove('d-none');
    alignDocMsg.classList.add('video-overlay-flip'); // add background in order to better read the message

    countDownTimer = setTimeout(() => {
        console.log('New side ready to capture');
        // Disable countdown
        clearTimeout(countDownTimer);
        // Display video message
        resetVideoMsgContent();
        alignDocMsg.querySelector('.video-msg-back').classList.remove('d-none');
        alignDocMsg.classList.remove(dNoneFadeoutString);
        displayAbortButton();
    }, startDelay);
}

function displayAbortButton() {
    stopCaptureButton.classList.remove(dNoneString);
}

function removeAbortButton() {
    stopCaptureButton.classList.add(dNoneString);
}

async function processStep(sourceStepId, targetStepId, displayWithDelay, docSide, startDelay = 3000) {
    currentDocSide = docSide;
    if (targetStepId === '#step-manual-capture' || (targetStepId === stepDocAuthId && window.manualCapture)) {
        console.log('Switching to manual capture mode');
        window.manualCapture = true;
        // user already selected a doc type ? => go to front manual capture otherwise go to country selection
        const currentDocumentRule = getCurrentDocumentRule();
        if (currentDocumentRule) {
            targetStepId = currentDocSide === 'INSIDE_PAGE' ? '#step-scan-passport-manual' : '#step-scan-doc-front-manual';
            console.log('User switched to manual capture mode with an already selected document', currentDocumentRule);
        } else { // ask user to select a doc type to capture if he has not selected one yet
            targetStepId = '#step-country-selection';
            console.log('User switched to manual capture mode, no docType selected yet');
        }
    }
    if (targetStepId.startsWith('#start-manual-capture')) {
        const retry = targetStepId.endsWith('retry');
        console.log('start manual capture', { retry });
        waitingForManualCapturePhoto = true;
        client?.startManualCapture({ isRetry: retry });
        manualCaptureInput.click(); // no wait for onInitEnd to not lose user interaction and avoid iOS blocking camera popup to be displayed
        return;
    }
    // d-none all steps
    $$('.step').forEach(row => row.classList.add('d-none'));
    if (targetStepId === connectivityCheckId) {
        if (connectivityOK) {
            targetStepId = stepDocAuthId; // connectivity check done & successful, move to the next step
        } else if (connectivityOK === undefined) {
            // connectivity check in progress, display waiting screen
            $(connectivityCheckId).classList.remove('d-none');
            timeoutCheckConnectivity = setTimeout(() => {
                processStep(sourceStepId, targetStepId, displayWithDelay, docSide);
            }, 1000); // call this method until we got the results from the network connectivity
        } else {
            // Rare case where the connectivity error screen has been shown but covered by another 'step' screen, so show it again to avoid looping endlessly
            networkConnectivityNotGood();
            return;
        }
    }
    if (targetStepId === stepDocAuthId) { // << if client clicks on start capture
        if (!cameraPermissionAlreadyAsked) { // << display the camera access permission step the first time only
            cameraPermissionAlreadyAsked = true; // TODO: use localStorage ??
            targetStepId = '#step-access-permission';
            // when client accepts camera permission access > we redirect it to the document capture check
            $(targetStepId + ' button').setAttribute(dataDocSideAttribute, docSide);
        } else {
            $(stepDocAuthId).classList.remove('d-none');
            initDocAuthDesign(docSide.toLowerCase());
            await retrieveUserCamera();
            if (!client || !videoStream) {
                console.log('client or videoStream not available, start aborted');
                return; // no client > no process
            }
            if (sourceStepId === 'step-scan-doc-back') {
                displayChangeSideUI(startDelay);
            }
            const { selectedDocRule } = getCurrentDocumentRule();

            clientStartTimeout = setTimeout(() => {
                const docTypeSide = selectedDocRule.find(docTypeSide => docTypeSide.side.name.toUpperCase() === docSide);
                if (docTypeSide) {
                    docTypeSide.status = 'processing';
                    if (!changeSideRequired) { // Start only on first side (fullDocCapture)
                        const startCaptureRequest = { stream: videoStream  };
                        client.start(startCaptureRequest);
                    }
                    changeSideRequired = false;
                    captureInProgress = true;
                    docTypeSide.side.scanned = captureInProgress;
                }
            }, docSide !== 'BACK' ? 1000 : startDelay);
        }
    }
    const targetStep = $(targetStepId);
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

function processCaptureResult(result, msg, extendedMsg) {
    $$('.step').forEach(step => step.classList.add('d-none'));
    $$('.status-result').forEach(status => status.classList.add('d-none'));
    const error = !result || result.code;
    waitingForManualCapturePhoto = false;
    if (!error) {
        console.log('Full Document ID: ' + result.id);
        console.log('Full Document status: ', result.status);
        if (result.status) {
            const resultStepId = (currentDocSide === 'INSIDE_PAGE' ? '#step-scan-passport-result' : `#step-scan-doc-${currentDocSide.toLowerCase()}-result`) + (window.manualCapture ? '-manual' : '');
            const resultStatusId = resultStepId + ' .status-result-' + result.status.toLowerCase();
            document.querySelector(resultStatusId).classList.remove('d-none');
        }
    }

    const captures = !error && result.captures;
    if (captures) {
        // display front and back results on the same page
        // merge #step-front-result and #step-back-result and remove footer with buttons from #step-front-result
        captures.forEach((capture, index) => {
            const stepId = processCaptureResultForSide(getDataToDisplay(capture), capture.side.name);
            console.log('Capture ID: ' + capture.id);
            if (index) {
                // Hide logo for elements after the first one
                $(stepId + ' .header').classList.add('d-none');
            }
            if (index !== captures.length - 1) {
                // Hide footer with buttons except for the last element
                $(stepId + ' .footer').classList.add('d-none');
            } else {
                // Display footer with buttons
                $(stepId + ' .footer').classList.remove('d-none');
                // Display the correct restart button depending of the workflow
                displayRestartAndRetryButtons(stepId, result);
                // Last element: Add margin to allow scrolling to the bottom of the image (otherwise it overlaps with footer)
                addMarginForScrollingResult(stepId);
            }
        });
    } else {
        // case of error or manual capture with only one result
        const stepId = processCaptureResultForSide(getDataToDisplay(result), currentDocSide, msg, extendedMsg);
        if (stepId) {
            $(stepId + ' .footer').classList.remove('d-none'); // d-none could have been added from previous capture
            displayRestartAndRetryButtons(stepId, result);
            addMarginForScrollingResult(stepId);
        }
    }
}

function addMarginForScrollingResult(stepId) {
    //  stepId === '#step-scan-doc-back-result' || stepId === '#step-scan-passport-result' || stepId === '#step-scan-doc-unknown-result')
    if (/^#step-scan-(doc-\w*|passport)-result(-manual)?$/.test(stepId)) {
        $(stepId + ' .formatted-results').style.marginBottom = $(stepId + ' .footer').offsetHeight + 'px';
    }
    // if both front & back are displayed then we remove margin from front step
    if (stepId === '#step-scan-doc-back-result' && !$('#step-scan-doc-front-result').classList.contains('d-none')) {
        $('#step-scan-doc-front-result .formatted-results').style.marginBottom = 'unset';
    }
}

function displayRestartAndRetryButtons(stepId, result) {
    const autoCaptureRetryButton = $(stepId + ' button[data-target="#step-doc-auth"]');
    const manualCaptureButton = $(stepId + ' button[data-target="#step-manual-capture"]');
    const manualCaptureRetryButton = $(stepId + ' button[data-target="#start-manual-capture-retry"]');
    // depending on result we highlight the right buttons
    const continueButtons = $$(stepId + ' .continue-btn button');
    const retryButtons = $$(stepId + ' .retry-btn button');
    // Hide all buttons to display only the necessary ones
    $$(stepId + ' .footer button').forEach(button => button.parentElement.classList.add('d-none'));
    // Display the correct restart button depending on the workflow
    $(stepId + ' .continue-btn').classList.remove('d-none');
    if (result.status !== 'DONE') {
        if (window.manualCapture && result.status === 'TIMEOUT') {
            // do not display retry button, no retry possible after a timeout in manual capture
            // highlight continue button
            continueButtons.forEach(btn => {
                btn.classList.add('btn-primary');
                btn.classList.remove('btn-outline-primary');
            });
            return;
        }
        // For auto capture, display retry button with manual capture only on a failure cases
        autoCaptureRetryButton?.parentElement.classList.add('d-none');
        manualCaptureButton?.parentElement.classList.remove('d-none');
        manualCaptureRetryButton?.parentElement.classList.remove('d-none');
        // in case of failure, we highlight the retry button
        continueButtons.forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-primary');
        });
        retryButtons.forEach(btn => {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-outline-primary');
        });
    } else {
        // in case of a success we keep auto capture and highlight continue buttons
        autoCaptureRetryButton?.parentElement.classList.remove('d-none');
        manualCaptureButton?.parentElement.classList.add('d-none');
        manualCaptureRetryButton?.parentElement.classList.remove('d-none');
        // highlight continue button
        continueButtons.forEach(btn => {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-outline-primary');
        });
        retryButtons.forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-primary');
        });
    }
}
function processCaptureResultForSide(result, side, msg, extendedMsg) {
    let stepId = null;
    const error = !result || result.code;
    if (!result) {
        result = {};
    }
    console.log('Processing result for side: ' + side);
    resetDocAuthDesigns();

    if (!error) {
        const isPassport = side === 'INSIDE_PAGE';
        let { status, ocr, pdf417, diagnostic, docImage, docCorners } = result;
        stepId = (isPassport ? '#step-scan-passport-result' : `#step-scan-doc-${side.toLowerCase()}-result`) + (window.manualCapture ? '-manual' : '');
        const stepResult = $(stepId + ' .formatted-results');
        stepResult.innerHTML = '';
        const lastSide = getCurrentDocumentRule().selectedDocRule.length === 1 || side === 'BACK';
        const continueButton = $(stepId + ' .continue-btn button');
        if (lastSide || status === 'TIMEOUT') {
            // handle the case where we have a document with only FRONT side
            // so when we click on continue we should finish the session
            if (side === 'FRONT') {
                updateButtonDataTarget(continueButton, '#step-country-selection', true);
            }
            if (IDPROOFING) {
                if (!urlParams.get('identityId')) {
                    identityId = getCurrentDocumentRule().identityId;
                }
                evidenceId = result.evidenceId;
                gipsImageBlock.classList.remove('d-none');
                gipsTransactionBlock.classList.remove('d-none');
                updateButtonDataTarget(continueButton, '#step-scan-gips-result');
            }
        } else if (side === 'FRONT') { // do not finish the session if there is BACK side to scan
            // reset next side for new retry
            resetButtonDataTarget(continueButton, true);
        }

        // Display capture status
        !window.manualCapture && appendResultsTo(stepResult, 'Side status', status);
        // Display image captured
        docImageCase(docImage, stepResult, docCorners, side.toLowerCase());

        // Handle the case of timeout in manual capture where there is no diagnostic
        if (window.manualCapture && status === 'TIMEOUT') {
            diagnostic = { timeout: true };
        }
        // Display diagnostic
        if (diagnostic) { // we cannot have diagnostic when status is done
            const diagnosticList = Object.keys(diagnostic);
            if (window.manualCapture) {
                // display only issues that are related to diagnostic
                $$(stepId + ' .status-result-failed .results-diagnostic li').forEach(li => {
                    if (diagnosticList.some(diagnostic => li.classList.contains(diagnostic))) {
                        li.classList.remove('d-none');
                    } else {
                        li.classList.add('d-none');
                    }
                });
                $$(stepId + ' .status-result-failed .results-reminder li').forEach(li => {
                    if (diagnosticList.some(diagnostic => li.classList.contains(diagnostic))) {
                        li.classList.remove('d-none');
                    } else {
                        li.classList.add('d-none');
                    }
                });
            } else {
                appendResultsTo(stepResult, 'Diagnostic', diagnosticList.join(', '));
            }
        }

        if (status !== 'DONE' && !pdf417 && !ocr) { // if status is not done and we are not against results from pdf417 or mrz
            console.log('Timeout or no result found or partial result found against several rules', result);
            const errorStepId = (isPassport ? '#step-scan-passport-result' : `#step-scan-doc-${side.toLowerCase()}-result`) + (window.manualCapture ? '-manual' : '');
            $(errorStepId).classList.remove('d-none');
            return errorStepId;
        } else if (pdf417 || ocr) {
            // calculate pdf417 / OCR / docImage results
            pdf417Case(pdf417, stepResult, stepId);
            const ocrFound = ocrCase(ocr, stepResult);
            if (ocrFound) {
                $(stepId).classList.remove('d-none');
            }
        } else if (docImage) { // we display captured document with only detected corners
            console.log('Corners captured on document', result);
            $(stepId).classList.remove('d-none');
        }
    } else if (result.code === 503) { // server overloaded
        $('#step-server-overloaded').classList.remove('d-none');
    } else {
        $('#step-doc-auth-ko').classList.remove('d-none');
        if (msg) {
            $('#step-doc-auth-ko .description').textContent = msg;
        }
        const small = $('#step-doc-auth-ko small');
        small.textContent = extendedMsg || '';

        const btnRefresh = $('#step-doc-auth-ko .refresh');
        const btnRestart = $('#step-doc-auth-ko .restart-demo');
        const manualCaptureButton = $('#step-doc-auth-ko button[data-target="#step-manual-capture"]');
        // Special case for camera permission error
        if (msg === __('You denied camera permissions, either by accident or on purpose.')) {
            // Display refresh button instead of other buttons
            btnRefresh.classList.remove('d-none');
            btnRestart.classList.add('d-none');
            manualCaptureButton.classList.remove('d-none'); // add retry with manual capture
        } else {
            btnRefresh.classList.add('d-none');
            btnRestart.classList.remove('d-none');
            manualCaptureButton.classList.add('d-none');
        }
    }
    return stepId;
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

function docImageCase(docImage, stepResult, docCorners, side) {
    if (docImage) {
        const imgLabel = document.createElement('div');
        imgLabel.className = 'result-header-img';
        // FIXME add translation to this text
        imgLabel.innerText = `${side.toUpperCase().replace('_', ' ')} of the document`;
        const img = document.createElement('img');

        const imgWrapper = document.createElement('div');
        const id = 'result_img_' + side;
        imgWrapper.id = id;
        imgWrapper.className = 'result-block best-image-wrapper';
        imgWrapper.appendChild(imgLabel);
        imgWrapper.appendChild(img);
        stepResult.appendChild(imgWrapper);
        img.addEventListener('load', () => {
            const imgWrapperHeight = img.offsetHeight + 20;
            imgWrapper.style.height = imgWrapperHeight + 'px';
            if (docCorners) {
                imagesDocCorners.set(id, docCorners);
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
    // display the mrz and portrait overlay only in case of passport capture
    if (docSide.toLowerCase() === 'inside_page') {
        document.querySelectorAll('.passport-overlay').forEach(msg => msg.classList.remove('d-none'));
    } else {
        document.querySelectorAll('.passport-overlay').forEach(msg => msg.classList.add('d-none'));
    }
    docAuthMask.classList.remove(dNoneFadeoutString);
    resetVideoMsgContent();
    if (docSide !== 'back') { // do not display initialization loader after doc-flip for back side
        loadingInitialization.classList.remove(dNoneString);
    }
    alignDocMsg.querySelector(`.video-msg-${docSide.replace('_', '-')}`).classList.remove('d-none');
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
 * @param {boolean} position.noDocument
 * @param {boolean} position.bestImage
 * @param {Object} corners {w,h,x0,y0,x1,y1,x2,y2,x3,y3}
 * @param {boolean} pending
 * @param {number} uploadProgress
 */
function displayInstructionsToUser({ position, corners, pending, uploadProgress }) {
    // Event list: badFraming, glare, blur, tooClose, tooFar, holdStraight, lowlight, noDocument
    if (position) { // << got some message related to document position
        if (position.noDocument) {
            displayMsg(alignDocMsg);
        } else if (position.wrongOrientation) {
            displayMsg(wrongDocOrientationMsg);
        } else if (position.tooClose) {
            displayMsg(tooCloseDocMsg);
        } else if (position.tooFar) {
            displayMsg(tooFarDocMsg);
        } else if (position.lowlight) {
            displayMsg(lowLightDocMsg);
        } else if (position.holdStraight) {
            displayMsg(holdStraightDocMsg);
        } else if (position.badFraming) {
            displayMsg(alignDocMsg);
        } else if (position.reflection) {
            displayMsg(reflectionDocMsg);
        } else if (position.pdf417) {
            displayMsg(pdfNotDetectedMsg);
        } else if (position.mrzDecoding) {
            displayMsg(mrzNotDetectedMsg);
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
    if (pending && !changeSideRequired) {
        // we are waiting for results OCR
        if (userInstructionMsgDisplayed) {
            userInstructionMsgDisplayed = window.clearTimeout(userInstructionMsgDisplayed);
        }
        $$('.step').forEach(step => step.classList.add('d-none'));
        uploadingCaptures.classList.remove('d-none');
        // Display infinite loader first, hide progress bar since we don't know yet the percentage
        uploadingInfinite.classList.remove('d-none');
        uploadingProgress.classList.add('d-none');
    }

    if (uploadProgress) {
        // Display progress bar with percentage only if conic-gradient is supported
        if (conicGradientSupported) {
            const progress = Number(uploadProgress * 100).toFixed(0);
            // Now we have percentage, update progress value
            setProgress(progress);
            // Hide infinite loader, display progress bar
            uploadingInfinite.classList.add('d-none');
            uploadingProgress.classList.remove('d-none');
        }

        // When progress has reached 100%, we can switch to next screen
        if (uploadProgress === 1) {
            $$('.step').forEach(step => step.classList.add('d-none'));
            loadingResults.classList.remove('d-none');
        }
    }
}

window.envBrowserOk && $('#step-country-selection').classList.remove('d-none');
/**
 * check user connectivity (latency, download speed, upload speed)
 */
window.onload = () => {
    if (sessionIdParam) {
        const sessionId = sessionIdParam;
        initDocCaptureClient({ sessionId }); // since we doesn't reach the listener that call this init, we should call it here
        // try to read the identityId from query param only if sessionId is also given as input
        if (urlParams.get('identityId')) {
            identityId = urlParams.get('identityId');
        }
    }
    if (typeof DocserverNetworkCheck !== 'undefined') {
        let displayGoodSignal = false;

        // eslint-disable-next-line no-inner-declarations
        function onNetworkCheckUpdate(networkConnectivity) {
            if (!networkConnectivity || !networkConnectivity.goodConnectivity) {
                connectivityOK = false;
                networkConnectivityNotGood(networkConnectivity);
            } else if (networkConnectivity && displayGoodSignal && networkConnectivity.goodConnectivity && networkConnectivity.upload) {
                $$('.step').forEach(s => s.classList.add('d-none'));
                const goodNetworkCheckPage = $('#step-good-network');
                goodNetworkCheckPage.classList.remove('d-none');
                goodNetworkCheckPage.querySelector(signalValueClass).innerHTML = '(' + networkConnectivity.upload + ' kb/s)';
                goodNetworkCheckPage.querySelector(signalMinValueClass).innerHTML = DocserverNetworkCheck.UPLOAD_SPEED_THRESHOLD + ' kb/s';
                displayGoodSignal = false;
                connectivityOK = true; // connectivity results retrieved + enough (specific page)
            } else {
                connectivityOK = true; // connectivity results retrieved + enough
            }

            if (!connectivityOK) { // clear the other waiting screen since we are going to show data from network event
                clearTimeout(timeoutCheckConnectivity); // clear the timeout connectivity check
                $(connectivityCheckId).classList.add('d-none'); // hide the waiting page
            }
        }

        // eslint-disable-next-line no-inner-declarations
        function doNetworkCheck() {
            DocserverNetworkCheck.connectivityMeasure({
                uploadURL: DOCSERVER_VIDEO_URL_WITH_BASE_PATH + networkSpeedString,
                latencyURL: DOCSERVER_VIDEO_URL_WITH_BASE_PATH + networkLatencyString,
                onNetworkCheckUpdate: onNetworkCheckUpdate,
                errorFn: (err) => {
                    console.error('An error occurred while calling connectivityMeasure: ', err);
                    onNetworkCheckUpdate();
                }
            });
        }

        let startCheckConn = setInterval(function () {
            if (window.envBrowserOk) {
                if (startCheckConn) {
                    clearInterval(startCheckConn);
                    startCheckConn = null;
                }
                doNetworkCheck();
            }
        }, 100);
        window.setTimeout(() => {
            if (startCheckConn) {
                clearInterval(startCheckConn);
                startCheckConn = null;
            }
        }, 5000);
        $('#check-network').onclick = function () {
            const weakNetworkCheckPage = $('#step-weak-network');
            weakNetworkCheckPage.querySelector('.animation').classList.remove('d-none');
            weakNetworkCheckPage.querySelector('.check-phone').classList.add('d-none');
            displayGoodSignal = true;
            window.setTimeout(() => {
                // Possibly reset connectivityOK to undefined if needed
                doNetworkCheck();
            }, 100);
        };
    }
};

function networkConnectivityNotGood(networkConnectivity) {
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
    } else { // << case of error
        // eslint-disable-next-line no-console
        console.warn('Unable to check user connectivity');
        weakNetworkCheckPage.querySelector(signalValueClass).innerHTML = '';
        weakNetworkCheckPage.querySelector(signalMinValueClass).innerHTML = DocserverNetworkCheck.UPLOAD_SPEED_THRESHOLD + ' kb/s';
        weakNetworkCheckPage.querySelector('.upload').classList.remove('d-none');
    }
    // close VideoCapture If Needed;
    resetDocAuthDesigns();
    if (client) {
        videoOutput.srcObject = null;
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
    $$('.doc-scan-passport').forEach(anim => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/doc-scan-passport.json') // the animation data
        });
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
    $$('.doc-scan-flip').forEach(anim => {
        lottie.loadAnimation({
            container: anim, // the dom element that will contain the animation
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: require('./animations/doc-scan-flip.json') // the flip animation data
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

async function getGipsBestImage() {
    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        const path = BASE_PATH + '/gips-best-image/' + identityId + '/' + evidenceId;

        xhttp.open('GET', path, true);
        xhttp.responseType = 'json';
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
        if (!imagesDocCorners || !imagesDocCorners.has(bestImgWrapper.id)) {
            return;
        }
        const docCorners = imagesDocCorners.get(bestImgWrapper.id);
        // adjust corners on the image
        const svg = bestImgWrapper.querySelector('svg');
        svg.style.height = imgWrapperHeight + 'px';
        const coefW = img.offsetWidth / img.naturalWidth;
        const coefH = img.offsetHeight / img.naturalHeight;
        const points = docCorners.map(p => p[0] * coefW + ',' + p[1] * coefH).join(' ');
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
    const iD1 = $('.id1');
    const iD2 = $('.id2');
    const iD3 = $('.id3');
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
        $$('.rotatable-wh').forEach(r => {
            r.classList.remove('w-100', 'h-100');
            r.style.width = window.innerHeight + 'px';
            r.style.height = window.innerWidth + 'px';
        });
    } else {
        $$('.rotatable-wh').forEach(r => {
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
        result = Array.isArray(identity.givenNames) ? identity.givenNames.join(' ') + ' ' : '';
        result += identity.surname ? identity.surname : '';
    }
    return result;
}

/**
 * Return expected result format to ui
 * @param documentResult
 */
function getDataToDisplay(documentResult) {
    if (!documentResult || documentResult.error) {
        return documentResult; // do not process result in case of error
    }
    const finalResult = {};

    finalResult.status = documentResult.status;
    finalResult.diagnostic = documentResult.diagnostic;
    finalResult.docImage = documentResult.image;
    finalResult.docCorners = documentResult.corners;
    // ocr mrz ...
    documentResult.rules.forEach(
        rule => {
            if (rule.name === 'OCR') {
                if (finalResult.ocr) {
                    Object.assign(finalResult.ocr, rule.result);
                } else {
                    finalResult.ocr = rule.result;
                }
            }
            if (rule.name === 'MRZ' && rule.result) {
                if (!finalResult.ocr) {
                    finalResult.ocr = {};
                }
                Object.assign(finalResult.ocr, { mrz: rule.result });
            }
            if (rule.name === 'PDF417') {
                finalResult.pdf417 = rule.result;
            }
        }
    );

    return finalResult;
}

$$('.restart-demo button').forEach(btn => {
    btn.addEventListener('click', restartDemoListener);
});
async function restartDemoListener() {
    if (client) {
        console.log('Finishing document capture session ...');
        await client.finishSession();
        // switch to original mode "auto-capture" for a new attempt only if manualCapture is not forced in url and connectivity is OK
        window.manualCapture =  !connectivityOK;
        console.log('Disconnecting client socket...');
        // stop the websocket
        client.disconnect();
        client = undefined;
    }
    videoStream = null;
}

function setProgress(progress) {
    $('#progress-spinner').style.background = `conic-gradient(${progressBarColor} ${progress}%,${progressBarBackgroundColor} ${progress}%)`;
    $('#middle-circle').innerHTML = progress.toString() + '%';
}

function displayTechnicalError(extendedMsg) {
    // TODO a retry button would be useful
    $$('.step').forEach(step => step.classList.add('d-none'));
    $('#step-doc-auth-technical-ko').classList.remove('d-none');
    const small = $('#step-doc-auth-technical-ko small');
    small.textContent = extendedMsg || '';
}

manualCaptureInput.onchange = async (event) => {
    const file = event.target.files[0];
    // Reset value to allow further upload
    event.target.value = '';
    if (!waitingForManualCapturePhoto) {
        console.log('Skip pushing manual capture photo, error or timeout occurred');
        return;
    }
    // display upload progress
    $$('.step').forEach(step => step.classList.add('d-none'));
    uploadingCaptures.classList.remove('d-none');
    // Display infinite loader first, hide progress bar since we don't know yet the percentage
    uploadingInfinite.classList.remove('d-none');
    uploadingProgress.classList.add('d-none');
    console.log('Uploading document photo:', file);
    client?.pushImage(file);
};

function updateButtonDataTarget(button, targetStepId, restartDemo) {
    if (!button.hasAttribute('data-target-origin')) {
        button.setAttribute('data-target-origin', button.getAttribute('data-target'));
    }
    button.setAttribute('data-target', targetStepId);
    if (restartDemo) {
        button.addEventListener('click', restartDemoListener);
    }
}
function resetButtonDataTarget(button, removeRestartDemo) {
    if (button.hasAttribute('data-target-origin')) {
        button.setAttribute('data-target', button.getAttribute('data-target-origin'));
    }
    if (removeRestartDemo) {
        button.removeEventListener('click', restartDemoListener);
    }
}
