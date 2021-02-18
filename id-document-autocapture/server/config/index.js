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

/* eslint-disable no-console */
const defaults = require('./defaults');
const values = Object.assign({}, defaults);



// Extend values with environment variables
for (const [key, value] of Object.entries(process.env)) {
    // Try to parse value in case JSON format is used
    try {
        values[key] = JSON.parse(value);
    } catch (err) {
        values[key] = value;
    }
}

// Server vars which should not change
values.DOC_SERVER_BASE_PATH = values.DOC_SERVER_BASE_PATH || '/doc-server';
values.DOC_CAPTURE_SESSION_TTL = values.DOC_CAPTURE_SESSION_TTL || 1800; // time to live in seconds
values.GIPS_TENANT_ROLE = values.GIPS_TENANT_ROLE || 'RELYING_SERVICE';
values.WDS_TLS_TRUSTSTORE_PATH = values.WDS_TLS_TRUSTSTORE_PATH || null;
values.GIPS_TLS_TRUSTSTORE_PATH = values.GIPS_TLS_TRUSTSTORE_PATH || null;

// Global Node environment vars
process.env.DEBUG = values.DEBUG || '*';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = values.NODE_TLS_REJECT_UNAUTHORIZED || '1';
process.env.UV_THREADPOOL_SIZE = values.UV_THREADPOOL_SIZE || 10;

module.exports = values;
