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

/* global __ */
/* eslint no-console: ["error", { allow: ["log", "error"] }] */
exports.DOC_SIDE = {
    BACK: 'BACK',
    FRONT: 'FRONT',
    INSIDE_PAGE: 'INSIDE_PAGE',
    UNKNOWN: 'UNKNOWN'
};
exports.DOC_SIDE_RULE = {
    CORNERS: 'CORNERS',
    OCR: 'OCR',
    MRZ: 'MRZ',
    FACE: 'FACE',
    PDF417: 'PDF417'
};
exports.DOC_TYPE = {
    ID_CARD: 'ID_CARD',
    RESIDENT_CARD: 'RESIDENT_CARD',
    PASSPORT: 'PASSPORT',
    DRIVING_LICENSE: 'DRIVING_LICENSE',
    UNKNOWN: 'UNKNOWN'
};
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
/**
 * convert snake case to TitleCase ex: resident_card => resident card, driving_license => driver's license
 * @param camelCaseTxt text in snakeCase
 * @param capital if true set the first letter of each word to capital letter (ex: resident_card => Resident Card)
 * @return {string}
 */
exports.snakeCaseToTitleCase = (camelCaseTxt, capital) => {
    const result = camelCaseTxt.toLowerCase();
    switch (result) {
        case 'document_only':
            return __('Document Only');
        case 'document_with_mrz':
            return __('MRZ Only');
        case 'document_with_pdf417':
            return __('Barcode Only');
        case 'document_with_mrz_pdf417':
            return __('MRZ & Barcode');
        case 'document_with_mrz_on_side1_pdf417_on_side2' :
            return __('MRZ on first side & Barcode on second side');
        case 'identity_card' :
            return capital ? __('Identity Card') : __('identity card');
        case 'driving_license' :
            return capital ? __('Driver\'s License') : __('driver\'s license');
        case 'passport' :
            return capital ? __('Passport') : __('passport');
        case 'resident_card' :
            return capital ? __('Resident Card') : __('resident card');
        default:
            return result.split('_')
                .map(txt => capital ? txt.charAt(0).toUpperCase() + txt.slice(1) : txt)
                .join(' ');
    }
};
/**
 * convert snake case to KebabCase ex: resident_card => resident-card, driving_license => driving-license
 * @param camelCaseTxt text in snakeCase
 * @return {string}
 */
exports.snakeCaseToKebabCase = (camelCaseTxt) => {
    return camelCaseTxt && camelCaseTxt.toLowerCase()
        .split('_')
        .join('-');
};
/**
 * convert camelCase to TitleCase ex: residentCard => Resident Card, drivingLicense => Driving License
 * @param camelCaseTxt text in camelCase
 * @return {string}
 */
exports.camelCaseToTitleCase = (camelCaseTxt) => {
    const result = camelCaseTxt && camelCaseTxt // "ToGetYourGEDInTimeASongAboutThe26ABCsIsOfTheEssenceButAPersonalIDCardForUser456InRoom26AContainingABC26TimesIsNotAsEasyAs123ForC3POOrR2D2Or2R2D"
        .replace(/([a-z])([A-Z][a-z])/g, '$1 $2') // "To Get YourGEDIn TimeASong About The26ABCs IsOf The Essence ButAPersonalIDCard For User456In Room26AContainingABC26Times IsNot AsEasy As123ForC3POOrR2D2Or2R2D"
        .replace(/([A-Z][a-z])([A-Z])/g, '$1 $2') // "To Get YourGEDIn TimeASong About The26ABCs Is Of The Essence ButAPersonalIDCard For User456In Room26AContainingABC26Times Is Not As Easy As123ForC3POOr R2D2Or2R2D"
        .replace(/([a-z])([A-Z]+[a-z])/g, '$1 $2') // "To Get Your GEDIn Time ASong About The26ABCs Is Of The Essence But APersonal IDCard For User456In Room26AContainingABC26Times Is Not As Easy As123ForC3POOr R2D2Or2R2D"
        .replace(/([A-Z]+)([A-Z][a-z][a-z])/g, '$1 $2') // "To Get Your GEDIn Time A Song About The26ABCs Is Of The Essence But A Personal ID Card For User456In Room26A ContainingABC26Times Is Not As Easy As123ForC3POOr R2D2Or2R2D"
        .replace(/([a-z]+)([A-Z0-9]+)/g, '$1 $2') // "To Get Your GEDIn Time A Song About The 26ABCs Is Of The Essence But A Personal ID Card For User 456In Room 26A Containing ABC26Times Is Not As Easy As 123For C3POOr R2D2Or 2R2D"

    // Note: the next regex includes a special case to exclude plurals of acronyms, e.g. "ABCs"
        .replace(/([A-Z]+)([A-Z][a-rt-z][a-z]*)/g, '$1 $2') // "To Get Your GED In Time A Song About The 26ABCs Is Of The Essence But A Personal ID Card For User 456In Room 26A Containing ABC26Times Is Not As Easy As 123For C3PO Or R2D2Or 2R2D"
        .replace(/([0-9])([A-Z][a-z]+)/g, '$1 $2') // "To Get Your GED In Time A Song About The 26ABCs Is Of The Essence But A Personal ID Card For User 456In Room 26A Containing ABC 26Times Is Not As Easy As 123For C3PO Or R2D2Or 2R2D"

    // Note: the next two regexes use {2,} instead of + to add space on phrases like Room26A and 26ABCs but not on phrases like R2D2 and C3PO"
        .replace(/([A-Z]{2,})([0-9]{2,})/g, '$1 $2') // "To Get Your GED In Time A Song About The 26ABCs Is Of The Essence But A Personal ID Card For User 456 In Room 26A Containing ABC 26 Times Is Not As Easy As 123 For C3PO Or R2D2 Or 2R2D"
        .replace(/([0-9]{2,})([A-Z]{2,})/g, '$1 $2') // "To Get Your GED In Time A Song About The 26 ABCs Is Of The Essence But A Personal ID Card For User 456 In Room 26A Containing ABC 26 Times Is Not As Easy As 123 For C3PO Or R2D2 Or 2R2D"
        .trim();
    // capitalize the first letter
    return result && result.charAt(0).toUpperCase() + result.slice(1);
};

exports.getMonitoring = async function (basePath, healthPath) {
    return new Promise(function (resolve, reject) {
        console.log(' >> get monitoring', healthPath);
        const errorMessage = 'getMonitoring failed';

        const xhttp = new window.XMLHttpRequest();
        xhttp.open('GET', basePath + healthPath, true);
        xhttp.setRequestHeader('Content-type', 'application/json');

        xhttp.responseType = 'json';
        xhttp.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                console.log('getMonitoring ok', xhttp.response);
                resolve(xhttp.response);
            } else {
                console.error(errorMessage);
                reject(new Error(errorMessage));
            }
        };
        xhttp.onerror = function () {
            console.log(errorMessage);
            reject(new Error(errorMessage));
        };
        xhttp.send();
    });
};
