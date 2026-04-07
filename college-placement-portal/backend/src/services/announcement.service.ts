// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const ZAPIER_ENABLED = process.env.ZAPIER_ENABLED === 'true';
const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL || '';

export type AnnouncementAudience = 'ALL' | 'STUDENT' | 'SPOC';

export interface AnnouncementPayload {
    event: 'announcement';
    title: string;
    body: string;
    audience: AnnouncementAudience;
    triggeredBy: string;   // email of the coordinator who sent it
    triggeredAt: string;   // ISO timestamp
    portalUrl: string;     // deep-link (configurable via PORT_UI_URL env)
}

/**
 * Builds the standardised Zapier webhook payload, persists an Announcement log,
 * then fires the webhook (or mock-sends if ZAPIER_ENABLED=false).
 */
export const triggerAnnouncement = async (
    createdById: string,
    createdByEmail: string,
    title: string,
    body: string,
    audience: AnnouncementAudience = 'ALL'
) => {
    const payload: AnnouncementPayload = {
        event: 'announcement',
        title,
        body,
        audience,
        triggeredBy: createdByEmail,
        triggeredAt: new Date().toISOString(),
        portalUrl: process.env.PORT_UI_URL || 'http://localhost:5173'
    };

    // Persist log first (always)
    const record = await prisma.announcement.create({
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
            const res = await axios.post(ZAPIER_WEBHOOK_URL, payload, {
                timeout: 8000,
                headers: { 'Content-Type': 'application/json' }
            });
            await prisma.announcement.update({
                where: { id: record.id },
                data: {
                    zapierStatus: 'SENT',
                    zapierResponse: JSON.stringify(res.data).slice(0, 500),
                    sentAt: new Date()
                }
            });
        } else {
            // Mock mode — mark SENT without real HTTP call
            await prisma.announcement.update({
                where: { id: record.id },
                data: { zapierStatus: 'SENT', sentAt: new Date(), zapierResponse: 'MOCK_ZAPIER_SEND' }
            });
        }
    } catch (err: any) {
        await prisma.announcement.update({
            where: { id: record.id },
            data: { zapierStatus: 'FAILED', zapierResponse: err.message?.slice(0, 300) }
        });
    }

    return record;
};

/** Returns all announcement logs, newest first */
export const listAnnouncements = async () => {
    return prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            createdBy: { select: { email: true, role: true } }
        }
    });
};
