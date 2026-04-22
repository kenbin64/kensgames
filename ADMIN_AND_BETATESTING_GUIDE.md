# KensGames Admin & Beta Testing System

## Overview

This comprehensive system enables you to:
- **Manage a single superuser** (you) who cannot be banned, suspended, or removed
- **Create and manage admin accounts** who can moderate users (but not other admins)
- **Generate promotional codes** for beta testers with lifetime free play benefits
- **Receive bug reports** from beta testers in a centralized inbox
- **View user reviews** (5-star ratings and feedback) - superuser only
- **Track metrics** through an admin dashboard

---

## Getting Started

### Step 1: Register Your Account

1. Visit your KensGames portal landing page (e.g., https://kensgames.com)
2. Click "Sign Up" or "Register"
3. Fill in your details:
   - **Username**: Choose your admin username (this will be your superuser name)
   - **Email**: Your email address
   - **Password**: Strong password (used to verify admin actions)
   - **Display Name**: Your public name (optional)
4. Click "Register"

**⚠️ Once you register, come back to me with your username and password, and I will:**
1. Elevate your account to superuser status
2. Grant you full admin privileges
3. Verify everything works by testing the endpoints

### Step 2: I Will Elevate You to Superuser

Once you provide your credentials, I will:

```bash
# I will make an API call like this:
POST /api/admin/elevate-to-superuser
{
  "username": "your_username",
  "password": "your_password",
  "targetUsername": "your_username"
}
```

This makes you a **superuser** with these immutable rights:
- ✅ Cannot be banned, suspended, or kicked
- ✅ Only superuser who can create/revoke admins
- ✅ Only superuser who can create/revoke other superusers
- ✅ Access to full admin dashboard
- ✅ Can view all bug reports and user reviews
- ✅ Can generate unlimited beta codes

---

## Accessing Your Admin Dashboard

### Link
Navigate to: `/admin/dashboard.html` or click the admin dashboard link from your account

### Login
- You'll be automatically logged in with your token stored in localStorage
- If you get logged out, simply log back in via the landing page

### Dashboard Features

#### 1. **Statistics Cards** (Top of Dashboard)
- **Open Bug Reports**: Count of unresolved bug reports
- **Critical Issues**: Count of "critical" and "show_stopper" priority bugs
- **Average Rating**: Calculated from all user reviews
- **Beta Codes Claimed**: How many promotional codes have been used

#### 2. **Bug Reports Section**
- Filter by: Open, Critical, or All
- View bug details:
  - Reporter name
  - Game affected
  - Bug title and description
  - Priority level (minor → show_stopper)
  - Status (open, investigating, in_progress, resolved, wontfix, duplicate)
  - Steps to reproduce

**Actions:**
- Click "Details" to see full bug information
- Update status: Mark as investigating, in progress, resolved, etc.
- Add resolution notes explaining how you fixed it
- Bug reporter will see your resolution note

#### 3. **Beta Codes & Promotions Section**
- **View status**: All codes you've generated
  - Code value (format: BETA-XXXXX-XXXXX)
  - Status: active, claimed, expired
  - Who claimed it (if claimed)
  - Expiration date (if set)

- **Generate new codes**:
  - Click "Generate New Codes" button
  - Enter number of codes (1-100)
  - Optional: Set expiration date (days from now)
  - Codes are generated instantly and displayed
  - Copy codes and email to trusted beta testers

#### 4. **User Reviews & Feedback Section**
- View all 5-star reviews and comments from users
- Only you (superuser) can see these reviews
- Helps understand user satisfaction and pain points
- Reviews include:
  - Reviewer name
  - Star rating (1-5)
  - Optional comment/feedback

#### 5. **Admin Management Section**
- **Create Admin**:
  - Enter username of player to promote
  - Optional: Add reason/notes
  - New admin can moderate users but NOT other admins
  - Cannot revoke admins themselves

- **Revoke Admin**:
  - Enter username of admin to demote
  - Optional: Add reason for removal
  - Revoked admin loses all moderation capabilities

---

## Beta Testing System

### Generating Beta Codes

#### Who Gets Codes?
- People you trust to test thoroughly
- Players willing to report bugs
- Friends or community members helping you improve the game
- Limited number of free players (even after you go paid)

#### How to Generate
1. Go to Admin Dashboard → "Beta Codes & Promotions" section
2. Click "Generate New Codes"
3. Set number: How many codes do you need?
4. Set expiration (optional): How long before codes expire?
5. Click "Generate Codes"
6. Codes appear in a copyable list
7. Email codes to testers in any format you choose

#### Code Format
```
BETA-XXXXX-XXXXX
Example: BETA-q7h9w-k2m3p
```

#### Tester Benefits
- **Free play for life** ✅ Even if KensGames becomes paid
- **Early access** to new features and games
- **Direct influence** on game development via bug reports
- **Beta tester badge** (future feature)

### Beta Tester Workflow

#### For Beta Testers
1. Visit `/betatester.html` on your portal
2. Enter their promotional code to claim beta status
3. They can now:
   - **Report bugs** at any time with priority levels
   - **Submit reviews** (5-star ratings and feedback)
   - Play all games with free lifetime access

#### Bug Reporting
- **Title**: Brief description of the bug
- **Description**: Detailed explanation of what went wrong
- **Game**: Which game had the bug (auto-filled if coming from game page)
- **Priority**: minor → moderate → critical → show_stopper
- **Steps to Reproduce**: How to make the bug happen again

#### Review Submission
- **Star Rating**: 1-5 stars
- **Comment**: Optional feedback (what they liked, what needs improvement)
- **Visibility**: Only you can see these reviews (anonymous from other users)

### Accessing Beta Reports

#### Bug Report Inbox
- Dashboard → "Bug Reports" section
- Filter by: Open | Critical | All
- See:
  - Report ID
  - Game affected
  - Reporter name
  - Severity level
  - Current status
  - Date submitted

#### Update Status
1. Click "Details" on any bug report
2. Change status to:
   - **open**: Newly reported, not yet investigated
   - **investigating**: You're looking into it
   - **in_progress**: You're working on a fix
   - **resolved**: Bug is fixed! (leave resolution note)
   - **wontfix**: Won't be fixed (explain why)
   - **duplicate**: Already reported (reference original)
3. Add resolution note explaining the fix or reason
4. Save — reporter will see your update

#### View All Reviews
- Dashboard → "User Reviews & Feedback" section
- See all 5-star reviews and comments
- Review statistics:
  - Total reviews
  - Average rating
  - Distribution (5-star, 4-star, etc.)

---

## Admin Creation & Management

### Creating an Admin

**When to Create Admins:**
- You need help moderating the player base
- Someone is consistently reporting quality feedback
- You want to delegate user management tasks

**Admin Capabilities:**
- Can suspend/ban regular users
- Can review reports from other admins/users
- Cannot suspend other admins
- Cannot create or revoke admins
- Cannot access beta code generation
- Cannot view private reviews

**To Create an Admin:**
1. Dashboard → "Admin Management" section
2. Click "Create Admin"
3. Enter target username
4. Optional: Add reason/notes
5. Click "Create Admin"
6. User will see they're now an admin on next login

### Revoking Admin Status

**Only you (superuser) can revoke admin status.**

1. Dashboard → "Admin Management" section
2. Click "Revoke Admin"
3. Enter admin username
4. Optional: Add reason for removal
5. Click "Revoke Admin"
6. Admin loses all capabilities immediately

---

## Security & Permissions Matrix

| Capability | Superuser | Admin | Regular User | Beta Tester |
|-----------|:---------:|:----:|:-----------:|:-----------:|
| Generate beta codes | ✅ | ❌ | ❌ | ❌ |
| Create/revoke admins | ✅ | ❌ | ❌ | ❌ |
| View bug reports | ✅ | ✅ | ❌ | ❌ |
| Update bug status | ✅ | ✅ | ❌ | ❌ |
| View user reviews | ✅ | ❌ | ❌ | ❌ |
| Report bugs | ✅ | ✅ | ❌ | ✅ |
| Submit reviews | ✅ | ✅ | ❌ | ✅ |
| Claim beta code | ✅ | ✅ | ✅ | ✅ |
| Can be banned | ❌ | ❌ (by superuser) | ✅ | ❌ (lifetime free play) |
| Can transfer superuser | ✅ | ❌ | ❌ | ❌ |

---

## API Reference

### Admin Endpoints

#### Elevate to Superuser
```
POST /api/admin/elevate-to-superuser
Headers: None (special: uses username/password)
Body: {
  "username": "your_username",
  "password": "your_password",
  "targetUsername": "username_to_elevate"
}
Response: { success: true, user: {...} }
```

#### Create Admin
```
POST /api/admin/create-admin
Headers: Authorization: Bearer {token}
Body: {
  "targetUsername": "username",
  "reason": "optional reason"
}
Response: { success: true, message: "..." }
```

#### Revoke Admin
```
POST /api/admin/revoke-admin
Headers: Authorization: Bearer {token}
Body: {
  "targetUsername": "username",
  "reason": "optional reason"
}
Response: { success: true, message: "..." }
```

#### Generate Beta Codes
```
POST /api/admin/generate-beta-codes
Headers: Authorization: Bearer {token}
Body: {
  "count": 10,
  "expiresInDays": 30
}
Response: { success: true, codes: ["BETA-xxx-xxx", ...] }
```

#### Get Beta Codes Status
```
GET /api/admin/beta-codes-status
Headers: Authorization: Bearer {token}
Response: {
  success: true,
  total: 50,
  claimed: 35,
  active: 15,
  codes: [...]
}
```

#### Get Bug Reports
```
GET /api/admin/bug-reports?filter=open|critical|all
Headers: Authorization: Bearer {token}
Response: {
  success: true,
  total: 5,
  open_count: 2,
  critical_count: 1,
  reports: [...]
}
```

#### Update Bug Report Status
```
POST /api/admin/bug-reports/{reportId}/update-status
Headers: Authorization: Bearer {token}
Body: {
  "status": "resolved",
  "resolutionNote": "Fixed in v1.2.1"
}
Response: { success: true, report: {...} }
```

#### Get Admin Dashboard
```
GET /api/admin/dashboard
Headers: Authorization: Bearer {token}
Response: {
  success: true,
  dashboard: {
    open_bugs: 2,
    critical_bugs: 1,
    total_bug_reports: 5,
    total_reviews: 23,
    average_rating: 4.2,
    beta_codes_generated: 50,
    beta_codes_claimed: 35
  }
}
```

### Beta Tester Endpoints

#### Claim Beta Code
```
POST /api/betatester/claim-code
Headers: Authorization: Bearer {token}
Body: { "code": "BETA-xxxxx-xxxxx" }
Response: { success: true, status: "beta_tester" }
```

#### Report Bug
```
POST /api/betatester/report-bug
Headers: Authorization: Bearer {token}
Body: {
  "gameId": "brick_breaker_3d",
  "title": "Game crashes on level 10",
  "description": "When I reach level 10...",
  "priority": "critical",
  "stepsToRepro": "1. Play to level 10..."
}
Response: { success: true, report_id: 123 }
```

#### Submit Review
```
POST /api/betatester/submit-review
Headers: Authorization: Bearer {token}
Body: {
  "rating": 5,
  "comment": "Love the new features!"
}
Response: { success: true, review_id: 456 }
```

#### Get User Reviews
```
GET /api/admin/reviews
Headers: Authorization: Bearer {token}
Response: {
  success: true,
  stats: { total: 23, average_rating: 4.2, ... },
  reviews: [...]
}
```

---

## Troubleshooting

### Dashboard Won't Load
- **Check**: Are you logged in? (Look for `kg_token` in localStorage)
- **Check**: Is your account superuser? (Try visiting `/admin/dashboard.html` - you'll get 403 if not)
- **Action**: Clear localStorage and log back in

### Can't Generate Beta Codes
- **Check**: Only superuser can generate codes
- **Check**: Your token hasn't expired (usually 24 hours)
- **Action**: Log out and back in to refresh token

### Bug Reports Not Showing
- **Check**: Are there any open reports? (May be empty)
- **Check**: Try switching tabs (Open → Critical → All)
- **Action**: Submit a test bug report from `/betatester.html` to verify system works

### Beta Tester Can't Claim Code
- **Reason**: Code already claimed by someone else
- **Reason**: Code is expired
- **Reason**: User not logged in
- **Action**: Generate new code and try again

### Can't Promote User to Admin
- **Check**: Target user exists and is logged in at least once
- **Check**: Target user isn't already an admin
- **Action**: Verify username spelling (case-sensitive in auth, case-insensitive in display)

---

## Data Retention

All data is stored in SQLite with these characteristics:

| Data | Retention | Visibility |
|------|-----------|------------|
| Bug Reports | Indefinite | Superuser + Admins |
| User Reviews | Indefinite | Superuser only |
| Beta Codes | Indefinite | Superuser only |
| Admin Actions | Indefinite | Superuser only |
| User Accounts | Indefinite | All users (display names only) |

---

## Best Practices

### For Beta Testing
1. **Start small**: Generate 5-10 codes for trusted testers
2. **Track feedback**: Keep notes on recurring bug reports
3. **Prioritize**: Focus on "show_stopper" and "critical" bugs first
4. **Communicate**: Let testers know when bugs are fixed
5. **Reward**: Consider recognizing top contributors

### For Admin Team
1. **Clear guidelines**: Define what "appropriate" moderator actions are
2. **Document decisions**: Use reason/notes when suspending users
3. **Escalate to superuser**: For major decisions, don't use admin powers alone
4. **Regular reviews**: Check admin action logs periodically
5. **Train new admins**: Document your moderation policies

### For Security
1. **Protect your password**: Your superuser account is the master key
2. **Use strong passwords**: Minimum 12 characters, mixed case/numbers/symbols
3. **Email security**: Use 2FA on the email associated with your account
4. **Backup recovery**: Save recovery codes in case you lose access
5. **Token management**: Don't share tokens or localStorage data

---

## Next Steps

1. **Register** on the landing page with your desired username
2. **Message me** with: username and password
3. **I'll elevate** you to superuser
4. **Visit** `/admin/dashboard.html` to start using the system
5. **Generate beta codes** and distribute to trusted testers
6. **Monitor bug reports** and feedback from testers
7. **Build your community** of beta testers helping improve your games

---

## Support

If you encounter any issues:
1. Check the [Troubleshooting](#troubleshooting) section above
2. Review the [API Reference](#api-reference) for exact endpoint formats
3. Check browser console for error messages (F12 → Console tab)
4. Clear localStorage and try again: `localStorage.clear()` in console

---

**Made with ❤️ for KensGames**
*Your one-superuser admin and beta testing system*
