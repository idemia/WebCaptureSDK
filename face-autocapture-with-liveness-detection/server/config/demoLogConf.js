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
    depth: 5, // it will print 5 levels of the object tree in logs (default 2)
    maxArrayLength: 300 // default limit is 100, increased a bit to log properly arrays
};

const asyncLocalStorage = new AsyncLocalStorage();

// The logger instance that will be exported
const logger = createLogger(); // create only one instance shared between all files

/**
 * Create an instance of logger object
 * @returns {winston.Logger}
 */
function createLogger() {
    // The message transform function (raw or json)
    const transform = config.LOG_FORMAT === 'raw' ? transformToRaw : transformToJson;
    const logger = winston.createLogger({
        level: getLogLevel(config.LOG_LEVEL),
        format: format.combine(
            format(info => {
                return !LOG_FILE_NAME_REGEX || LOG_FILE_NAME_REGEX.test(getFileName()) ? info : null;
            })(),
            // In raw, use local time to display technical logs, in json use ISO8601 with timezone offset
            format.timestamp({ format: config.LOG_FORMAT === 'raw' ? 'YYYY-MM-DD HH:mm:ss.SSS' : 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
            format.printf(info => {
                info.class = getFileName();
                // Extract contextual tenantId / sessionId
                const store = asyncLocalStorage.getStore();
                info.tenantId = store?.tenantId || '';
                info.sessionId = store?.sessionId || '';
                // Now add header to original message
                return transform(info);
            })
        ),
        defaultMeta: { thread: process.pid.toString().padStart(14, '0') } // to fit native format
    });
    configure(logger);
    return logger;
}

/**
 * Transform the info object into a raw string
 * @param {object} info the input object to transform
 * @param {(level: string, message: string) => string} colorize a function used to colorize text
 * @return {string} a raw string containing transformed info
 */
function transformToRaw(info, addColor = colorize) {
    return `${info.timestamp}|${info.thread}|${info.tenantId}|${info.sessionId}|${addColor(info.level, info.level.toUpperCase())}|${info.class}|${info.message}`;
}

/**
 * Transform the info object into a JSON string
 * @param {object} info the input object to transform
 * @returns {string} a JSON string containing transformed info
 */
function transformToJson(info) {
    return JSON.stringify({
        timestamp: info.timestamp,
        thread: info.thread.toString(),
        tenantId: info.tenantId,
        sessionId: info.sessionId,
        level: info.level.toUpperCase(),
        class: info.class,
        message: info.message
    });
}

/**
 * Configure logger
 * @param {winston.Logger} logger
 */
function configure(logger) {
    if (config.LOG_APPENDER !== 'console') {
        logger.add(new winston.transports.File({
            filename: `${config.LOG_FILE_PATH}/bioserver-demo-error.log`,
            level: 'error'
        }));
        logger.add(new winston.transports.File({ filename: config.LOG_FILE_PATH + '/bioserver-demo-technical.log' }));
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
            if (context.sessionId != null || context.id != null || context.bioSessionId != null) {
                store.sessionId = context.sessionId || context.id || context?.bioSessionId || '';
            }
            if (context.tenantId != null || context.clientId != null || context.tenantInfo?.clientId != null) {
                store.tenantId = context.tenantId || context.clientId || context.tenantInfo?.clientId || '';
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
     at functionName (/home/rch/..../FileName.js:131:36) // << sample 1
     at new FunctionName (/home/rch/..../FileName.js:131:36) // << sample 2
     at ObjectName.functionName (/home/rch/..../FileName.js:131:36) // << sample 3
     at ObjectName.<anonymous> (/home/rch/..../FileName.js:131:36) // << sample 4
     at /home/rch/..../FileName.js:131:36 // << sample 5
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

// For json to raw converter
module.exports.transformToRaw = transformToRaw;

// For unit tests
module.exports.createLogger = createLogger;
