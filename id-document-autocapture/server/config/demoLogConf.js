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

const config = require('../config');
const { AsyncLocalStorage } = require('node:async_hooks');
const util = require('util');
const winston = require('winston');
const { format } = winston;
// Color management (raw only)
const colorize = format.colorize().colorize;

// Update native colors, possible values:
// black,red,green,yellow,blue,magenta,cyan,white,gray,grey,brightRed,brightGreen,brightYellow,brightBlue,brightMagenta,brightCyan,brightWhite
winston.addColors({
    error: 'bold brightRed',
    warn: 'bold brightYellow',
    info: 'bold brightBlue',
    debug: 'bold brightGreen'
});

// Init file name filter
const LOG_FILE_NAME_REGEX = (() => {
    const fileName = process.env.LOG_FILE_NAME_REGEX;
    if (typeof fileName === 'string') {
        return new RegExp(fileName.replaceAll('.', '\\.').replaceAll('*', '.*'));
    }
    return undefined;
})();

/** @type {InspectOptions} */
const FORMAT_OPTIONS = {
    depth: null, // it will print all the object tree in logs
    maxArrayLength: 300 // default limit is 100, increased a bit to log properly all objects
};

const asyncLocalStorage = new AsyncLocalStorage();

// The logger instance that will be exported
const logger = createLogger(); // create only one instance shared between all files

/**
 * Create an instance of logger object
 * @returns {winston.Logger}
 */
function createLogger() {
    const rawLogFormat = config.LOG_FORMAT === 'raw';
    const logger = winston.createLogger({
        level: getLogLevel(config.LOG_LEVEL),
        format: format.combine(
            format(info => {
                return !LOG_FILE_NAME_REGEX || LOG_FILE_NAME_REGEX.test(getFileName()) ? info : null;
            })(),
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            format.printf(info => {
                const fileName = getFileName();
                // Extract contextual tenantId / sessionId
                const store = asyncLocalStorage.getStore();
                const tenantId = store?.tenantId || '';
                const sessionId = store?.sessionId || '';
                // Now add header to original message
                const message = rawLogFormat
                    ? `${info.timestamp}|${info.thread}|${tenantId}|${sessionId}|${colorize(info.level, info.level.toUpperCase())}|${fileName}|${info.message}`
                    : {
                        timestamp: info.timestamp,
                        thread: info.thread.toString(),
                        tenantId,
                        sessionId,
                        level: info.level.toUpperCase(),
                        class: fileName,
                        message: info.message
                    };

                return rawLogFormat ? message : JSON.stringify(message);
            })
        ),
        defaultMeta: { thread: process.pid.toString().padStart(14, '0') } // to fit native format
    });
    if (config.LOG_APPENDER !== 'console') {
        logger.add(new winston.transports.File({
            filename: `${config.LOG_FILE_PATH}/docserver-demo-error.log`,
            level: 'error'
        }));
        logger.add(new winston.transports.File({ filename: config.LOG_FILE_PATH + '/docserver-demo-technical.log' }));
    } else {
        logger.add(new winston.transports.Console());
    }

    /**
     * Update the current context of this logger
     * @param {object?} context contains the tenantId and sessionId to store
     */
    logger.updateContext = function (context) {
        const store = asyncLocalStorage.getStore();
        if (!store) {
            asyncLocalStorage.enterWith({});
            return this.updateContext(context);
        }
        if (context) {
            // Check possible sessionId / tenantId values (null / undefined ignored, other values allowed, included empty string)
            if (context.sessionId != null || context.id != null) {
                store.sessionId = context.sessionId || context.id || '';
            }
            if (context.tenantId != null || context.clientId != null) {
                store.tenantId = context.tenantId || context.clientId || '';
            }
        }
    };

    // Override log methods ('debug', 'info'...) to use util.format to have similar behaviour as console.log or debug lib
    Object.keys(logger.levels).forEach(level => {
        const logMethod = logger[level];
        logger[level] = function (...args) {
            logMethod(util.formatWithOptions(FORMAT_OPTIONS, ...args));
        };
    });

    // Override 'log' as well
    const _log = logger.log;
    logger.log = function (level, ...args) {
        // Need to attach the logger to 'this' otherwise an error is thrown
        _log.call(logger, level, util.formatWithOptions(FORMAT_OPTIONS, ...args));
    };
    return logger;
}

/**
 * this function extracts the name of the function & file that trigger the log
 * class & func names are provided in stackTrace
 * @returns {string}
 */
function getFileName() {
    Error.stackTraceLimit = 16; // Ensure we have enough lines to get the name of the file & method (default = 10)
    const callersStack = (new Error()).stack.split('\n');
    const lastLineBeforeCallerName = 'logger.<computed>';
    /** Example of stack with different samples of files & functions names
     at ...
     at DerivedLogger.logger.<computed> [as info] (/home/r….../winston/create-logger.js:81:14), // << we must find this line index in stack
     at functionName (/home/..../FileName.js:131:36) // << sample 1
     at new FunctionName (/home/..../FileName.js:131:36) // << sample 2
     at ObjectName.functionName (/home/..../FileName.js:131:36) // << sample 3
     at ObjectName.<anonymous> (/home/..../FileName.js:131:36) // << sample 4
     at /home/..../FileName.js:131:36 // << sample 5
     */
    let i = callersStack.findIndex(v => v.indexOf(lastLineBeforeCallerName) > -1);
    if (i < 0) {
        // Special case for logger.log
        i = callersStack.findIndex(v => v.indexOf('logger.log (') > -1);
    }
    if (i > -1 && callersStack[i + 1]) {
        const callerInfo = callersStack[i + 1].split(' '); // .map(v => v?.trim());
        const filePath = callerInfo[callerInfo.length - 1].split('/');
        const [fileName, lineNbr] = filePath[filePath.length - 1].split(':');
        const functionName = callerInfo[callerInfo.indexOf('at') + 1];
        if (functionName.startsWith('/')) { // << no functionName provided (case of sample 5)
            return fileName + ':' + lineNbr;
        }
        // functionName provided => get rid of ObjectName from sample 3 or 4
        return fileName + ':' + functionName.split('.').slice(-1) + ':' + lineNbr;
    }
    return '' + __filename.split('/').slice(-1); // << for some reason we can't get caller name so print this logger class name
}

function getLogLevel(logLevel) {
    logLevel = logLevel?.trim().toLowerCase() || '';
    switch (logLevel) {
        case 'debug':
        case 'info':
        case 'warn':
        case 'error':
            return logLevel;
        case 'warning':
            return 'warn';
        default:
            return 'info';
    }
}

module.exports.getLogger = () => {
    return logger;
};

// For unit tests
module.exports.createLogger = createLogger;
