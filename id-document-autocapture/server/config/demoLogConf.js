const winston = require('winston');
const { LOG_APPENDER, LOG_FILE_PATH, LOG_LEVEL, LOG_FORMAT } = require('../config');
const { format } = require('winston');
let colorize = (_level, message) => message; // pass-through function
const rawLogFormat = LOG_FORMAT === 'raw';
const LOG_FILE_NAME_REGEX = getLogFileNameRegex(); // in case we want to display only logs for a specific class
function getLogFileNameRegex() {
    const fileName = process.env.LOG_FILE_NAME_REGEX;
    if (typeof fileName === 'string') {
        return new RegExp(fileName.replaceAll('.', '\\.').replaceAll('*', '.*'));
    }
    return undefined;
}
const logger = createLogger(); // create only one instance shared between all files
function createLogger() {
    if (rawLogFormat) {
        colorize = winston.format.colorize().colorize;
        // if colors updated ensure you update native colors also
        // black,red,green,yellow,blue,magenta,cyan,white,gray,grey,brightRed,brightGreen,brightYellow,brightBlue,brightMagenta,brightCyan,brightWhite
        winston.addColors({ error: 'brightRed', warn: 'brightYellow', info: 'brightBlue', debug: 'brightGreen' });
    }
    const logger = winston.createLogger({
        level: LOG_LEVEL,
        format: format.combine(
            format(info => {
                return !LOG_FILE_NAME_REGEX || LOG_FILE_NAME_REGEX.test(getFileName()) ? info : null;
            })(),
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            format.splat(),
            format.printf(info => {
                const fileName = getFileName();
                let additional;
                const extendedInfos = Object.keys(info).filter(key => !['timestamp', 'thread', 'label', 'logContext', 'level', 'message'].includes(key));
                if (extendedInfos?.length > 0) {
                    additional = {};
                    extendedInfos.forEach(key => {
                        additional[key] = info[key];
                    });
                    info.message += ' ' + JSON.stringify(additional, null, 2);
                }

                const message = rawLogFormat
                    ? `${info.timestamp}|${info.thread}|${info.logContext?.clientId || ''}|${info.logContext?.sessionId || ''}|${colorize(info.level, info.level.toUpperCase())}|${fileName}|${info.message}`
                    : {
                        timestamp: info.timestamp,
                        thread: info.thread.toString(),
                        sessionId: info.logContext?.sessionId || '',
                        tenantId: info.logContext?.clientId || '',
                        level: info.level.toUpperCase(),
                        class: fileName,
                        message: info.message
                    };

                return rawLogFormat ? message : JSON.stringify(message);
            })
        ),
        defaultMeta: { thread: process.pid.toString().padStart(14, '0') } // to fit native format
    });
    if (LOG_APPENDER !== 'console') {
        logger.add(new winston.transports.File({
            filename: `${LOG_FILE_PATH}/docserver-demo-error.log`,
            level: 'error'
        }));
        logger.add(new winston.transports.File({ filename: LOG_FILE_PATH + '/docserver-demo-technical.log' }));
    } else {
        logger.add(new winston.transports.Console());
    }
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
    const lastLineBeforeCallerName = 'at DerivedLogger.<computed>';
    /** example of stack with different samples of files & functions names
     at ...
     at DerivedLogger.<computed> [as info] (/home/r….../winston/create-logger.js:81:14), // << we must find this line index in stack
     at functionName (/home/..../FileName.js:131:36) // << sample 1
     at new FunctionName (/home/..../FileName.js:131:36) // << sample 2
     at ObjectName.functionName (/home/..../FileName.js:131:36) // << sample 3
     at ObjectName.<anonymous> (/home/..../FileName.js:131:36) // << sample 4
     at /home/..../FileName.js:131:36 // << sample 5
     */
    const i = callersStack.findIndex(v => v.indexOf(lastLineBeforeCallerName) > -1);
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
    return '' + __filename.split('/').slice(-1); // << for some reasons we can't get caller name so print this logger class name
}

module.exports.getLogger = () => {
    return logger;
};
