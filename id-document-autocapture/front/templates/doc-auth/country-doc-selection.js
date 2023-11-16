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

/* global BASE_PATH */
/* eslint no-console: ["error", { allow: ["log", "error"] }] */
const { $, $$, DOC_TYPE, getRulesInText, getNormalizedString, snakeCaseToTitleCase, snakeCaseToKebabCase } = require('../../utils/commons');
const { Allcountries } = require('../../../server/config/countries');

const urlParams = new URLSearchParams(window.location.search); // let you extract params from url
const sessionIdParam = urlParams.get('sessionId');

const countrySelectionElement = $('ul#countries');
const countrySelectionLoaderElement = $('#step-country-selection .loader-animation-wrapper');

const allCountries = Allcountries // reorder the list of countries alphabetically (taking into account accent chars)
    .sort((a, b) => {
        return getNormalizedString(a.name).localeCompare(getNormalizedString(b.name));
    });

let currentDocumentRule; // store current document rule as global variable - link with current session
let currentSession; // store current session
let identityId; // store identity of the GIPS transaction (if GIPS workflow)

// Start of the process, loading supported countries + document types from docserver
// In addition predefined capture rules (store on SP server)  are also loaded in the "other country" part

if (!sessionIdParam) {
    // display loader while loading country selection list
    countrySelectionLoaderElement.classList.remove('d-none');
    retrieveCountryDocTypes().then(function (res) {
        countrySelectionLoaderElement.classList.add('d-none');
        const supportedCountriesDoctypes = res;
        // Map supported countries with  SP  all countries (and identify most frequently used countries)
        const acceptedCountries = res
            .map(c => {
                const country = allCountries.find(country => country.code === c.code);
                if (!country) console.log('Unsupported country details', c.code);
                return country;
            })
            .filter(c => c)
            .sort((a, b) => {
                return getNormalizedString(a.name).localeCompare(getNormalizedString(b.name));
            });

        // init countries screen with the list
        // most frequently used countries first
        const frequentCountries = acceptedCountries
            .filter(c => c.frequent)
            .map(c => {
                return `<li class="country-frequent">
                    <a href="#" data-code="${c.code}">${c.name}</a>
              </li>`;
            });

        // group other countries by their first letter (taking into account accent chars)
        let lastDisplayedLetter = '';
        const otherCountries = acceptedCountries
            .filter(c => !c.frequent)
            .map(c => {
                let countryLetterHeaderElement = '';
                const firstLetterOfCurrentCountry = getNormalizedString(c.name.charAt(0));
                if (lastDisplayedLetter !== firstLetterOfCurrentCountry) {
                    lastDisplayedLetter = firstLetterOfCurrentCountry;
                    countryLetterHeaderElement = `<li class="country-header">
                                        ${firstLetterOfCurrentCountry.toUpperCase()}
                                      </li>`;
                }
                return countryLetterHeaderElement + `<li>
                  <a href="#" data-code="${c.code}" class="${countryLetterHeaderElement ? 'no-borders' : ''}">${c.name}</a>
                </li>`;
            });

        // Display country collection on html page
        countrySelectionElement.innerHTML += frequentCountries.join('') +
        otherCountries.join('');

        // search a country
        $('#country-search-bar').addEventListener('keyup', e => {
            findCountry(e.target.value);
        });

        function findCountry(value) {
            if (value) {
                $$('ul#countries li').forEach(li => {
                    li.style.display = 'none';
                });
                $$('ul#countries li').forEach(li => {
                    const a = li.querySelector('a');
                    if (a && a.textContent &&
              getNormalizedString(a.textContent.toLowerCase())
                  .indexOf(getNormalizedString(value.toLowerCase())) > -1) {
                        li.style.display = 'list-item';
                    }
                });
            } else {
                $$('ul#countries li').forEach(li => {
                    li.style.display = 'list-item';
                });
            }
        }

        // Process country selection event
        // 1- select country code and related document type
        // 2- Display document type
        countrySelectionElement.addEventListener('click', async e => {
            const target = e.target;
            const selectedCountryCode = target.getAttribute('data-code');

            const docTypesForSelectedCountry = supportedCountriesDoctypes.find(country => country.code === selectedCountryCode).docTypes;

            // looking for accepted doc types for this country code

            console.log(`Accepted doc types for ${selectedCountryCode}: ${docTypesForSelectedCountry}`);
            displayListOfDocumentTypes(selectedCountryCode, docTypesForSelectedCountry);
        });
    })
        .catch(function (error) {
            const extendedMsg = 'No supported country or docserver is down';
            displayCountryManagementError(extendedMsg, error);
        });
} else {
    retrieveDocumentSession({ sessionId: sessionIdParam })
        .then(({ sessionId, countryCode, docType, rules, format }) => {
            currentSession = sessionId;
            processDocType(countryCode, rules, docType, format);
        })
        .catch(function (error) {
            const extendedMsg = 'No supported country or docserver is down';
            displayCountryManagementError(extendedMsg, error);
        });
}
/**
 * Handle supported country retrieval or processing error
 * @param extendedMsg
 * @param error
 */
