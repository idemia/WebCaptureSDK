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

/* eslint-disable no-console */
const defaults = require('./defaults');
const values = Object.assign({}, defaults);



// Extend values with environment variables
for (const [key, value] of Object.entries(process.env)) {
    // Try to parse value in case JSON format is used (except for passwords and secrets)
    if (!/PASSWORD$|SECRET$/.test(key)) {
        try {
            values[key] = JSON.parse(value);
            continue;
        } catch (err) {
        }
    }
    values[key] = value;
}

// Server vars which should not change
values.VIDEO_HEALTH_PATH ||= '/v2/capabilities';
values.VIDEO_SERVER_BASE_PATH ||= '/video-server';
values.DEMO_HEALTH_PATH ||= '/capabilities';
values.CODING_QUALITY_THRESHOLD ||= 0;
values.MATCHING_SCORE_THRESHOLD ||= 3000;
values.GIPS_TENANT_ROLE ||= 'RELYING_SERVICE';
values.API_KEY_SECRET_BIOMETRICS ||= values.WEB_SDK_LIVENESS_ID_DOC;
values.API_KEY_SECRET_WEBSDK ||= values.WEB_SDK_LIVENESS_ID_DOC;
values.ENABLE_IMAGE_COMPRESSION ||= false;
values.WBS_TLS_TRUSTSTORE_PATH ||= null;
values.GIPS_TLS_TRUSTSTORE_PATH ||= null;
values.PROXY_URL ||= null;
values.NON_PROXY_HOSTS ||= 'localhost,127.0.0.1';

// Global Node environment vars
process.env.DEBUG = values.DEBUG || 'front:*';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = values.NODE_TLS_REJECT_UNAUTHORIZED || '1';
process.env.UV_THREADPOOL_SIZE = values.UV_THREADPOOL_SIZE || 10;

module.exports = values;
