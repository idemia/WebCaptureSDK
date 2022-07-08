const winston = require('winston');
const { LOG_APPENDER, LOG_FILE_PATH, LOG_LEVEL } = require('../config');
const { format } = require('winston');

function createLogger(service, logContext = {}) {
    if (!service) {
        throw Error('Illegal argument exception - logger must have service or class name');
    }
    const fileNameTab = service.split('/');
    if (!fileNameTab.length || !(fileNameTab.length > 0)) {
        throw Error('Illegal argument exception - logger must have service or class name');
    }
    const fileName = fileNameTab.pop();

    const logger = winston.createLogger({
        level: LOG_LEVEL,
        format: format.combine(
            format.label({ label: fileName }),
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            format.splat(),
            format.printf(info => {
                const message = {};
                message.timestamp = info.timestamp;
                message.thread = info.thread.toString();
                message.sessionId = info.logContext?.sessionId || '';
                message.tenantId = info.logContext?.clientId || '';
                message.level = info.level.toUpperCase();
                message.class = info.label;
                message.message = info.message;

                const extendedInfos = Object.keys(info).filter(key => !['timestamp', 'thread', 'label', 'logContext', 'level', 'message'].includes(key));
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
                    message.message += ' ' + JSON.stringify(additional);
                }
                return JSON.stringify(message);
            })
        ),
        defaultMeta: { logContext: logContext, thread: process.pid }
    });
    if (LOG_APPENDER !== 'console') {
        logger.add(new winston.transports.File({ filename: `${LOG_FILE_PATH}/docserver-demo-error.log`, level: 'error' }));
        logger.add(new winston.transports.File({ filename: LOG_FILE_PATH + '/docserver-demo-technical.log' }));
    } else {
        logger.add(new winston.transports.Console());
    }
    return logger;
}

module.exports.getLogger = (service) => { return createLogger(service); };