function displayCountryManagementError(extendedMsg, error) {
    console.log(extendedMsg, error);
    $('#step-doc-auth-technical-ko').classList.remove('d-none');
    $('#step-country-selection').classList.add('d-none');

    const small = $('#step-doc-auth-technical-ko small');
    small.textContent = extendedMsg || '';
}

/**
 * Handle document type processing error
 * @param extendedMsg
 * @param error
 */
function displayDoctypeOrSessionError(extendedMsg, error) {
    console.log(extendedMsg, error);
    $('#step-doc-auth-ko').classList.remove('d-none');
    $('#step-doctype-selection').classList.add('d-none');
    const small = $('#step-doc-auth-technical-ko small');
    small.textContent = extendedMsg || '';
}

/**
 * Display list of document type and process document type selection
 * When document type is selected , the docserver side is requested to create session
 * There are two ways for session creation
 * 1- create session with selected country,  document type and return capture rules
 * 2- create session with empty country & document type => the SP will map this request into create session with
 * the selected rules stored on SP sever side.
 * See SP server file: httpEndpoints.js, rules.js
 * @param selectedCountryCode
 * @param docTypesForSelectedCountry
 */
function displayListOfDocumentTypes(selectedCountryCode, docTypesForSelectedCountry) {
    if (docTypesForSelectedCountry && docTypesForSelectedCountry.length) {
        // Display & Process each document type on click event
        //  if (country + document type)  selected , then docserver is requested to create session and retrieve capture rules
        // if (other country + rules identifier ) selected, then SP server retrieves the related rules and request docserver  for session creation with specific rules
        $$('#step-doctype-selection .animation .document-type').forEach(docTypeElmt => {
            docTypeElmt.classList.add('d-none'); // reset old visibility status
            if (!docTypesForSelectedCountry.includes(docTypeElmt.getAttribute('data-doc-type'))) {
                // keep it hidden if not this docType is not supported by the selected country
                return;
            }
            docTypeElmt.classList.remove('d-none');
            docTypeElmt.onclick = async () => {
                const selectedDocType = docTypeElmt.getAttribute('data-doc-type');
                // Ask for document capture session creation
                // display loader while initializing the session
                $$('.step').forEach(s => s.classList.add('d-none'));
                $('#init-session-loader').classList.remove('d-none');
                const docCaptureSession = await initSessionAndRetrieveDocRules(selectedCountryCode, selectedDocType)
                    .catch(function (error) {
                        const extendedMsg = 'Create document capture session failed';
                        displayDoctypeOrSessionError(extendedMsg, error);
                    });

                // keep hold of current document capture session
                if (docCaptureSession) {
                    currentSession = docCaptureSession.sessionId;
                    // rules from docserver if country and document side selected
                    // Rules from SP server if other country and rules identifier selected
                    const docRules = docCaptureSession.rules;
                    const format = docCaptureSession.format;
                    const identity = docCaptureSession.identity;
                    // inform listener in main js that session is created
                    document.dispatchEvent(new CustomEvent('sessionId', { detail: { sessionId: currentSession, docType: selectedDocType } }));

                    // Logs for debug purpose
                    console.log('Session initialized with sessionId ' + currentSession + ' and format ' + format);
                    if (identity) {
                        console.log('Session initialized with GIPS transactionId ' + identity);
                        identityId = identity;
                    }

                    // Process document type selection event
                    // 1- select country code and related document type
                    // 2- Display document type
                    processDocType(selectedCountryCode, docRules, selectedDocType, format);
                } else {
                    const extendedMsg = 'Create document capture session failed';
                    displayDoctypeOrSessionError(extendedMsg, 'Session not created');
                }
            };
        });

        $('#step-doctype-selection #selected-country').innerText = selectedCountryCode === 'XXX' ? '' : selectedCountryCode; // TODO: get country name instead of code?
        $('#step-country-selection').classList.add('d-none');
        $('#step-doctype-selection').classList.remove('d-none');
    } else {
        const extendedMsg = 'No specified document types for this country ';
        console.log(extendedMsg, selectedCountryCode);
        displayCountryManagementError(extendedMsg, 'Session not created');
    }
}

