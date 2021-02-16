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

const _ = require('lodash')

const defaults = require('./defaults')

const values = _.extend({}, defaults)
// Extend default values with production values


// Extend values with environment variables
_.each(process.env, function (value, key) {
  // Try to parse value in case JSON format is used
  try {
    value = JSON.parse(value)
  } catch (err) {}
    values[key] = value
})


values.VIDEO_HEALTH_PATH = values.VIDEO_HEALTH_PATH || '/v2/capabilities'; // capabilities url of video-server, should be fixed as /health on prod // TODO HEALTH ?
values.VIDEO_SERVER_BASE_PATH = values.VIDEO_SERVER_BASE_PATH || '/video-server';
values.DEMO_HEALTH_PATH = values.DEMO_HEALTH_PATH || '/capabilities'; // capabilities url of demo-server, should be fixed as /health on prod
values.CODING_QUALITY_THRESHOLD = values.CODING_QUALITY_THRESHOLD || 0;
values.MATCHING_SCORE_THRESHOLD = values.MATCHING_SCORE_THRESHOLD || 3000;
values.GIPS_TENANT_ROLE = values.GIPS_TENANT_ROLE || 'RELYING_SERVICE';
values.API_KEY_SECRET_BIOMETRICS = values.API_KEY_SECRET_BIOMETRICS || values.WEB_SDK_LIVENESS_ID_DOC;
values.API_KEY_SECRET_WEBSDK = values.API_KEY_SECRET_WEBSDK || values.WEB_SDK_LIVENESS_ID_DOC;

process.env.DEBUG = values.DEBUG  || '*';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = values.NODE_TLS_REJECT_UNAUTHORIZED || '0';
process.env.UV_THREADPOOL_SIZE = values.UV_THREADPOOL_SIZE  || 10;
module.exports = values;
