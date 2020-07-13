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
const multer  = require('multer'); // for files upload
const storage = multer.memoryStorage(); // use in memory
const upload = multer({ storage: storage });

let livenessResults = {};

exports = module.exports;

// init all endpoint at server starting
exports.initHttpEndpoints = (app) => {
    //
    // init liveness challenge session (do not create session if sessionId parameter is present as query)
    //
    app.get(config.BASE_PATH + '/init-liveness-session/:sessionId?', async (req, res) => {
        // retrieve new session
        try {
            let session = {}
            let sessionId = req.params.sessionId;
            let identityId = req.query.identityId;

            if (config.IDPROOFING && (!sessionId || sessionId == 'null')) {
                debug('<< sessionId not present, calling getSession..from gips api.');
                session  = await gipsApi.getSession(identityId);
                sessionId = session.sessionId;

                livenessResults[sessionId]=
                    {status: 'PENDING',
                        identityId:session.identityId,
                        portraitId:session.portraitId};
            } else {

                if (!sessionId || sessionId == 'null') {
                    debug('<< sessionId not present, calling getSession...');

                    sessionId = await wbsApi.getSession();
                } else {
                    debug('<< sessionId present, avoid calling getSession to use : ', sessionId);
                }
                livenessResults[sessionId] = {status: 'PENDING'};
            }
            debug(sessionId, 'init-liveness-session', livenessResults[sessionId]);
            if(session.identityId){
                res.json(session);
            } else {
                res.json({sessionId: sessionId});
            }
        } catch(e) {
            debug('init-liveness-session failed', e);
            debug('init-liveness-session failed', e.status, e.statusText);
            res.status(e.status ? e.status : 500).json({error: 'init-liveness-session failed'});
        }
    });
    //
    // Receive liveness challenge result from WebioServer
    //
    app.post(config.BASE_PATH + config.LIVENESS_RESULT_CALLBACK_PATH, async (req, res) => {
        const sessionId = req.body && req.body.sessionId;
        if (!sessionId) {
            const err = {error: 'Missing mandatory param sessionId'};
            debug('Failed to request liveness result with error:', err);
            res.status(400).send(err);
        } else {

            debug('<< liveness result available for sessionID: ', sessionId);
            res.status(204).send();
            const livenessResult = await wbsApi.getLivenessChallengeResult(sessionId,
                config.LIVENESS_MODE, config.LIVENESS_HIGH_NUMBER_OF_CHALLENGE, config.LIVENESS_SECURITY_LEVEL).catch(err => {
                debug('Failed to request liveness result with error:', err);
            });
            debug(sessionId, 'Request liveness result', livenessResult);
            livenessResults[sessionId] = livenessResult;
            //setTimeout( () => {livenessResults[sessionId] = livenessResult}, 5000);
        }
    });
    //
    // Get liveness challenge result (polling from client)
    //
    app.get(config.BASE_PATH + '/liveness-challenge-result/:sessionId', async (req, res) => {
        // retrieve sessionId
        let sessionId = req.params.sessionId;
        let polling = req.query.polling && req.query.polling==='true';
        debug(sessionId, '> retrieve liveness-challenge result', {polling});

        if (config.IDPROOFING && !livenessResults[sessionId].pooling) {
            await retrieveIPVEvidence({
                identityId: livenessResults[sessionId].identityId,
                portraitId: livenessResults[sessionId].portraitId
            }, sessionId);
            livenessResults[sessionId].pooling = true;
        }
        if (!sessionId) {
            const error = {error: 'Missing mandatory param sessionId'};
            debug('< get liveness-challenge failed', error);
            res.status(400).json(error);
        } else {
            try {
                let livenessResult = livenessResults[sessionId];
                if (!livenessResult) {
                    debug(sessionId, '< No liveness-challenge associated to this session');
                    res.status(404).send(); // unknown sessionID
                } else if (polling && livenessResult.status === 'PENDING') {
                    debug(sessionId, '< Waiting for liveness result callback ');
                    res.status(204).send(); // tell client that no liveness result is available for now
                } else {
                    if (!polling && !config.IDPROOFING) {
                        debug(sessionId, '> No callback done, retrieve directly liveness challenge results');

                        livenessResult = await wbsApi.getLivenessChallengeResult(sessionId,
                             config.LIVENESS_MODE,
                            config.LIVENESS_HIGH_NUMBER_OF_CHALLENGE, config.LIVENESS_SECURITY_LEVEL);
                    }
                    delete livenessResults[sessionId];
                    debug(sessionId, '< Got liveness-challenge result', {livenessResult});
                    let result = {isLivenessSucceeded: false, message: 'Something was wrong'};
                    if (livenessResult.livenessStatus === 'SUCCESS') {
                        result.message = 'Liveness succeeded';
                        result.isLivenessSucceeded = true;
                        result.bestImageId = livenessResult.bestImageId;
                    } else if (livenessResult.livenessStatus === 'SPOOF' || livenessResult.livenessStatus === 'SPOOF_JS') {
                        result.message = 'Liveness failed';
                    } else if (livenessResult.livenessStatus === 'TIMEOUT') {
                        result.message = 'Timeout has expired';
                    } else if (livenessResult.livenessStatus === 'ERROR') {
                        result.message = 'Something was wrong';
                    }
                    res.send(result);
                }
            } catch(e) {
                debug(sessionId, 'get liveness-challenge failed', e.status, e.statusText, e);
                res.status(e.status ? e.status : 500).json({error: 'get liveness-challenge failed'});
            }
        }
    });

    let wait = async (ttl) => {
        return new Promise((resolve,error) => 
            setTimeout( () => resolve(), ttl )
        );
    }


    async function retrieveIPVEvidence({identityId, portraitId}, sessionId, countDown = 10) {
        let livenessResult;
        do {
            livenessResult = await gipsApi.getLivenessChallengeResult({identityId, portraitId});
            await wait(1000);
            countDown = countDown - 1;
        } while(livenessResult.livenessStatus === 'PROCESSING' && countDown)
        
    
        if(livenessResults[sessionId] && livenessResult) {
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
                if(config.IDPROOFING){
                    res.status(503).json({error: 'Not yet implemented'});
                } else {
                    const faceResult = await wbsApi.createFace(sessionId, image, face);
                    debug(sessionId, 'create face result', faceResult);
                    if (faceResult.quality >= config.CODING_QUALITY_THRESHOLD) res.json({faceId: faceResult.id});
                    else res.status(400).send();
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
            if(config.IDPROOFING){
                const faceImg = await gipsApi.getFaceImage(faceId);
                debug(sessionId, 'get a face img for faceID', faceId);
                res.status(200).send(faceImg);
            } else{
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
            if(config.IDPROOFING){
                res.status(503).json({error: 'Not yet implemented'});
            } else {
                const referenceFaceId = req.params.referenceFaceId;
                const candidateFaceId = req.params.candidateFaceId;
                const sessionId = req.params.bioSessionId;
                const matchResult = await wbsApi.doMatch(sessionId, referenceFaceId);
                debug(sessionId, 'get matches result', matchResult);
                // check matching score ...
                const match = matchResult.find(m => m.candidate.id === candidateFaceId);
                // client should not see all results (like score) ...
                if (match && match.score >= config.MATCHING_SCORE_THRESHOLD) res.json(Object.assign({
                    matching: "ok",
                    score: Math.round(match.score)
                }));
                else res.json(Object.assign({matching: "ko", score: Math.round(match.score)}));
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

    debug('Init HTTP Endpoints done ..')
}
