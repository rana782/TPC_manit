"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOTP = void 0;
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console()
    ]
});
const sendOTP = (email, otp) => __awaiter(void 0, void 0, void 0, function* () {
    logger.info(`[MOCK EMAIL SERVICE] Sending OTP ${otp} to ${email}`);
    try {
        const axios = require('axios');
        yield axios.post('http://localhost:9001/mock-email', { email, otp });
    }
    catch (e) {
        logger.error('Failed to send OTP to mock server', e);
    }
    // Simulate network delay
    yield new Promise(resolve => setTimeout(resolve, 500));
    return true;
});
exports.sendOTP = sendOTP;
