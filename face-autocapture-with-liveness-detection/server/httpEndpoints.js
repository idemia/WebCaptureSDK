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

// this file contains all http requests endpoints of sample app that allow you to interact with controllers ‘wbs-api.js’ and ‘gips-api.js’

const config = require('./config');
const debug = require('debug')('front:app:httpEndpoints');
const wbsApi = require('./wbs-api');
const gipsApi = require('./gips-api');
const serveStatic = require('serve-static');
const multer = require('multer'); // for files upload
const storage = multer.memoryStorage(); // use in memory
const upload = multer({ storage: storage }); // a temp directory could be used instead
const { setTimeout: sleep } = require('timers/promises');
const ERROR_INIT_LIVENESS_SESSION = 'init-liveness-session failed';

const livenessResults = {};

// eslint-disable-next-line node/no-exports-assign
exports = module.exports;

exports.initHttpEndpoints = (app) => {
    //
    // capabilities on WBS component
    //
    app.get(config.BASE_PATH + '/capabilities', async (_req, res) => {
        try {
            const capabilities = await wbsApi.getCapabilities();
            res.json(capabilities);
        } catch (e) {
            debug('capabilities', e);
            debug('capabilities', e.status, e.statusText);
            res.status(e.status ? e.status : 500).json({ error: 'capabilities failed' });
        }
    });
    //
    // init liveness challenge session (do not create session if sessionId parameter is present as query)
    //
    app.get(config.BASE_PATH + '/init-liveness-session/:sessionId?', async (req, res) => {
        // retrieve new session
        try {
            let session = {};
            let sessionId = req.params.sessionId;
            const identityId = req.query.identityId;

            if (config.IDPROOFING && (!sessionId || sessionId === 'null')) {
                debug('<< sessionId not present, calling getSession..from gips api.');
                session = await gipsApi.getSession(identityId);
                sessionId = session.sessionId;

                livenessResults[sessionId] = {
                    status: 'PENDING',
                    identityId: session.identityId,
                    portraitId: session.portraitId
                };
            } else {
                if (!sessionId || sessionId === 'null') {
                    debug('<< sessionId not present, calling getSession...');

                    sessionId = await wbsApi.getSession();
                } else {
                    debug('<< sessionId present, avoid calling getSession to use : ', sessionId);
                }
                livenessResults[sessionId] = { status: 'PENDING' };
            }
            debug(sessionId, 'init-liveness-session', livenessResults[sessionId]);
            if (session.identityId) {
                res.json(session);
            } else {
                res.json({ sessionId: sessionId });
            }
        } catch (e) {
            debug(ERROR_INIT_LIVENESS_SESSION, e);
            debug(ERROR_INIT_LIVENESS_SESSION, e.status, e.statusText);
            res.status(e.status ? e.status : 500).json({ error: ERROR_INIT_LIVENESS_SESSION });
        }
    });

    //
    // Receive liveness challenge result from WebioServer
    //
    app.post(config.BASE_PATH + config.LIVENESS_RESULT_CALLBACK_PATH, async (req, res) => {
        const sessionId = req.body && req.body.sessionId;
        if (!sessionId) {
            const err = { error: 'Missing mandatory param sessionId' };
            debug('Failed to request liveness result with error:', err);
            res.status(400).send(err);
        } else {
            debug('<< liveness result available on callback for sessionID:', sessionId);
            res.status(204).send();
            let livenessResult;
            try {
                livenessResult = await wbsApi.getLivenessChallengeResult(sessionId);
                debug(sessionId, '< Got liveness challenge result on callback:', livenessResult);
            } catch (err) {
                debug('Failed to get liveness challenge result with error:', err);
            }
            livenessResults[sessionId] = livenessResult;
        }
    });
    //
    // Get gips status result (request coming from client)
    //
    app.get(config.BASE_PATH + '/gips-status/:identityId', async (req, res) => {
        // retrieve sessionId
        const identityId = req.params.identityId;
        debug(identityId, '> gips-status');

        // get status JSON from GIPS
        const gipsStatus = await gipsApi.getGipsStatus({ identityId });
        if (gipsStatus) {
            res.send(gipsStatus);
        } else {
            res.status(500).json({ error: 'gips-status error' });
        }
    });
    //
    // Get liveness challenge result (polling from client)
    //
    app.get(config.BASE_PATH + '/liveness-challenge-result/:sessionId', async (req, res) => {
        // retrieve sessionId
        const sessionId = req.params.sessionId;
        const polling = req.query.polling && req.query.polling === 'true';
        debug(sessionId, '> retrieve liveness-challenge result', { polling });
        if (!sessionId) {
            const error = { error: 'Missing mandatory param sessionId' };
            debug('< get liveness-challenge failed', error);
            res.status(400).json(error);
            return;
        }
        // retrieve liveness result
        let currentLivenessResult = livenessResults[sessionId];
        debug(sessionId, 'liveness-challenge-result content is', currentLivenessResult);
        if (config.IDPROOFING && !currentLivenessResult) {
            debug('< get liveness-challenge failed. Liveness result does not exist anymore');
            res.status(404).json();
            return;
        } else if (config.IDPROOFING && !currentLivenessResult.gipsCalled) {
            await retrieveIPVEvidence({
                identityId: currentLivenessResult.identityId,
                portraitId: currentLivenessResult.portraitId
            }, sessionId);
            currentLivenessResult.gipsCalled = true;
        }
        // Manage result
        try {
            if (!currentLivenessResult && polling) {
                debug(sessionId, '< No liveness-challenge associated to this session');
                res.status(404).send(); // unknown sessionID
            } else if (polling && currentLivenessResult.status === 'PENDING') {
                debug(sessionId, '< Waiting for liveness result callback ');
                res.status(204).send(); // tell client that no liveness result is available for now
            } else {
                if (!polling && !config.IDPROOFING) {
                    debug(sessionId, '> No callback done, retrieve directly liveness challenge results');
                    currentLivenessResult = await wbsApi.getLivenessChallengeResult(sessionId);
                    debug(sessionId, '< Got liveness challenge result:', currentLivenessResult);
                }
                delete livenessResults[sessionId];
                const result = { isLivenessSucceeded: false, message: 'Something was wrong' };
                switch (currentLivenessResult?.livenessStatus) {
                    case 'SUCCESS' :
                        result.message = 'Liveness succeeded';
                        result.isLivenessSucceeded = true;
                        result.bestImageId = currentLivenessResult.bestImageId;
                        break;
                    case 'SPOOF' :
                        result.message = 'Liveness failed';
                        break;
                    case 'TIMEOUT' :
                        result.message = 'Timeout has expired';
                        break;
                    case 'ERROR' :
                    default :
                        result.message = 'Something was wrong';
                        break;
                }

                // add diagnostic field if present
                if (currentLivenessResult?.diagnostic) {
                    result.diagnostic = currentLivenessResult.diagnostic;
                }
                debug(sessionId, '> Send liveness result response');
                res.send(result);
            }
        } catch (e) {
            debug(sessionId, 'get liveness-challenge failed', e.status, e.statusText, e);
            res.status(e.status ? e.status : 500).json({ error: 'get liveness-challenge failed' });
        }
    });

    async function retrieveIPVEvidence({ identityId, portraitId }, sessionId, countDown = 10) {
        let livenessResult;
        do {
            await sleep(1000);
            livenessResult = await gipsApi.getLivenessChallengeResult({ identityId, portraitId });
        } while (livenessResult.livenessStatus === 'PROCESSING' && --countDown);

        if (livenessResults[sessionId] && livenessResult) {
            Object.assign(livenessResults[sessionId], livenessResult);
        }
        debug('< get  livenessResult', livenessResult);
    }

    //
    // Create face
    //
    app.post(config.BASE_PATH + '/bio-session/:bioSessionId/faces', upload.any(),
        async (req, res) => {
            try {
                let image = req.files[0];
                let face = req.files[1];
                if (req.files[0].fieldname !== 'image') {
                    image = req.files[1];
                    face = req.files[0];
                }
                const sessionId = req.params.bioSessionId;
                if (config.IDPROOFING) {
                    res.status(503).json({ error: 'Not yet implemented' });
                } else {
                    const faceResult = await wbsApi.createFace(sessionId, image, face);
                    debug(sessionId, 'create face result', faceResult);
                    if (faceResult.quality >= config.CODING_QUALITY_THRESHOLD) {
                        res.json({ faceId: faceResult.id });
                    } else {
                        res.status(400).send();
                    }
                }
            } catch (e) {
                debug(req.params.bioSessionId, 'create face failed', e.status, e.statusText);
                res.status(e.status ? e.status : 500).send();
            }
        }
    );
    //
    // get face image
    //
    app.get(config.BASE_PATH + '/bio-session/:bioSessionId/faces/:faceId/image', async (req, res) => {
        try {
            const sessionId = req.params.bioSessionId;
            const faceId = req.params.faceId;
            if (config.IDPROOFING) {
                const faceImg = await gipsApi.getFaceImage(faceId);
                debug(sessionId, 'get a face img for faceID', faceId);
                res.status(200).send(faceImg);
            } else {
                const faceImg = await wbsApi.getFaceImage(sessionId, faceId);
                debug(sessionId, 'get a face img for faceID', faceId);
                res.status(200).send(faceImg);
            }
        } catch (e) {
            debug(req.params.bioSessionId, 'get face image failed', e.status, e.statusText);
            res.status(e.status ? e.status : 500).send();
        }
    });
    //
    // get matches
    //
    app.get(config.BASE_PATH + '/bio-session/:bioSessionId/faces/:referenceFaceId/matches/:candidateFaceId', async (req, res) => {
        try {
            if (config.IDPROOFING) {
                res.status(503).json({ error: 'Not yet implemented' });
            } else {
                const referenceFaceId = req.params.referenceFaceId;
                const candidateFaceId = req.params.candidateFaceId;
                const sessionId = req.params.bioSessionId;
                const matchResult = await wbsApi.doMatch(sessionId, referenceFaceId);
                debug(sessionId, 'get matches result', matchResult);
                // check matching score ...
                const match = matchResult.find(m => m.candidate.id === candidateFaceId);
                // client should not see all results (like score) ...
                if (match && match.score >= config.MATCHING_SCORE_THRESHOLD) {
                    res.json(Object.assign({
                        matching: 'ok',
                        score: Math.round(match.score)
                    }));
                } else {
                    res.json(Object.assign({ matching: 'ko', score: Math.round(match.score) }));
                }
            }
        } catch (e) {
            debug(req.params.bioSessionId, 'get matches failed', e.status, e.statusText);
            res.status(e.status ? e.status : 500).send();
        }
    });
    //
    // stream video tutorial
    //
    app.use(config.BASE_PATH + '/video', serveStatic('assets', {
        maxAge: '300000'
    }));
};


