// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { triggerAnnouncement, listAnnouncements, AnnouncementAudience } from '../services/announcement.service';

const VALID_AUDIENCES = ['ALL', 'STUDENT', 'SPOC'];

// SPOC/COORDINATOR: trigger an announcement to Zapier
export const createAnnouncement = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email;
        if (!userId || !userEmail) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { title, body, audience = 'ALL' } = req.body;
        if (!title || !body) {
            return res.status(400).json({ success: false, message: 'title and body are required' });
        }
        if (!VALID_AUDIENCES.includes(audience)) {
            return res.status(400).json({ success: false, message: `audience must be one of: ${VALID_AUDIENCES.join(', ')}` });
        }

        // Fire-and-forget: respond immediately, service handles webhook async
        const record = await triggerAnnouncement(userId, userEmail, title, body, audience as AnnouncementAudience);

        res.status(202).json({
            success: true,
            message: 'Announcement triggered and queued to Zapier',
            announcement: {
                id: record.id,
                title,
                body,
                audience,
                createdAt: record.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create announcement' });
    }
};

// SPOC/COORDINATOR: view announcement log
export const getAnnouncementLogs = async (req: AuthRequest, res: Response) => {
    try {
        const announcements = await listAnnouncements();
        res.json({ success: true, announcements });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch announcement logs' });
    }
};