/**
 * Process document type , side and rules
 * @param selectedCountryCode
 * @param docRules
 * @param selectedDocType
 * @param format
 */
function processDocType(selectedCountryCode, docRules, selectedDocType, format) {
    console.log('Process document country=' + selectedCountryCode + ', type=' + selectedDocType + ', format= ' + format);
    let targetStepId, firstSideToScan;
    $$('.step').forEach(row => row.classList.add('d-none'));
    // display document name
    $$('.document-name').forEach(txt => {
        txt.innerHTML = !selectedDocType.startsWith('DOCUMENT') ? `${snakeCaseToTitleCase(selectedDocType)}` : 'document';
    });
    // display document rules on each side
    const selectedDocRule = docRules;

    selectedDocRule.forEach(docTypeSide => {
        const side = docTypeSide.side.name; const rules = docTypeSide.captureFeatures;
        const isPassport = side === 'INSIDE_PAGE';
        const sideName = side.toLowerCase();
        const currentTargetStepId = isPassport ? '#step-scan-passport' : `#step-scan-doc-${sideName}`;
        if (!targetStepId) { // get the first side to scandocType.toLowerCase
            targetStepId = currentTargetStepId;
            firstSideToScan = sideName;
        }
        $$(currentTargetStepId + `, #step-scan-doc-${sideName}-result, #step-scan-doc-${sideName}-error`)
            .forEach(step => {
                step.querySelectorAll('.doc-rule-value').forEach(dr => {
                    const rulesInText = getRulesInText(rules, '#' + step.id === currentTargetStepId); // FIXME bofff
                    if (rulesInText) {
                        dr.innerHTML = rulesInText;
                    }
                });
            });
    });
    // chain the sides in UI
    const sidesNumber = Object.entries(selectedDocRule).length;
    const targetResultStep = $(targetStepId + '-result');
    if (!selectedDocRule.find(rule => rule.side.name === DOC_TYPE.UNKNOWN)) { // TODO: temp ?
        const restartDemoClass = '.restart-demo';
        if (sidesNumber === 1) {
            // we do not continue to next side we have only one side
            targetResultStep.querySelector(restartDemoClass).classList.remove('d-none');
        } else { // we suppose we have two sides only (front & back) to scan
            const nextResultSideStep = firstSideToScan === 'front' ? $('#step-scan-doc-back-result') : $('#step-scan-doc-front-result');
            targetResultStep.querySelector(restartDemoClass).classList.add('d-none');
            nextResultSideStep.querySelector(restartDemoClass).classList.remove('d-none');
        }
        console.log('After this capture, all side required for this document will be captured, you could capture this document again or restart the demo');
    }

    // store current document rule as global variable - link with current session
    currentDocumentRule = { currentSession, selectedCountryCode, selectedDocType, selectedDocRule, identityId };
    console.log('Document rule to be applied', { currentDocumentRule });
    // set current doc type format to adapt UI
    const selectedDocFormat = (!format || format === 'UNKNOWN') ? 'id2' : format.toLowerCase();
    $('body').className = `${selectedDocFormat} ${snakeCaseToKebabCase(selectedDocType)}`;

    // display the first side to scan
    $(targetStepId).classList.remove('d-none');
}

