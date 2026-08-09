// Structured logging with Winston
import winston from 'winston';
import { config } from '@config/env';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Custom format for development readability
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
});

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.env === 'development'
      ? combine(colorize(), timestamp({ format: 'HH:mm:ss' }), devFormat)
      : combine(timestamp(), json()),
  }),
];

// Add file transport in production
if (config.env === 'production') {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

export const logger = winston.createLogger({
  level: config.logLevel,
  format: combine(errors({ stack: true }), timestamp(), json()),
  defaultMeta: { service: 'retailpos-backend' },
  transports,
});

// Stream for Morgan HTTP logging
export const logStream = {
  write: (message: string) => logger.info(message.trim()),
};
