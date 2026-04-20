/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMAIL SERVICE - Password Recovery & Welcome Emails
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sends emails for password recovery, welcome, and other notifications
 * Uses Nodemailer for SMTP integration (dev mode logs to console)
 */

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.isDevMode = process.env.NODE_ENV === 'development';
    this.smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    this.smtpPort = parseInt(process.env.SMTP_PORT || '587');
    this.smtpUser = process.env.SMTP_USER;
    this.smtpPass = process.env.SMTP_PASS;
    this.emailFrom = process.env.EMAIL_FROM || 'noreply@kensgames.com';
    this.recoveryLinkBase = process.env.RECOVERY_LINK_BASE || 'http://localhost:3000/reset-password';

    // Skip email entirely if SMTP creds are unconfigured placeholders
    this.disabled = !this.smtpUser || !this.smtpPass
      || this.smtpUser.includes('your-email') || this.smtpPass.includes('your-app');

    if (this.disabled) {
      console.log('📧 Email Service DISABLED — SMTP credentials not configured');
    } else if (this.isDevMode) {
      console.log('📧 Email Service in DEV mode - emails logged to console');
    } else {
      this.initializeTransporter();
    }
  }

  /**
   * Initialize Nodemailer transporter for production
   */
  initializeTransporter() {
    if (this.isDevMode || this.disabled) return;

    try {
      this.transporter = nodemailer.createTransport({
        host: this.smtpHost,
        port: this.smtpPort,
        secure: this.smtpPort === 465, // TLS for 587, SSL for 465
        auth: {
          user: this.smtpUser,
          pass: this.smtpPass
        }
      });

      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ Email transporter error:', error);
        } else {
          console.log('✅ Email transporter ready');
        }
      });
    } catch (error) {
      console.error('Email service initialization error:', error);
    }
  }

  /**
   * Send 6-digit OTP code for password reset
   */
  async sendOTPEmail(email, username, code) {
    try {
      const mailOptions = {
        from: this.emailFrom,
        to: email,
        subject: '🔐 KensGames Password Reset Code',
        html: `
          <div style="font-family:'Courier New',monospace;background:#0a0a1a;color:#00ffff;max-width:560px;margin:0 auto;padding:32px;border:1px solid #00ffff;">
            <h1 style="color:#ff00ff;text-align:center;letter-spacing:4px;margin-bottom:4px;">KENSGAMES</h1>
            <p style="color:#888;text-align:center;font-size:11px;letter-spacing:2px;margin-top:0;">PASSWORD RESET</p>
            <hr style="border:none;border-top:1px solid rgba(0,255,255,0.2);margin:20px 0;">
            <p>Hello <strong style="color:#ff00ff;">${this.escapeHtml(username)}</strong>,</p>
            <p>Your password reset code is:</p>
            <div style="text-align:center;margin:28px 0;">
              <span style="background:#0d0d2e;border:2px solid #ff00ff;color:#ff00ff;font-size:40px;font-weight:bold;letter-spacing:12px;padding:16px 28px;display:inline-block;">${this.escapeHtml(code)}</span>
            </div>
            <p style="color:#ff4d4d;font-size:13px;">⏰ Expires in 15 minutes. Do not share this code.</p>
            <p style="color:#666;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
            <hr style="border:none;border-top:1px solid rgba(0,255,255,0.1);margin:24px 0;">
            <p style="color:#444;font-size:11px;text-align:center;">© 2026 KensGames. All rights reserved.</p>
          </div>
        `,
        text: `KensGames Password Reset\n\nYour code: ${code}\n\nExpires in 15 minutes. Do not share this code.\n\nIf you didn't request this, ignore this email.`
      };
      return await this.sendEmail(mailOptions);
    } catch (error) {
      console.error('OTP email error:', error);
      throw error;
    }
  }

  /**
   * Send password recovery email
   */
  async sendPasswordRecoveryEmail(email, token, username) {
    try {
      const recoveryLink = `${this.recoveryLinkBase}?token=${token}&email=${encodeURIComponent(email)}`;

      const mailOptions = {
        from: this.emailFrom,
        to: email,
        subject: '🔐 KensGames Password Recovery',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #667eea; text-align: center;">KensGames Password Recovery</h1>

            <p>Hello <strong>${this.escapeHtml(username)}</strong>,</p>

            <p>We received a request to reset your password. Click the link below to proceed:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${recoveryLink}"
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 12px 30px;
                        text-decoration: none;
                        border-radius: 6px;
                        display: inline-block;
                        font-weight: bold;">
                Reset Password
              </a>
            </div>

            <p style="color: #666; font-size: 14px;">Or copy and paste this link:</p>
            <p style="background: #f5f5f5; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; color: #666;">
              ${recoveryLink}
            </p>

            <p style="color: #c33; font-size: 14px;">⏰ This link expires in 15 minutes.</p>

            <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              © 2026 KensGames. All rights reserved.
            </p>
          </div>
        `,
        text: `
          KensGames Password Recovery

          Hello ${username},

          We received a request to reset your password. Click the link below to proceed:

          ${recoveryLink}

          This link expires in 15 minutes.

          If you didn't request this, you can safely ignore this email.

          KensGames Team
        `
      };

      return await this.sendEmail(mailOptions);
    } catch (error) {
      console.error('Password recovery email error:', error);
      throw error;
    }
  }

  /**
   * Send email verification code
   */
  async sendVerificationEmail(email, username, verificationCode) {
    try {
      const verificationLink = `${this.recoveryLinkBase.replace('/reset-password', '')}/verify-email?email=${encodeURIComponent(email)}&username=${encodeURIComponent(username)}&code=${verificationCode}`;

      const mailOptions = {
        from: this.emailFrom,
        to: email,
        subject: '🎮 Verify Your KensGames Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #667eea; text-align: center;">🎮 Verify Your Email</h1>

            <p>Hello <strong>${this.escapeHtml(username)}</strong>,</p>

            <p>Welcome to KensGames! To activate your account, please verify your email using the code below:</p>

            <div style="text-align: center; margin: 30px 0;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 20px 30px;
                        border-radius: 6px;
                        display: inline-block;
                        font-weight: bold;
                        font-size: 32px;
                        letter-spacing: 4px;
                        tracking-wider: true;">
                ${verificationCode}
              </div>
            </div>

            <p style="text-align: center; color: #666; font-size: 14px;">
              Or use this link to verify:
            </p>
            <p style="text-align: center; margin: 20px 0;">
              <a href="${verificationLink}"
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 12px 30px;
                        text-decoration: none;
                        border-radius: 6px;
                        display: inline-block;
                        font-weight: bold;">
                Verify Email
              </a>
            </p>

            <p style="color: #999; font-size: 12px; text-align: center;">
              This code expires in 24 hours.
            </p>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Once verified, you'll be able to login and start playing!
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              © 2026 KensGames. All rights reserved.
            </p>
          </div>
        `,
        text: `
          Verify Your KensGames Email

          Hello ${username},

          Welcome to KensGames! To activate your account, please use this verification code:

          ${verificationCode}

          Or visit: ${verificationLink}

          This code expires in 24 hours.

          Once verified, you'll be able to login and start playing!

          KensGames Team
        `
      };

      return await this.sendEmail(mailOptions);
    } catch (error) {
      console.error('Verification email error:', error);
      throw error;
    }
  }

  /**
   * Send welcome email after registration
   */
  async sendWelcomeEmail(email, username) {
    try {
      const mailOptions = {
        from: this.emailFrom,
        to: email,
        subject: '🎮 Welcome to KensGames!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #667eea; text-align: center;">🎮 Welcome to KensGames!</h1>

            <p>Hello <strong>${this.escapeHtml(username)}</strong>,</p>

            <p>Your account has been successfully created! You're now ready to start playing.</p>

            <h2 style="color: #667eea; margin-top: 30px;">Available Games</h2>
            <ul style="font-size: 16px; line-height: 1.8;">
              <li><strong>🧱 BrickBreaker3D</strong> - Classic brick-breaker in stunning 3D</li>
              <li><strong>🚀 Space Combat</strong> - Intense multiplayer space warfare</li>
              <li><strong>🏎️ FastTrack</strong> - Multiplayer racing at breakneck speeds</li>
            </ul>

            <p style="margin-top: 30px;">
              <a href="http://localhost:3000/login"
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 12px 30px;
                        text-decoration: none;
                        border-radius: 6px;
                        display: inline-block;
                        font-weight: bold;">
                Login & Start Playing
              </a>
            </p>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              All your games are unified under one account. Track stats, earn medallions, and compete globally!
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              © 2026 KensGames. Powered by Manifold Mathematics.
            </p>
          </div>
        `,
        text: `
          Welcome to KensGames!

          Hello ${username},

          Your account has been successfully created! You're now ready to start playing.

          Available Games:
          - BrickBreaker3D: Classic brick-breaker in stunning 3D
          - Space Combat: Intense multiplayer space warfare
          - FastTrack: Multiplayer racing at breakneck speeds

          Visit http://localhost:3000/login to login and start playing.

          KensGames Team
        `
      };

      return await this.sendEmail(mailOptions);
    } catch (error) {
      console.error('Welcome email error:', error);
      throw error;
    }
  }

  /**
   * Internal method to send email
   * Logs to console in dev mode, sends via SMTP in production
   */
  async sendEmail(mailOptions) {
    if (this.disabled) {
      console.log('📧 [DISABLED] Skipping email to:', mailOptions.to, '| Subject:', mailOptions.subject);
      return { success: true, messageId: 'disabled', info: 'Email service not configured' };
    }

    if (this.isDevMode) {
      console.log('📧 [DEV MODE] Email would be sent:');
      console.log('   From:', mailOptions.from);
      console.log('   To:', mailOptions.to);
      console.log('   Subject:', mailOptions.subject);
      console.log('   Body (text):', mailOptions.text.substring(0, 100) + '...');
      return { success: true, messageId: 'dev-mode', info: 'Email logged to console' };
    }

    return new Promise((resolve, reject) => {
      this.transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Email send error:', error);
          reject(error);
        } else {
          console.log('✅ Email sent:', info.messageId);
          resolve({ success: true, messageId: info.messageId, info });
        }
      });
    });
  }

  /**
   * Escape HTML special characters
   * Prevents XSS in email templates
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

module.exports = EmailService;