exports.getCurrentDocumentRule = () => { return currentDocumentRule; };

/**
 * Requests SP server for supported countries and their docuemnt types
 * @param countryCode
 * @returns {Promise<unknown>}
 */
async function retrieveCountryDocTypes(countryCode) {
    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        let path = BASE_PATH + '/countries/doc-types';
        if (countryCode) {
            path = path + '?countryCode=' + countryCode;
        }
        xhttp.open('GET', path, true);

        xhttp.responseType = 'json';
        const errorMessage = 'Asking for doc rules failed';
        xhttp.onload = function () {
            if (this.status === 200) {
                resolve(xhttp.response);
            } else {
                console.error(errorMessage);
                reject(new Error(errorMessage));
            }
        };
        xhttp.onerror = function () {
            reject(new Error(errorMessage));
        };
        xhttp.send();
    });
}
function retrieveDocumentSession({ sessionId }) {
    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        const path = BASE_PATH + '/document-sessions/' + sessionId;
        xhttp.open('GET', path, true);
        xhttp.responseType = 'json';
        const errorMessage = 'Asking for doc-session failed';
        xhttp.onload = function () {
            if (this.status === 200) {
                resolve(xhttp.response);
            } else {
                console.error(errorMessage + ' with status:' + this.status);
                reject(new Error(errorMessage));
            }
        };
        xhttp.onerror = function () {
            reject(new Error(errorMessage));
        };
        xhttp.send();
    });
}

/**
 *  Requests SP server for session creation and retrieves capture rules
 *  if (country + document type)  exists , then SP server forwoard request to docserver  that  creates session and returns capture rules.
 *  if (country + document type) selected, then SP server retrieves the related rules and request docserver  for session creation with specific rules.
 * @param countryCode
 * @param docType
 * @returns {Promise<unknown>}
 */
async function initSessionAndRetrieveDocRules(countryCode, docType) {
    console.log('Retrieve document rules for country ' + countryCode + ' and type ' + docType);

    const session = {
        countryCode: countryCode,
        docType: docType
    };

    console.log('Initialize capture session');
    return iniDocumenCaptureSession(session);
}

/**
 * HTTP client for session creation request
 * @param session
 * @returns {Promise<unknown>}
 */
function iniDocumenCaptureSession(session) {
    return new Promise(function (resolve, reject) {
        const xhttp = new window.XMLHttpRequest();
        const path = BASE_PATH + '/init-document-session';
        xhttp.open('POST', path, true);
        xhttp.setRequestHeader('Content-Type', 'application/json');
        xhttp.setRequestHeader('Accept', '*/*'); // accept all
        xhttp.responseType = 'json';
        const errorMessage = 'Init session and retrieve document type rules failed';

        xhttp.onload = function () {
            console.log('Calling ' + BASE_PATH + '/init-document-session');
            if (this.status === 200) {
                resolve(xhttp.response);
            } else {
                console.error(errorMessage);
                reject(new Error(errorMessage));
            }
        };
        xhttp.onerror = function () {
            console.error(errorMessage);
            reject(new Error(errorMessage));
        };
        xhttp.send(JSON.stringify(session));
    });
}
