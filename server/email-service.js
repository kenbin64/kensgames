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

    if (this.isDevMode) {
      console.log('📧 Email Service in DEV mode - emails logged to console');
    } else {
      this.initializeTransporter();
    }
  }

  /**
   * Initialize Nodemailer transporter for production
   */
  initializeTransporter() {
    if (this.isDevMode) return;

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
