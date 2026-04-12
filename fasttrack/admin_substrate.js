/**
 * ============================================================
 * BUTTERFLYFX DIMENSIONAL PROGRAMMING STANDARD
 * ============================================================
 * 
 * PARADIGM: Objects are dimensions containing points. Each point
 * is an object in a lower dimension containing its own points.
 * All properties, attributes, and behaviors exist as infinite
 * potentials — invoke only when needed. No pre-calculation,
 * no storage. Geometry IS information.
 * 
 * ============================================================
 * FASTTRACK ADMIN & MODERATION SUBSTRATE
 * ButterflyFX Manifold Pattern - Admin Controls, Blocking, Appeals
 * ============================================================
 */

// ============================================================
// ADMIN BLOCK SUBSTRATE
// Handles admin-issued blocks with appeals
// ============================================================

const AdminBlockSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Admin Block Substrate',
    
    // Admin blocks registry
    adminBlocks: new Map(),
    
    // Appeals registry
    appeals: new Map(),
    
    // Block durations (in milliseconds)
    DURATIONS: {
        '24hr': 24 * 60 * 60 * 1000,
        'week': 7 * 24 * 60 * 60 * 1000,
        'month': 30 * 24 * 60 * 60 * 1000,
        'permanent': null
    },
    
    // Appeal status
    APPEAL_STATUS: {
        PENDING: 'pending',
        UNDER_REVIEW: 'under_review',
        APPROVED: 'approved',
        DENIED: 'denied'
    },
    
    // ============================================================
    // ADMIN BLOCKING
    // ============================================================
    
    blockUser: function(adminId, userId, duration, reason) {
        // Verify admin
        const admin = AuthSubstrate.getUserById(adminId);
        if (!admin || !admin.isAdmin) {
            return { success: false, error: 'Admin privileges required' };
        }
        
        const user = AuthSubstrate.getUserById(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        // Cannot block other admins
        if (user.isAdmin) {
            return { success: false, error: 'Cannot block admin users' };
        }
        
        // Validate duration
        if (!this.DURATIONS.hasOwnProperty(duration)) {
            return { success: false, error: 'Invalid duration' };
        }
        
        const blockId = `block_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const expiresAt = this.DURATIONS[duration] ? 
            Date.now() + this.DURATIONS[duration] : null;
        
        const block = {
            id: blockId,
            userId: userId,
            adminId: adminId,
            duration: duration,
            reason: reason,
            createdAt: Date.now(),
            expiresAt: expiresAt,
            isPermanent: duration === 'permanent',
            canAppeal: true,
            appealInviteSent: true
        };
        
        this.adminBlocks.set(blockId, block);
        
        // Update user
        user.isBlocked = true;
        user.currentBlockId = blockId;
        user.isSuspended = true;
        user.suspensionReason = `Admin block: ${reason}`;
        user.suspendedUntil = expiresAt;
        
        // Revoke sessions
        AuthSubstrate.logout(userId);
        
        console.log(`Admin ${admin.username} blocked ${user.username} for ${duration}: ${reason}`);
        
        this.saveToStorage();
        AuthSubstrate.saveToStorage();
        
        return { 
            success: true, 
            block,
            message: `User blocked. Appeal invitation sent.`
        };
    },
    
    unblockUser: function(adminId, userId) {
        const admin = AuthSubstrate.getUserById(adminId);
        if (!admin || !admin.isAdmin) {
            return { success: false, error: 'Admin privileges required' };
        }
        
        const user = AuthSubstrate.getUserById(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        // Find and remove active block
        let blockFound = false;
        this.adminBlocks.forEach((block, id) => {
            if (block.userId === userId && this.isBlockActive(block)) {
                block.removedAt = Date.now();
                block.removedBy = adminId;
                blockFound = true;
            }
        });
        
        if (!blockFound) {
            return { success: false, error: 'No active block found' };
        }
        
        // Update user
        user.isBlocked = false;
        user.currentBlockId = null;
        user.isSuspended = false;
        user.suspensionReason = null;
        user.suspendedUntil = null;
        
        console.log(`Admin ${admin.username} unblocked ${user.username}`);
        
        this.saveToStorage();
        AuthSubstrate.saveToStorage();
        
        return { success: true };
    },
    
    isBlockActive: function(block) {
        if (block.removedAt) return false;
        if (!block.expiresAt) return true; // Permanent
        return Date.now() < block.expiresAt;
    },
    
    getUserBlock: function(userId) {
        for (const [id, block] of this.adminBlocks) {
            if (block.userId === userId && this.isBlockActive(block)) {
                return block;
            }
        }
        return null;
    },
    
    // ============================================================
    // APPEALS SYSTEM
    // ============================================================
    
    submitAppeal: function(userId, blockId, appealText) {
        const user = AuthSubstrate.getUserById(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        const block = this.adminBlocks.get(blockId);
        if (!block) {
            return { success: false, error: 'Block not found' };
        }
        
        if (block.userId !== userId) {
            return { success: false, error: 'Cannot appeal another users block' };
        }
        
        if (!block.canAppeal) {
            return { success: false, error: 'This block cannot be appealed' };
        }
        
        // Check for existing pending appeal
        for (const [id, appeal] of this.appeals) {
            if (appeal.blockId === blockId && 
                (appeal.status === this.APPEAL_STATUS.PENDING || 
                 appeal.status === this.APPEAL_STATUS.UNDER_REVIEW)) {
                return { success: false, error: 'Appeal already pending' };
            }
        }
        
        const appealId = `appeal_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        const appeal = {
            id: appealId,
            blockId: blockId,
            userId: userId,
            appealText: appealText,
            status: this.APPEAL_STATUS.PENDING,
            createdAt: Date.now(),
            updatedAt: null,
            reviewedBy: null,
            adminResponse: null
        };
        
        this.appeals.set(appealId, appeal);
        
        console.log(`Appeal submitted for block ${blockId} by ${user.username}`);
        
        this.saveToStorage();
        
        return { success: true, appeal };
    },
    
    reviewAppeal: function(adminId, appealId, approve, adminResponse) {
        const admin = AuthSubstrate.getUserById(adminId);
        if (!admin || !admin.isAdmin) {
            return { success: false, error: 'Admin privileges required' };
        }
        
        const appeal = this.appeals.get(appealId);
        if (!appeal) {
            return { success: false, error: 'Appeal not found' };
        }
        
        appeal.status = approve ? 
            this.APPEAL_STATUS.APPROVED : 
            this.APPEAL_STATUS.DENIED;
        appeal.reviewedBy = adminId;
        appeal.adminResponse = adminResponse;
        appeal.updatedAt = Date.now();
        
        if (approve) {
            // Unblock user
            this.unblockUser(adminId, appeal.userId);
            
            // Disable further appeals for this block
            const block = this.adminBlocks.get(appeal.blockId);
            if (block) {
                block.canAppeal = false;
            }
        }
        
        const user = AuthSubstrate.getUserById(appeal.userId);
        console.log(`Appeal ${appealId} ${approve ? 'approved' : 'denied'} by ${admin.username} for ${user?.username}`);
        
        this.saveToStorage();
        
        return { success: true, appeal };
    },
    
    getAppealsByUser: function(userId) {
        const results = [];
        this.appeals.forEach(appeal => {
            if (appeal.userId === userId) {
                results.push(appeal);
            }
        });
        return results.sort((a, b) => b.createdAt - a.createdAt);
    },
    
    getPendingAppeals: function() {
        const results = [];
        this.appeals.forEach(appeal => {
            if (appeal.status === this.APPEAL_STATUS.PENDING || 
                appeal.status === this.APPEAL_STATUS.UNDER_REVIEW) {
                results.push(appeal);
            }
        });
        return results.sort((a, b) => a.createdAt - b.createdAt);
    },
    
    // ============================================================
    // PERSISTENCE
    // ============================================================
    
    saveToStorage: function() {
        try {
            localStorage.setItem('fasttrack_admin_blocks', JSON.stringify([...this.adminBlocks]));
            localStorage.setItem('fasttrack_appeals', JSON.stringify([...this.appeals]));
        } catch (e) {
            console.warn('Could not save admin blocks:', e);
        }
    },
    
    loadFromStorage: function() {
        try {
            const blocks = localStorage.getItem('fasttrack_admin_blocks');
            if (blocks) {
                this.adminBlocks = new Map(JSON.parse(blocks));
            }
            
            const appeals = localStorage.getItem('fasttrack_appeals');
            if (appeals) {
                this.appeals = new Map(JSON.parse(appeals));
            }
        } catch (e) {
            console.warn('Could not load admin blocks:', e);
        }
    }
};

