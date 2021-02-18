const winston = require('winston');
const WinstonContext = require('winston-context');
const { LOG_APPENDER, LOG_FILE_PATH, LOG_LEVEL } = require('../config');
const { format } = require('winston');

function createLogger(service, sessionId = '') {
    if (!service) {
        throw Error('Illegal argument exception - logger must have service or class name');
    }
    const fileNameTab = service.split('/');
    if (!fileNameTab.length || fileNameTab.length <= 0) {
        throw Error('Illegal argument exception - logger must have service or class name');
    }
    const fileName = fileNameTab.pop();

    const logger = winston.createLogger({
        level: LOG_LEVEL,
        format: format.combine(
        // format.colorize(),
            format.label({ label: fileName }),
            format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }),
            format.splat(),
            //
            // The simple format outputs
            // `${level}: ${message} ${[Object with everything else]}`
            //
            // format.simple()

            format.printf(info => {
                let message = `[${info.timestamp}] [${info.thread}]  [${info.sessionId}] [${info.level.toUpperCase()}] [${info.label}]: ${info.message}`;
                const extendedInfos = Object.keys(info).filter(key => !['timestamp', 'thread', 'label', 'sessionId', 'level', 'message'].includes(key));
                let additional;
                if (extendedInfos && extendedInfos.length > 0) {
                    additional = {};
                    extendedInfos.forEach(extendedInfo => {
                        if (!Object.is(extendedInfo, String)) {
                            additional[extendedInfo] = info[extendedInfo];
                        }
                    });
                }
                if (additional) {
                    message += ' ' + JSON.stringify(additional);
                }
                return message;
            })

        ),
        defaultMeta: { sessionId: sessionId, thread: process.pid }
    });
    if (LOG_APPENDER !== 'console') {
        logger.add(new winston.transports.File({ filename: `${LOG_FILE_PATH}/docserver-demo-error.log`, level: 'error' }));
        logger.add(new winston.transports.File({ filename: LOG_FILE_PATH + '/docserver-demo-technical.log' }));
    } else {
        logger.add(new winston.transports.Console());
    }
    return logger;
}

function createContext(logger, session) {
    // Create a per-request child
    const requestCtx = new WinstonContext(logger, '', {
        sessionId: session
    });

    return requestCtx;
}

module.exports.getLogger = (service) => { return createLogger(service); };
module.exports.getContextLogger = (logger, session) => { return createContext(logger, session); };
