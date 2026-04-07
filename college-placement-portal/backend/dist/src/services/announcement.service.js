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
exports.listAnnouncements = exports.triggerAnnouncement = void 0;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const prisma = new client_1.PrismaClient();
const ZAPIER_ENABLED = process.env.ZAPIER_ENABLED === 'true';
const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL || '';
/**
 * Builds the standardised Zapier webhook payload, persists an Announcement log,
 * then fires the webhook (or mock-sends if ZAPIER_ENABLED=false).
 */
const triggerAnnouncement = (createdById_1, createdByEmail_1, title_1, body_1, ...args_1) => __awaiter(void 0, [createdById_1, createdByEmail_1, title_1, body_1, ...args_1], void 0, function* (createdById, createdByEmail, title, body, audience = 'ALL') {
    var _a;
    const payload = {
        event: 'announcement',
        title,
        body,
        audience,
        triggeredBy: createdByEmail,
        triggeredAt: new Date().toISOString(),
        portalUrl: process.env.PORT_UI_URL || 'http://localhost:5173'
    };
    // Persist log first (always)
    const record = yield prisma.announcement.create({
        data: {
            title,
            body,
            audience,
            createdById,
            payload: JSON.stringify(payload),
            zapierStatus: 'PENDING'
        }
    });
    try {
        if (ZAPIER_ENABLED && ZAPIER_WEBHOOK_URL) {
            const res = yield axios_1.default.post(ZAPIER_WEBHOOK_URL, payload, {
                timeout: 8000,
                headers: { 'Content-Type': 'application/json' }
            });
            yield prisma.announcement.update({
                where: { id: record.id },
                data: {
                    zapierStatus: 'SENT',
                    zapierResponse: JSON.stringify(res.data).slice(0, 500),
                    sentAt: new Date()
                }
            });
        }
        else {
            // Mock mode — mark SENT without real HTTP call
            yield prisma.announcement.update({
                where: { id: record.id },
                data: { zapierStatus: 'SENT', sentAt: new Date(), zapierResponse: 'MOCK_ZAPIER_SEND' }
            });
        }
    }
    catch (err) {
        yield prisma.announcement.update({
            where: { id: record.id },
            data: { zapierStatus: 'FAILED', zapierResponse: (_a = err.message) === null || _a === void 0 ? void 0 : _a.slice(0, 300) }
        });
    }
    return record;
});
exports.triggerAnnouncement = triggerAnnouncement;
/** Returns all announcement logs, newest first */
const listAnnouncements = () => __awaiter(void 0, void 0, void 0, function* () {
    return prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            createdBy: { select: { email: true, role: true } }
        }
    });
});
exports.listAnnouncements = listAnnouncements;