// ============================================================
// MEMBER BLOCK SUBSTRATE
// Handles player-to-player blocks (permanent, silent)
// ============================================================

const MemberBlockSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Member Block Substrate',
    
    // Member blocks registry
    memberBlocks: new Map(),
    
    // 24 hour cooldown after unblock before can reblock
    REBLOCK_COOLDOWN: 24 * 60 * 60 * 1000,
    
    // ============================================================
    // BLOCKING
    // ============================================================
    
    blockUser: function(blockerId, blockedId) {
        if (blockerId === blockedId) {
            return { success: false, error: 'Cannot block yourself' };
        }
        
        const blocker = AuthSubstrate.getUserById(blockerId);
        if (!blocker) {
            return { success: false, error: 'User not found' };
        }
        
        const blocked = AuthSubstrate.getUserById(blockedId);
        if (!blocked) {
            return { success: false, error: 'User to block not found' };
        }
        
        // Check reblock cooldown
        const recentUnblock = this.getRecentUnblock(blockerId, blockedId);
        if (recentUnblock) {
            const timeLeft = (recentUnblock.unblockedAt + this.REBLOCK_COOLDOWN) - Date.now();
            if (timeLeft > 0) {
                const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
                return { 
                    success: false, 
                    error: `Must wait ${hoursLeft} hours before reblocking this user`
                };
            }
        }
        
        // Check if already blocked
        const existingBlock = this.getBlock(blockerId, blockedId);
        if (existingBlock && !existingBlock.unblockedAt) {
            return { success: false, error: 'User already blocked' };
        }
        
        const blockId = `mblock_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        const block = {
            id: blockId,
            blockerId: blockerId,
            blockedId: blockedId,
            createdAt: Date.now(),
            isPermanent: true,
            isSilent: true,  // No notification to blocked user
            unblockedAt: null
        };
        
        this.memberBlocks.set(blockId, block);
        
        // Update blocker's blocked list
        if (!blocker.blockedUsers) {
            blocker.blockedUsers = [];
        }
        if (!blocker.blockedUsers.includes(blockedId)) {
            blocker.blockedUsers.push(blockedId);
        }
        
        console.log(`User ${blocker.username} blocked ${blocked.username} (silent, permanent)`);
        
        this.saveToStorage();
        AuthSubstrate.saveToStorage();
        
        return { success: true };
    },
    
    unblockUser: function(blockerId, blockedId) {
        const blocker = AuthSubstrate.getUserById(blockerId);
        if (!blocker) {
            return { success: false, error: 'User not found' };
        }
        
        const block = this.getBlock(blockerId, blockedId);
        if (!block || block.unblockedAt) {
            return { success: false, error: 'No active block found' };
        }
        
        // Mark as unblocked (but keep record for cooldown)
        block.unblockedAt = Date.now();
        
        // Remove from blocker's list
        if (blocker.blockedUsers) {
            const index = blocker.blockedUsers.indexOf(blockedId);
            if (index > -1) {
                blocker.blockedUsers.splice(index, 1);
            }
        }
        
        console.log(`User ${blocker.username} unblocked user (24hr reblock cooldown started)`);
        
        this.saveToStorage();
        AuthSubstrate.saveToStorage();
        
        return { 
            success: true, 
            cooldownEnds: Date.now() + this.REBLOCK_COOLDOWN
        };
    },
    
    getBlock: function(blockerId, blockedId) {
        for (const [id, block] of this.memberBlocks) {
            if (block.blockerId === blockerId && block.blockedId === blockedId) {
                // Return most recent
                return block;
            }
        }
        return null;
    },
    
    getRecentUnblock: function(blockerId, blockedId) {
        let mostRecent = null;
        
        this.memberBlocks.forEach(block => {
            if (block.blockerId === blockerId && 
                block.blockedId === blockedId && 
                block.unblockedAt) {
                if (!mostRecent || block.unblockedAt > mostRecent.unblockedAt) {
                    mostRecent = block;
                }
            }
        });
        
        return mostRecent;
    },
    
    isBlocked: function(blockerId, blockedId) {
        const block = this.getBlock(blockerId, blockedId);
        return block && !block.unblockedAt;
    },
    
    getBlockedUsers: function(userId) {
        const blocked = [];
        this.memberBlocks.forEach(block => {
            if (block.blockerId === userId && !block.unblockedAt) {
                blocked.push(block.blockedId);
            }
        });
        return blocked;
    },
    
    // ============================================================
    // PERSISTENCE
    // ============================================================
    
    saveToStorage: function() {
        try {
            localStorage.setItem('fasttrack_member_blocks', JSON.stringify([...this.memberBlocks]));
        } catch (e) {
            console.warn('Could not save member blocks:', e);
        }
    },
    
    loadFromStorage: function() {
        try {
            const data = localStorage.getItem('fasttrack_member_blocks');
            if (data) {
                this.memberBlocks = new Map(JSON.parse(data));
            }
        } catch (e) {
            console.warn('Could not load member blocks:', e);
        }
    }
};

// ============================================================
// FEEDBACK & REPORTS SUBSTRATE
// ============================================================

const FeedbackSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Feedback Substrate',
    
    // Reports registry
    reports: new Map(),
    
    // Report types
    TYPES: {
        PLAYER_COMPLAINT: 'player_complaint',
        BUG_REPORT: 'bug_report',
        FEATURE_REQUEST: 'feature_request',
        GENERAL_FEEDBACK: 'general'
    },
    
    // Report status
    STATUS: {
        OPEN: 'open',
        UNDER_REVIEW: 'under_review',
        RESOLVED: 'resolved',
        CLOSED: 'closed'
    },
    
    // Priority
    PRIORITY: {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        CRITICAL: 'critical'
    },
    
    // ============================================================
    // REPORTS
    // ============================================================
    
    submit: function(userId, type, data) {
        const user = AuthSubstrate.getUserById(userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }
        
        if (!this.TYPES.hasOwnProperty(type.toUpperCase().replace(/ /g, '_'))) {
            return { success: false, error: 'Invalid report type' };
        }
        
        const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        const report = {
            id: reportId,
            type: type,
            reporterId: userId,
            reporterUsername: user.username,
            
            // Content
            subject: data.subject || '',
            description: data.description || '',
            targetUserId: data.targetUserId || null,
            gameSessionId: data.gameSessionId || null,
            
            // Status
            status: this.STATUS.OPEN,
            priority: this.PRIORITY.MEDIUM,
            
            // Timestamps
            createdAt: Date.now(),
            updatedAt: null,
            resolvedAt: null,
            
            // Admin handling
            assignedTo: null,
            adminNotes: [],
            resolution: null
        };
        
        // Auto-set priority for player complaints
        if (type === this.TYPES.PLAYER_COMPLAINT) {
            report.priority = this.PRIORITY.HIGH;
        }
        
        this.reports.set(reportId, report);
        
        console.log(`Report submitted: ${type} by ${user.username}`);
        
        this.saveToStorage();
        
        return { success: true, report };
    },
    
    reportPlayer: function(reporterId, targetId, reason, evidence = null) {
        const reporter = AuthSubstrate.getUserById(reporterId);
        if (!reporter) {
            return { success: false, error: 'Reporter not found' };
        }
        
        const target = AuthSubstrate.getUserById(targetId);
        if (!target) {
            return { success: false, error: 'Target user not found' };
        }
        
        if (reporterId === targetId) {
            return { success: false, error: 'Cannot report yourself' };
        }
        
        return this.submit(reporterId, this.TYPES.PLAYER_COMPLAINT, {
            subject: `Player complaint: ${target.username}`,
            description: reason,
            targetUserId: targetId,
            evidence: evidence
        });
    },
    
    reportBug: function(userId, title, description, steps = null) {
        return this.submit(userId, this.TYPES.BUG_REPORT, {
            subject: title,
            description: description,
            stepsToReproduce: steps,
            browserInfo: typeof navigator !== 'undefined' ? navigator.userAgent : null
        });
    },
    
    // ============================================================
    // ADMIN HANDLING
    // ============================================================
    
    assignReport: function(adminId, reportId) {
        const admin = AuthSubstrate.getUserById(adminId);
        if (!admin || !admin.isAdmin) {
            return { success: false, error: 'Admin privileges required' };
        }
        
        const report = this.reports.get(reportId);
        if (!report) {
            return { success: false, error: 'Report not found' };
        }
        
        report.assignedTo = adminId;
        report.status = this.STATUS.UNDER_REVIEW;
        report.updatedAt = Date.now();
        
        this.saveToStorage();
        
        return { success: true };
    },
    
    addNote: function(adminId, reportId, note) {
        const admin = AuthSubstrate.getUserById(adminId);
        if (!admin || !admin.isAdmin) {
            return { success: false, error: 'Admin privileges required' };
        }
        
        const report = this.reports.get(reportId);
        if (!report) {
            return { success: false, error: 'Report not found' };
        }
        
        report.adminNotes.push({
            adminId: adminId,
            adminUsername: admin.username,
            note: note,
            createdAt: Date.now()
        });
        report.updatedAt = Date.now();
        
        this.saveToStorage();
        
        return { success: true };
    },
    
    resolveReport: function(adminId, reportId, resolution, actionTaken = null) {
        const admin = AuthSubstrate.getUserById(adminId);
        if (!admin || !admin.isAdmin) {
            return { success: false, error: 'Admin privileges required' };
        }
        
        const report = this.reports.get(reportId);
        if (!report) {
            return { success: false, error: 'Report not found' };
        }
        
        report.status = this.STATUS.RESOLVED;
        report.resolution = resolution;
        report.actionTaken = actionTaken;
        report.resolvedAt = Date.now();
        report.resolvedBy = adminId;
        report.updatedAt = Date.now();
        
        console.log(`Report ${reportId} resolved by ${admin.username}`);
        
        this.saveToStorage();
        
        return { success: true };
    },
    
    setPriority: function(adminId, reportId, priority) {
        const admin = AuthSubstrate.getUserById(adminId);
        if (!admin || !admin.isAdmin) {
            return { success: false, error: 'Admin privileges required' };
        }
        
        const report = this.reports.get(reportId);
        if (!report) {
            return { success: false, error: 'Report not found' };
        }
        
        report.priority = priority;
        report.updatedAt = Date.now();
        
        this.saveToStorage();
        
        return { success: true };
    },
    
    // ============================================================
    // QUERIES
    // ============================================================
    
    getOpenReports: function(type = null) {
        const results = [];
        this.reports.forEach(report => {
            if (report.status === this.STATUS.OPEN || 
                report.status === this.STATUS.UNDER_REVIEW) {
                if (!type || report.type === type) {
                    results.push(report);
                }
            }
        });
        
        // Sort by priority then date
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return results.sort((a, b) => {
            const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (pDiff !== 0) return pDiff;
            return a.createdAt - b.createdAt;
        });
    },
    
    getReportsByUser: function(userId) {
        const results = [];
        this.reports.forEach(report => {
            if (report.reporterId === userId) {
                results.push(report);
            }
        });
        return results.sort((a, b) => b.createdAt - a.createdAt);
    },
    
    getReportsAgainstUser: function(userId) {
        const results = [];
        this.reports.forEach(report => {
            if (report.targetUserId === userId) {
                results.push(report);
            }
        });
        return results.sort((a, b) => b.createdAt - a.createdAt);
    },
    
    // ============================================================
    // PERSISTENCE
    // ============================================================
    
    saveToStorage: function() {
        try {
            localStorage.setItem('fasttrack_reports', JSON.stringify([...this.reports]));
        } catch (e) {
            console.warn('Could not save reports:', e);
        }
    },
    
    loadFromStorage: function() {
        try {
            const data = localStorage.getItem('fasttrack_reports');
            if (data) {
                this.reports = new Map(JSON.parse(data));
            }
        } catch (e) {
            console.warn('Could not load reports:', e);
        }
    }
};

// ============================================================
// GUILD ADMIN SUBSTRATE
// ============================================================

const GuildAdminSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Guild Admin Substrate',
    
    // ============================================================
    // ADMIN GUILD MANAGEMENT
    // ============================================================
    
    deleteGuild: function(adminId, guildId, reason) {
        const admin = AuthSubstrate.getUserById(adminId);
        if (!admin || !admin.isAdmin) {
            return { success: false, error: 'Admin privileges required' };
        }
        
        // Get guild from GuildSubstrate
        if (typeof GuildSubstrate === 'undefined') {
            return { success: false, error: 'Guild system not available' };
        }
        
        const guild = GuildSubstrate.guilds.get(guildId);
        if (!guild) {
            return { success: false, error: 'Guild not found' };
        }
        
        // Remove all members from guild
        guild.members.forEach(memberId => {
            const user = AuthSubstrate.getUserById(memberId);
            if (user) {
                user.guildId = null;
            }
        });
        
        // Archive guild (don't fully delete for records)
        guild.deletedAt = Date.now();
        guild.deletedBy = adminId;
        guild.deletionReason = reason;
        guild.isDeleted = true;
        
        console.log(`Admin ${admin.username} deleted guild '${guild.name}': ${reason}`);
        
        GuildSubstrate.saveToStorage();
        AuthSubstrate.saveToStorage();
        
        return { success: true };
    },
    
    warnGuild: function(adminId, guildId, warning) {
        const admin = AuthSubstrate.getUserById(adminId);
        if (!admin || !admin.isAdmin) {
            return { success: false, error: 'Admin privileges required' };
        }
        
        const guild = GuildSubstrate?.guilds?.get(guildId);
        if (!guild) {
            return { success: false, error: 'Guild not found' };
        }
        
        if (!guild.warnings) {
            guild.warnings = [];
        }
        
        guild.warnings.push({
            adminId: adminId,
            warning: warning,
            createdAt: Date.now()
        });
        
        console.log(`Admin ${admin.username} warned guild '${guild.name}': ${warning}`);
        
        GuildSubstrate.saveToStorage();
        
        return { success: true };
    },
    
    getGuildStats: function(guildId) {
        const guild = GuildSubstrate?.guilds?.get(guildId);
        if (!guild) return null;
        
        // Count complaints against guild members
        let complaints = 0;
        FeedbackSubstrate.reports.forEach(report => {
            if (report.type === FeedbackSubstrate.TYPES.PLAYER_COMPLAINT && 
                report.targetUserId) {
                const target = AuthSubstrate.getUserById(report.targetUserId);
                if (target && target.guildId === guildId) {
                    complaints++;
                }
            }
        });
        
        return {
            id: guildId,
            name: guild.name,
            memberCount: guild.members.length,
            warningCount: guild.warnings?.length || 0,
            complaintCount: complaints,
            createdAt: guild.createdAt
        };
    }
};

// ============================================================
// ADMIN DASHBOARD SUBSTRATE
// ============================================================

const AdminDashboardSubstrate = {
    version: '1.0.0',
    name: 'FastTrack Admin Dashboard Substrate',
    
    getStats: function() {
        const now = Date.now();
        const dayAgo = now - (24 * 60 * 60 * 1000);
        const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
        
        // Count users
        let totalUsers = 0;
        let newUsersDay = 0;
        let newUsersWeek = 0;
        let blockedUsers = 0;
        
        AuthSubstrate.users.forEach(user => {
            totalUsers++;
            if (user.createdAt > dayAgo) newUsersDay++;
            if (user.createdAt > weekAgo) newUsersWeek++;
            if (user.isBlocked || user.isSuspended) blockedUsers++;
        });
        
        // Online users
        let onlineUsers = 0;
        if (typeof OnlineStatusSubstrate !== 'undefined') {
            OnlineStatusSubstrate.onlineUsers.forEach(u => {
                if (OnlineStatusSubstrate.isUserOnline(u.userId)) {
                    onlineUsers++;
                }
            });
        }
        
        // Count reports
        let openReports = FeedbackSubstrate.getOpenReports().length;
        let openComplaints = FeedbackSubstrate.getOpenReports(
            FeedbackSubstrate.TYPES.PLAYER_COMPLAINT
        ).length;
        let openBugs = FeedbackSubstrate.getOpenReports(
            FeedbackSubstrate.TYPES.BUG_REPORT
        ).length;
        
        // Count appeals
        let pendingAppeals = AdminBlockSubstrate.getPendingAppeals().length;
        
        // Count guilds
        let totalGuilds = 0;
        if (typeof GuildSubstrate !== 'undefined') {
            GuildSubstrate.guilds.forEach(g => {
                if (!g.isDeleted) totalGuilds++;
            });
        }
        
        // Active games
        let activeGames = 0;
        if (typeof GameSessionManager !== 'undefined') {
            GameSessionManager.sessions.forEach(s => {
                if (s.status === GameSessionManager.STATUS.IN_PROGRESS) {
                    activeGames++;
                }
            });
        }
        
        return {
            users: {
                total: totalUsers,
                newDay: newUsersDay,
                newWeek: newUsersWeek,
                blocked: blockedUsers,
                online: onlineUsers
            },
            reports: {
                open: openReports,
                complaints: openComplaints,
                bugs: openBugs
            },
            appeals: {
                pending: pendingAppeals
            },
            guilds: {
                total: totalGuilds
            },
            games: {
                active: activeGames
            }
        };
    },
    
    getRecentActivity: function(limit = 50) {
        const activity = [];
        
        // Recent reports
        FeedbackSubstrate.reports.forEach(report => {
            activity.push({
                type: 'report',
                subtype: report.type,
                userId: report.reporterId,
                username: report.reporterUsername,
                timestamp: report.createdAt,
                details: report.subject
            });
        });
        
        // Recent blocks
        AdminBlockSubstrate.adminBlocks.forEach(block => {
            activity.push({
                type: 'admin_block',
                userId: block.userId,
                adminId: block.adminId,
                timestamp: block.createdAt,
                details: block.reason
            });
        });
        
        // Recent appeals
        AdminBlockSubstrate.appeals.forEach(appeal => {
            activity.push({
                type: 'appeal',
                userId: appeal.userId,
                timestamp: appeal.createdAt,
                status: appeal.status,
                details: appeal.appealText.substring(0, 100)
            });
        });
        
        // Sort by timestamp descending and limit
        return activity
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
};

// ============================================================
// INITIALIZATION
// ============================================================

if (typeof window !== 'undefined') {
    // Load persisted data
    AdminBlockSubstrate.loadFromStorage();
    MemberBlockSubstrate.loadFromStorage();
    FeedbackSubstrate.loadFromStorage();
    
    window.AdminBlockSubstrate = AdminBlockSubstrate;
    window.MemberBlockSubstrate = MemberBlockSubstrate;
    window.FeedbackSubstrate = FeedbackSubstrate;
    window.GuildAdminSubstrate = GuildAdminSubstrate;
    window.AdminDashboardSubstrate = AdminDashboardSubstrate;
    
    console.log('Admin & Moderation Substrate loaded');
}
