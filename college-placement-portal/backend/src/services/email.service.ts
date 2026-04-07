import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

export const sendOTP = async (email: string, otp: string) => {
    logger.info(`[MOCK EMAIL SERVICE] Sending OTP ${otp} to ${email}`);

    try {
        const axios = require('axios');
        await axios.post('http://localhost:9001/mock-email', { email, otp });
    } catch (e) {
        logger.error('Failed to send OTP to mock server', e);
    }
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return true;
};
