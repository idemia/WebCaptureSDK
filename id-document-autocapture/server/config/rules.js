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
/*
 * File used to retrieve the rules to apply depending on the user's document and country selection
 */
const logger = require('./demoLogConf').getLogger();

/**
 * side: FRONT | BACK | INSIDE_PAGE | UNKNOWN
 * format: ID1 | ID2 | ID3 | undefined
 * captureFeatures: NONE | MRZ | PDF417
 */
const documentRules = [{
    countries: [], // this is the default rules to be applied on unknown/unsupported countries
    rules: [{
        docType: 'DOCUMENT_ONLY', // Document type only used in the demo, do not supply to docserver
        format: 'ID1',
        sides: [{
            id: 'SIDE1',
            name: 'FRONT',
            captureFeatures: ['NONE']
        }]
    }, {
        docType: 'DOCUMENT_WITH_MRZ', // Document type only used in the demo, do not supply to docserver
        format: 'ID1',
        sides: [{
            id: 'SIDE1',
            name: 'FRONT',
            captureFeatures: ['MRZ']
        }]
    }, {
        docType: 'DOCUMENT_WITH_PDF417', // Document type only used in the demo, do not supply to docserver
        format: 'ID1',
        sides: [{
            id: 'SIDE1',
            name: 'FRONT',
            captureFeatures: ['PDF417']
        }]
    }, {
        docType: 'DOCUMENT_WITH_MRZ_ON_SIDE1_PDF417_ON_SIDE2', // Document type only used in the demo, do not supply to docserver
        format: 'ID1',
        sides: [{
            id: 'SIDE1',
            name: 'FRONT',
            captureFeatures: ['MRZ']
        }, {
            id: 'SIDE2',
            name: 'BACK',
            captureFeatures: ['PDF417']
        }]
    }]
}];

function findDocTypesByCountry() {
    const docTypes = [];
    documentRules
        .filter(countryRule => countryRule.countries.length === 0)
        .reduce((acc, countryRule) => acc.concat(countryRule.rules), [])
        .forEach(rule => {
            docTypes.push(rule.docType);
        });
    if (!docTypes.length) {
        logger.warn('Unsupported country');
        return;
    }
    const countryDocTypes = { code: '', docTypes: docTypes };
    logger.info('Found %d docTypes', countryDocTypes.docTypes.length);
    logger.debug('countryDocTypes:', countryDocTypes);
    return countryDocTypes;
}

/**
 * @param country
 * @param docType
 * @return DocumentSideRules
 */
function findRulesByCountryAndType(country, docType) {
    logger.info(`Asking document rules for country: ${country || 'unknown'}, document type: ${docType}`);
    const result = documentRules
        .filter(countryRule => countryRule.countries.includes(country) || !countryRule.countries.length)
        .map(countryRule => countryRule.rules.find(rule => rule.docType === docType))
        .find(countryRule => countryRule);
    logger.info('Retrieved document rules:', result);
    if (!result) {
        return null;
    }
    // map conf rule to object model
    return result.sides.map(({ id, name, captureFeatures }) => createDocumentSideRules({ side: { id, name }, captureFeatures }));
}

function createDocumentSideRules({ side, captureFeatures } = {}) {
    const result = {};
    result.side = side && createSide(side);
    result.captureFeatures = captureFeatures;
    return result;
}

function createSide({ id, name } = {}) {
    const result = {};
    result.id = id;
    result.name = name;
    return result;
}

module.exports = {
    findDocTypesByCountry,
    findRulesByCountryAndType
};
